"""Narrow opt-in for the audited legacy Supabase root; never disable peer verification."""
import hashlib
import ssl
from pathlib import Path

SUPABASE_LEGACY_CA_SHA256 = "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa"


def read_supabase_legacy_ca(ca_path: str | None) -> str:
    if not ca_path:
        raise ValueError("Legacy Supabase compatibility requires a configured CA file")
    try:
        pem = Path(ca_path).read_text(encoding="ascii").strip()
        if (pem.count("-----BEGIN CERTIFICATE-----") != 1
                or not pem.startswith("-----BEGIN CERTIFICATE-----")
                or not pem.endswith("-----END CERTIFICATE-----")):
            raise ValueError("Expected one CA certificate")
        der = ssl.PEM_cert_to_DER_cert(pem)
        if hashlib.sha256(der).hexdigest() != SUPABASE_LEGACY_CA_SHA256:
            raise ValueError("Unaudited CA certificate")
    except (OSError, UnicodeError, ValueError) as error:
        raise ValueError("Legacy Supabase compatibility requires the audited 2021 CA") from error
    return pem
