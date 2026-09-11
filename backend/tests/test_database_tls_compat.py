import ssl
from pathlib import Path

import pytest
from pydantic import ValidationError

from core.config import Settings, settings

CA = Path(__file__).resolve().parents[2] / "deploy/oracle/certs/supabase-root-2021.crt"
FLAG = "DATABASE_TLS_SUPABASE_LEGACY_CA_COMPAT"


def values(**changes):
    result = settings.model_dump()
    result.update(DEBUG=True, DB_MODE="local", LOCAL_DATABASE_URL="postgresql://test:test@db.test/db",
                  DATABASE_TLS_MODE="verify-full", DATABASE_TLS_CA_BUNDLE_PATH=str(CA))
    result.update(changes)
    return result


def test_default_retains_strict_verification():
    config = Settings.model_validate(values())
    assert getattr(config, FLAG) is False
    context = config.database_async_tls_args["ssl"]
    assert isinstance(context, ssl.SSLContext)
    assert context.verify_flags & ssl.VERIFY_X509_STRICT
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname


def test_opt_in_removes_only_strict_flag():
    strict = Settings.model_validate(values()).database_async_tls_args["ssl"]
    assert isinstance(strict, ssl.SSLContext)
    config = Settings.model_validate(values(**{FLAG: True}))
    context = config.database_async_tls_args["ssl"]
    assert isinstance(context, ssl.SSLContext)
    assert context.verify_flags == strict.verify_flags & ~ssl.VERIFY_X509_STRICT
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname
    assert config.database_sync_tls_args == {"sslmode": "verify-full", "sslrootcert": str(CA)}


@pytest.mark.parametrize("mode", ["disable", "require"])
def test_opt_in_requires_verify_full(mode):
    with pytest.raises(ValidationError, match="verify-full"):
        Settings.model_validate(values(**{FLAG: True, "DATABASE_TLS_MODE": mode}))


@pytest.mark.parametrize("path", [None, "/missing/ca.pem"])
def test_opt_in_requires_readable_audited_ca(path):
    with pytest.raises(ValidationError, match="CA"):
        Settings.model_validate(values(**{FLAG: True, "DATABASE_TLS_CA_BUNDLE_PATH": path}))


@pytest.mark.parametrize("contents", [
    "not a certificate",
    CA.read_text() + CA.read_text(),
    ssl.DER_cert_to_PEM_cert(ssl.PEM_cert_to_DER_cert(CA.read_text())[:-1] + b"\x00"),
])
def test_opt_in_rejects_wrong_or_multiple_certificates(tmp_path, contents):
    ca = tmp_path / "wrong.pem"
    ca.write_text(contents)
    with pytest.raises(ValidationError, match="CA"):
        Settings.model_validate(values(**{FLAG: True, "DATABASE_TLS_CA_BUNDLE_PATH": str(ca)}))


def test_changed_ca_is_rejected_before_context_creation(tmp_path):
    ca = tmp_path / "ca.pem"
    ca.write_text(CA.read_text())
    config = Settings.model_validate(values(**{FLAG: True, "DATABASE_TLS_CA_BUNDLE_PATH": str(ca)}))
    ca.write_text("changed CA")
    with pytest.raises(ValueError, match="CA"):
        _ = config.database_async_tls_args


def test_simulated_verification_failure_propagates_without_retry(monkeypatch):
    config = Settings.model_validate(values(**{FLAG: True}))
    calls = 0

    def fail(**kwargs):
        nonlocal calls
        calls += 1
        raise ssl.SSLCertVerificationError("certificate verification failed")

    monkeypatch.setattr("core.config.ssl.create_default_context", fail)
    with pytest.raises(ssl.SSLCertVerificationError):
        _ = config.database_async_tls_args
    assert calls == 1
