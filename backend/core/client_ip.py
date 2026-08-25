"""Resolve a client address without trusting spoofable forwarding headers."""

from ipaddress import IPv4Address, IPv6Address, ip_address, ip_network
from typing import Any

from core.config import settings

IPAddress = IPv4Address | IPv6Address


def _peer_from_scope(scope: dict[str, Any]) -> IPAddress | None:
    client = scope.get("client")
    if not client or not client[0]:
        return None
    try:
        return ip_address(str(client[0]))
    except ValueError:
        return None


def _header_from_scope(scope: dict[str, Any], name: str) -> str | None:
    wanted = name.lower().encode("latin-1")
    for key, value in scope.get("headers", []):
        if key.lower() == wanted:
            return value.decode("latin-1")
    return None


def resolve_client_ip(
    request_or_scope: Any,
    *,
    trusted_proxy_cidrs: list[str] | tuple[str, ...] | None = None,
    trusted_proxy_header: str | None = None,
    max_hops: int | None = None,
    max_header_bytes: int | None = None,
) -> str | None:
    """Return the safest client IP available for an ASGI request.

    A forwarding header is considered only when the directly connected peer is in a
    configured proxy network. Entries are checked from right to left, which prevents a
    caller from selecting an arbitrary left-most address by appending values.
    Malformed or oversized headers are ignored and the direct peer is returned.
    """

    scope = getattr(request_or_scope, "scope", request_or_scope)
    peer = _peer_from_scope(scope)
    if peer is None:
        return None

    cidrs = trusted_proxy_cidrs if trusted_proxy_cidrs is not None else settings.TRUSTED_PROXY_CIDRS
    try:
        networks = tuple(ip_network(cidr, strict=False) for cidr in cidrs)
    except ValueError:
        return str(peer)

    if not any(peer in network for network in networks):
        return str(peer)

    header_name = trusted_proxy_header or settings.TRUSTED_PROXY_HEADER
    value = _header_from_scope(scope, header_name)
    if not value:
        return str(peer)
    encoded_size = len(value.encode("utf-8"))
    if encoded_size > (max_header_bytes or settings.TRUSTED_PROXY_MAX_HEADER_BYTES):
        return str(peer)

    entries = [entry.strip() for entry in value.split(",")]
    if not entries or len(entries) > (max_hops or settings.TRUSTED_PROXY_MAX_HOPS):
        return str(peer)
    try:
        addresses = tuple(ip_address(entry) for entry in entries)
    except ValueError:
        return str(peer)

    for address in reversed(addresses):
        if any(address in network for network in networks):
            continue
        return str(address)

    # A fully trusted chain does not identify an external client. Returning the
    # left-most validated address is deterministic while retaining no unvalidated data.
    return str(addresses[0])
