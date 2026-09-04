"""Redis-backed fixed-window rate limiting and reusable FastAPI dependencies."""

import asyncio
import hmac
from dataclasses import dataclass
from hashlib import sha256
from typing import Any

import httpx
from fastapi import Request

from core.client_ip import resolve_client_ip
from core.config import settings
from core.exceptions import RateLimitExceeded, RedisUnavailableError

try:  # Keep local tests usable before the optional runtime dependency is installed.
    from redis.asyncio import Redis
except ModuleNotFoundError:  # pragma: no cover - exercised only in minimal environments
    Redis = Any  # type: ignore[misc,assignment]

FIXED_WINDOW_LUA = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
if count > tonumber(ARGV[2]) then
  return {0, count, ttl}
end
return {1, count, ttl}
"""


@dataclass(frozen=True)
class RateLimitPolicy:
    name: str
    limit: int
    window_seconds: int
    read_only: bool = False


class UpstashRedisRestClient:
    """Small async Redis REST client exposing the eval surface used by the limiter."""

    def __init__(
        self,
        url: str,
        token: str,
        *,
        max_connections: int = 32,
        connect_timeout_seconds: float = 2.0,
        socket_timeout_seconds: float = 2.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {token}"},
            limits=httpx.Limits(
                max_connections=max_connections,
                max_keepalive_connections=max_connections,
            ),
            timeout=httpx.Timeout(
                connect=connect_timeout_seconds,
                read=socket_timeout_seconds,
                write=socket_timeout_seconds,
                pool=connect_timeout_seconds,
            ),
            transport=transport,
        )
        self._url = url

    async def eval(self, script: str, numkeys: int, *args: object) -> Any:
        command: list[object] = ["EVAL", script, numkeys, *args]
        try:
            response = await self._client.post(self._url, json=command)
            response.raise_for_status()
            payload = response.json()
        except Exception:
            raise RuntimeError("Upstash Redis request failed") from None

        if not isinstance(payload, dict) or "error" in payload or "result" not in payload:
            raise RuntimeError("Upstash Redis returned an invalid response")
        result = payload["result"]
        if not isinstance(result, list) or len(result) != 3:
            raise RuntimeError("Upstash Redis returned an invalid result")
        try:
            tuple(int(value) for value in result)
        except (TypeError, ValueError):
            raise RuntimeError("Upstash Redis returned an invalid result") from None
        return result

    async def aclose(self) -> None:
        await self._client.aclose()


def build_rate_limit_key(policy_name: str, identifier: str, secret: str) -> str:
    """Build a Redis key containing only a keyed digest of the raw identity."""

    digest = hmac.new(secret.encode("utf-8"), identifier.encode("utf-8"), sha256).hexdigest()
    return f"peii:rate-limit:{policy_name}:{digest}"


def normalize_rate_limit_identifier(identifier: str) -> str:
    return identifier.strip().casefold()


class FixedWindowRateLimiter:
    def __init__(
        self,
        redis_client: Any,
        *,
        secret: str | None = None,
        settings_obj: Any = None,
        settings: Any = None,
    ) -> None:
        self.redis = redis_client
        config = settings_obj or settings or globals()["settings"]
        self.secret = secret if secret is not None else getattr(
            config, "RATE_LIMIT_KEY_HMAC_SECRET", None
        )
        self.settings = config

    async def check(
        self,
        policy_name: str,
        identifiers: list[str] | tuple[str, ...],
        *,
        limit: int,
        window_seconds: int,
        read_only: bool = False,
        read_failure_policy: str | None = None,
    ) -> None:
        if not getattr(self.settings, "RATE_LIMIT_ENABLED", True):
            return
        if not self.secret:
            raise RedisUnavailableError()
        secret = self.secret

        failure_policy = "fail_closed"
        if read_only:
            configured_failure_policy = str(
                getattr(self.settings, "RATE_LIMIT_READ_FAILURE_POLICY", "fail_closed")
            )
            failure_policy = read_failure_policy or configured_failure_policy

        async def check_identifier(identifier: str) -> None:
            key = build_rate_limit_key(policy_name, identifier, secret)
            try:
                result = await self.redis.eval(
                    FIXED_WINDOW_LUA,
                    1,
                    key,
                    str(window_seconds),
                    str(limit),
                )
            except Exception as exc:
                if read_only and failure_policy == "fail_open":
                    return None
                raise RedisUnavailableError() from exc

            allowed, _count, retry_after = (int(value) for value in result)
            if not allowed:
                raise RateLimitExceeded(max(1, retry_after))
            return None

        outcomes = await asyncio.gather(
            *(check_identifier(identifier) for identifier in identifiers),
            return_exceptions=True,
        )
        # Preserve first-offender ordering: buckets are checked in identifier order.
        for outcome in outcomes:
            if isinstance(outcome, BaseException):
                raise outcome


class RedisRateLimitLifecycle:
    """Own the process-wide bounded Redis client used by rate-limit dependencies."""

    def __init__(self) -> None:
        self.client: Any = None
        self.limiter: FixedWindowRateLimiter | None = None

    async def start(self) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return
        try:
            upstash_url = getattr(settings, "UPSTASH_REDIS_REST_URL", None)
            upstash_token = getattr(settings, "UPSTASH_REDIS_REST_TOKEN", None)
            if upstash_url and upstash_token:
                self.client = UpstashRedisRestClient(
                    upstash_url,
                    upstash_token,
                    max_connections=settings.REDIS_MAX_CONNECTIONS,
                    connect_timeout_seconds=settings.REDIS_CONNECT_TIMEOUT_SECONDS,
                    socket_timeout_seconds=settings.REDIS_SOCKET_TIMEOUT_SECONDS,
                )
            else:
                from redis import asyncio as redis_asyncio

                self.client = redis_asyncio.from_url(
                    settings.REDIS_URL,
                    max_connections=settings.REDIS_MAX_CONNECTIONS,
                    socket_connect_timeout=settings.REDIS_CONNECT_TIMEOUT_SECONDS,
                    socket_timeout=settings.REDIS_SOCKET_TIMEOUT_SECONDS,
                    decode_responses=False,
                )
            self.limiter = FixedWindowRateLimiter(
                self.client,
                secret=settings.RATE_LIMIT_KEY_HMAC_SECRET,
                settings_obj=settings,
            )
        except Exception:
            # Connection errors are handled at request time so read/write policy is
            # applied consistently instead of making the process impossible to start.
            self.client = None
            self.limiter = FixedWindowRateLimiter(
                _UnavailableRedis(),
                secret=settings.RATE_LIMIT_KEY_HMAC_SECRET,
                settings_obj=settings,
            )

    async def stop(self) -> None:
        if self.client is not None:
            await self.client.aclose()
        self.client = None
        self.limiter = None


class _UnavailableRedis:
    async def eval(self, *_args: object) -> None:
        raise ConnectionError("Redis client is unavailable")


redis_lifecycle = RedisRateLimitLifecycle()


def get_rate_limiter() -> FixedWindowRateLimiter:
    if redis_lifecycle.limiter is not None:
        return redis_lifecycle.limiter
    return FixedWindowRateLimiter(
        _UnavailableRedis(),
        secret=settings.RATE_LIMIT_KEY_HMAC_SECRET,
        settings_obj=settings,
    )


def rate_limit_policy(name: str) -> RateLimitPolicy:
    policies = {
        "public-read": RateLimitPolicy(
            name,
            settings.PUBLIC_SURVEY_READ_LIMIT,
            settings.PUBLIC_SURVEY_READ_WINDOW_SECONDS,
            True,
        ),
        "public-read-global": RateLimitPolicy(
            name,
            settings.PUBLIC_SURVEY_READ_GLOBAL_LIMIT,
            settings.PUBLIC_SURVEY_READ_GLOBAL_WINDOW_SECONDS,
            True,
        ),
        "public-submit": RateLimitPolicy(
            name,
            settings.PUBLIC_SURVEY_SUBMIT_LIMIT,
            settings.PUBLIC_SURVEY_SUBMIT_WINDOW_SECONDS,
        ),
        "public-submit-global": RateLimitPolicy(
            name,
            settings.PUBLIC_SURVEY_SUBMIT_GLOBAL_LIMIT,
            settings.PUBLIC_SURVEY_SUBMIT_GLOBAL_WINDOW_SECONDS,
        ),
        "public-withdrawal-client": RateLimitPolicy(
            name,
            settings.PUBLIC_SURVEY_WITHDRAWAL_CLIENT_LIMIT,
            settings.PUBLIC_SURVEY_WITHDRAWAL_CLIENT_WINDOW_SECONDS,
        ),
        "public-withdrawal-global": RateLimitPolicy(
            name,
            settings.PUBLIC_SURVEY_WITHDRAWAL_GLOBAL_LIMIT,
            settings.PUBLIC_SURVEY_WITHDRAWAL_GLOBAL_WINDOW_SECONDS,
        ),
        "login": RateLimitPolicy(
            name, settings.LOGIN_RATE_LIMIT, settings.LOGIN_RATE_WINDOW_SECONDS
        ),
        "login-global": RateLimitPolicy(
            name, settings.LOGIN_GLOBAL_LIMIT, settings.LOGIN_GLOBAL_WINDOW_SECONDS
        ),
        "password-recovery": RateLimitPolicy(
            name,
            settings.PASSWORD_RECOVERY_RATE_LIMIT,
            settings.PASSWORD_RECOVERY_RATE_WINDOW_SECONDS,
        ),
        "password-recovery-global": RateLimitPolicy(
            name,
            settings.PASSWORD_RECOVERY_GLOBAL_LIMIT,
            settings.PASSWORD_RECOVERY_GLOBAL_WINDOW_SECONDS,
        ),
        "google-survey-attest": RateLimitPolicy(
            name,
            settings.GOOGLE_SURVEY_ATTEST_RATE_LIMIT,
            settings.GOOGLE_SURVEY_ATTEST_RATE_WINDOW_SECONDS,
        ),
    }
    try:
        return policies[name]
    except KeyError as exc:
        raise ValueError(f"Unknown rate-limit policy: {name}") from exc


def rate_limit_identifiers(resource_identifier: str, request: Any) -> list[str]:
    """Build privacy-preserving buckets for a rate-limited resource.

    Resource identifiers are always included. Client IP is opt-in because a shared
    frontend egress address can otherwise throttle unrelated users together.
    """

    identifiers: list[str] = []
    if settings.RATE_LIMIT_INCLUDE_CLIENT_IP:
        client_ip = resolve_client_ip(request)
        identifiers.append(f"ip:{client_ip or 'unknown'}")
    identifiers.append(resource_identifier)
    return identifiers


async def enforce_rate_limit(
    policy: RateLimitPolicy,
    identifiers: list[str] | tuple[str, ...],
    *,
    limiter: FixedWindowRateLimiter | None = None,
    read_failure_policy: str | None = None,
) -> None:
    active_limiter = limiter or get_rate_limiter()
    await active_limiter.check(
        policy.name,
        identifiers,
        limit=policy.limit,
        window_seconds=policy.window_seconds,
        read_only=policy.read_only,
        read_failure_policy=read_failure_policy,
    )


async def _raise_first_outcome(outcomes: tuple[BaseException | None, ...]) -> None:
    for outcome in outcomes:
        if isinstance(outcome, BaseException):
            raise outcome


async def enforce_identifier_rate_limit(policy_name: str, identifier: str) -> None:
    """Apply an identity bucket and a separate, materially higher global breaker.

    The buckets are evaluated concurrently, so a rejected identity bucket also
    increments the global breaker for the attempt (floods still push it). The
    outcome raised is whichever bucket first exceeds its limit.
    """
    outcomes = await asyncio.gather(
        enforce_rate_limit(rate_limit_policy(policy_name), [identifier]),
        enforce_rate_limit(
            rate_limit_policy(f"{policy_name}-global"), [f"{policy_name}-global"]
        ),
        return_exceptions=True,
    )
    await _raise_first_outcome(outcomes)


async def enforce_authenticated_survey_rate_limit(
    policy_name: str,
    auth_user_id: object,
    session_id: object,
    survey_id: str,
) -> None:
    """Apply a verified respondent/session/survey bucket and a global breaker."""
    identifier = f"subject:{auth_user_id}:session:{session_id}:survey:{survey_id}"
    outcomes = await asyncio.gather(
        enforce_rate_limit(rate_limit_policy(policy_name), [identifier]),
        enforce_rate_limit(
            rate_limit_policy(f"{policy_name}-global"), [f"{policy_name}-global"]
        ),
        return_exceptions=True,
    )
    await _raise_first_outcome(outcomes)


async def check_google_survey_attestation(
    request: Request,
    *,
    subject: object,
    session_id: object | None,
) -> None:
    """Rate-limit an attestation by verified Supabase subject and session only."""
    identifiers = [
        f"subject:{subject}",
        f"session:{session_id or 'missing'}",
    ]
    await enforce_rate_limit(
        rate_limit_policy("google-survey-attest"),
        identifiers,
    )


def _public_survey_identifiers(request: Any, survey_id: str) -> list[str]:
    return rate_limit_identifiers(f"survey:{survey_id}", request)


async def check_public_survey_read(request: Request, survey_id: str) -> None:
    await enforce_rate_limit(
        rate_limit_policy("public-read"), _public_survey_identifiers(request, survey_id)
    )


async def check_public_survey_submit(request: Request, survey_id: str) -> None:
    await enforce_rate_limit(
        rate_limit_policy("public-submit"), _public_survey_identifiers(request, survey_id)
    )


async def check_public_survey_withdrawal(request: Request) -> None:
    """Rate-limit code guesses without reading or logging the request body."""
    if settings.RATE_LIMIT_INCLUDE_CLIENT_IP:
        client_ip = resolve_client_ip(request)
        await enforce_rate_limit(
            rate_limit_policy("public-withdrawal-client"),
            [f"ip:{client_ip or 'unknown'}"],
        )
    await enforce_rate_limit(
        rate_limit_policy("public-withdrawal-global"), ["withdrawal-global"]
    )


# Short aliases make these dependencies convenient to import from the public survey router.
public_survey_read_rate_limit = check_public_survey_read
public_survey_submit_rate_limit = check_public_survey_submit
public_survey_withdrawal_rate_limit = check_public_survey_withdrawal
