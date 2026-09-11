"""Read separate deployment env files; report key names only, never secret values."""

import argparse
import hmac
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import dotenv_values

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from core.database_tls import read_supabase_legacy_ca  # noqa: E402

FRONTEND_KEYS = {
    "NEXT_PUBLIC_API_URL",
    "NEXT_TELEMETRY_DISABLED",
    "BACKEND_INTERNAL_URL",
    "APP_ORIGIN",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SURVEY_OAUTH_STATE_KEY",
    "PASSWORD_RESET_GRANT_SECRET",
    "CSV_EXPORT_ENABLED",
}
BACKEND_SECRETS = (
    "RATE_LIMIT_KEY_HMAC_SECRET",
    "WITHDRAWAL_CODE_HMAC_SECRET",
    "SURVEY_RESPONDENT_HMAC_SECRET",
    "PASSWORD_RESET_GRANT_SECRET",
)


def https(value: str, path: str | None = None) -> bool:
    try:
        url = urlsplit(value)
        _ = url.port  # Reject malformed ports without displaying the URL.
        return bool(
            url.scheme == "https"
            and url.hostname
            and not url.username
            and not url.password
            and not url.query
            and not url.fragment
            and "*" not in url.netloc
            and not any(c.isspace() for c in url.netloc)
            and (path is None or url.path == path)
        )
    except ValueError:
        return False


def validate(backend: dict[str, str], frontend: dict[str, str]) -> list[str]:
    errors: list[str] = []
    compatibility = backend.get("DATABASE_TLS_SUPABASE_LEGACY_CA_COMPAT", "false")
    if compatibility not in {"true", "false"}:
        errors.append("DATABASE_TLS_SUPABASE_LEGACY_CA_COMPAT: expected true or false")
    if compatibility == "true":
        try:
            read_supabase_legacy_ca(backend.get("DATABASE_TLS_CA_BUNDLE_PATH"))
        except ValueError:
            errors.append("DATABASE_TLS_SUPABASE_LEGACY_CA_COMPAT: audited CA file required")
    for key, expected in {
        "DEBUG": "false",
        "DB_MODE": "supabase",
        "DATABASE_TLS_MODE": "verify-full",
        "RATE_LIMIT_ENABLED": "true",
        "RATE_LIMIT_INCLUDE_CLIENT_IP": "true",
        "RATE_LIMIT_READ_FAILURE_POLICY": "fail_closed",
        "CSV_EXPORT_ENABLED": "false",
    }.items():
        if backend.get(key) != expected:
            errors.append(f"backend {key}: required production value missing")
    if frontend.get("CSV_EXPORT_ENABLED") != "false":
        errors.append("frontend CSV_EXPORT_ENABLED: must be false")
    if set(frontend) - FRONTEND_KEYS:
        errors.append(
            "frontend environment contains keys outside the explicit allowlist"
        )
    origin = backend.get("APP_ORIGIN", "")
    if not https(origin, "") or frontend.get("APP_ORIGIN") != origin:
        errors.append("APP_ORIGIN: backend/frontend must match one exact HTTPS origin")
    try:
        origins = json.loads(backend.get("BACKEND_CORS_ORIGINS", ""))
        if origins != [origin]:
            errors.append(
                "BACKEND_CORS_ORIGINS: must contain the exact production APP_ORIGIN"
            )
        if json.loads(backend.get("TRUSTED_PROXY_CIDRS", "")) != ["127.0.0.1/32"]:
            errors.append(
                "TRUSTED_PROXY_CIDRS: Oracle direct-Caddy topology requires loopback only"
            )
    except (ValueError, TypeError):
        errors.append("BACKEND_CORS_ORIGINS/TRUSTED_PROXY_CIDRS: invalid JSON")
    for key in ("NEXT_PUBLIC_API_URL", "BACKEND_INTERNAL_URL"):
        if not https(frontend.get(key, ""), "/api/v1"):
            errors.append(f"frontend {key}: must be an HTTPS API base ending /api/v1")
    if frontend.get("NEXT_PUBLIC_API_URL") != frontend.get("BACKEND_INTERNAL_URL"):
        errors.append("frontend API origins must match for this topology")
    for key in ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"):
        if not backend.get(key) or backend.get(key) != frontend.get(key):
            errors.append(f"{key}: backend/frontend must match")
    if not https(backend.get("SUPABASE_URL", "")):
        errors.append("SUPABASE_URL: HTTPS required")
    redis_rest = https(backend.get("UPSTASH_REDIS_REST_URL", "")) and bool(
        backend.get("UPSTASH_REDIS_REST_TOKEN")
    )
    try:
        redis_url = urlsplit(backend.get("REDIS_URL", ""))
        _ = redis_url.port
        redis_tls = redis_url.scheme == "rediss" and bool(redis_url.hostname)
    except ValueError:
        redis_tls = False
    if not redis_rest and not redis_tls:
        errors.append("Redis: secure complete REST pair or rediss URL required")
    secrets = [(key, backend.get(key, "")) for key in BACKEND_SECRETS]
    secrets.append(
        ("SURVEY_OAUTH_STATE_KEY", frontend.get("SURVEY_OAUTH_STATE_KEY", ""))
    )
    for key, value in secrets:
        if len(value.encode()) < 32 or any(
            marker in value.lower()
            for marker in ("replace", "placeholder", "example", "change-me")
        ):
            errors.append(f"{key}: dedicated provisioned secret required")
    if len({value for _, value in secrets}) != len(secrets):
        errors.append("HMAC secrets must be independently provisioned")
    if not hmac.compare_digest(
        backend.get("PASSWORD_RESET_GRANT_SECRET", "").encode(),
        frontend.get("PASSWORD_RESET_GRANT_SECRET", "").encode(),
    ):
        errors.append("PASSWORD_RESET_GRANT_SECRET: deployments do not match")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-env", type=Path, required=True)
    parser.add_argument("--frontend-env", type=Path, required=True)
    args = parser.parse_args()
    try:
        if not args.backend_env.is_file() or not args.frontend_env.is_file():
            raise OSError
        backend = {
            key: value or ""
            for key, value in dotenv_values(args.backend_env, interpolate=False).items()
        }
        frontend = {
            key: value or ""
            for key, value in dotenv_values(
                args.frontend_env, interpolate=False
            ).items()
        }
    except (OSError, UnicodeError):
        print("FAIL: cannot read the two deployment environment files")
        return 1
    errors = validate(backend, frontend)
    for error in errors:
        print(f"FAIL: {error}")
    if not errors:
        print(
            "PASS: static production environment contract; live provider checks still required"
        )
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
