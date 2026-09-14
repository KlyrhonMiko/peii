"""Synthetic checks only; no application or deployment environment is loaded."""

import runpy
import unittest
from pathlib import Path

validate = runpy.run_path(str(Path(__file__).with_name("check-production-env.py")))[
    "validate"
]


class ProductionEnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.backend = {
            "DEBUG": "false",
            "DB_MODE": "supabase",
            "DATABASE_TLS_MODE": "verify-full",
            "SUPABASE_DATABASE_URL": "postgresql://peii:secret@db.test/peii",
            "RATE_LIMIT_ENABLED": "true",
            "RATE_LIMIT_INCLUDE_CLIENT_IP": "true",
            "RATE_LIMIT_READ_FAILURE_POLICY": "fail_closed",
            "CSV_EXPORT_ENABLED": "false",
            "APP_ORIGIN": "https://portal.test",
            "BACKEND_CORS_ORIGINS": '["https://portal.test"]',
            "TRUSTED_PROXY_CIDRS": '["127.0.0.1/32"]',
            "REDIS_URL": "rediss://redis.test:6379",
            "SUPABASE_URL": "https://auth.test",
            "SUPABASE_PUBLISHABLE_KEY": "publishable-test",
            "GOOGLE_OAUTH_CLIENT_ID": "production-client-id.apps.googleusercontent.com",
            "RATE_LIMIT_KEY_HMAC_SECRET": "a" * 40,
            "WITHDRAWAL_CODE_HMAC_SECRET": "b" * 40,
            "SURVEY_RESPONDENT_HMAC_SECRET": "c" * 40,
            "PASSWORD_RESET_GRANT_SECRET": "d" * 40,
        }
        self.frontend = {
            key: self.backend[key]
            for key in (
                "APP_ORIGIN",
                "SUPABASE_URL",
                "SUPABASE_PUBLISHABLE_KEY",
                "PASSWORD_RESET_GRANT_SECRET",
                "CSV_EXPORT_ENABLED",
            )
        }
        self.frontend.update(
            {
                "SURVEY_OAUTH_STATE_KEY": "e" * 40,
                "BACKEND_INTERNAL_URL": "https://api.test/api/v1",
                "NEXT_PUBLIC_API_URL": "https://api.test/api/v1",
            }
        )

    def test_legacy_ca_opt_in_requires_audited_file(self):
        configured = {**self.backend, "DATABASE_TLS_SUPABASE_LEGACY_CA_COMPAT": "true"}
        self.assertTrue(validate(configured, self.frontend))
        configured["DATABASE_TLS_CA_BUNDLE_PATH"] = str(
            Path(__file__).with_name("certs") / "supabase-root-2021.crt"
        )
        self.assertEqual(validate(configured, self.frontend), [])
        configured["DATABASE_TLS_MODE"] = "require"
        self.assertTrue(validate(configured, self.frontend))

    def test_accepts_matching_production_contract(self):
        self.assertEqual(validate(self.backend, self.frontend), [])

    def test_rejects_unsafe_backend_settings_without_echoing_values(self):
        for key, value in {
            "DATABASE_TLS_MODE": "require",
            "RATE_LIMIT_READ_FAILURE_POLICY": "fail_open",
            "PASSWORD_RESET_GRANT_SECRET": "mismatch-sensitive-value-should-never-print",
            "BACKEND_CORS_ORIGINS": '["https://*.test"]',
            "REDIS_URL": "redis://redis.test",
            "TRUSTED_PROXY_CIDRS": '["10.0.0.0/8"]',
            "CSV_EXPORT_ENABLED": "true",
        }.items():
            with self.subTest(key=key):
                errors = validate({**self.backend, key: value}, self.frontend)
                self.assertTrue(errors)
                if key == "PASSWORD_RESET_GRANT_SECRET":
                    self.assertNotIn(value, "\n".join(errors))

    def test_rejects_frontend_secret_exposure_and_wildcard_origins(self):
        self.assertTrue(
            validate(self.backend, {**self.frontend, "SUPABASE_SECRET_KEY": "private"})
        )
        self.assertTrue(
            validate(self.backend, {**self.frontend, "APP_ORIGIN": "https://*.test"})
        )
        self.assertTrue(
            validate(
                self.backend, {**self.frontend, "SURVEY_OAUTH_STATE_KEY": "a" * 40}
            )
        )

    def test_rejects_incomplete_upstash_pair_even_with_rediss_fallback(self):
        for overrides in (
            {"UPSTASH_REDIS_REST_URL": "https://cache.upstash.io"},
            {"UPSTASH_REDIS_REST_TOKEN": "token"},
        ):
            with self.subTest(overrides=overrides):
                self.assertTrue(validate({**self.backend, **overrides}, self.frontend))

    def test_rejects_invalid_complete_upstash_pair_even_with_rediss_fallback(self):
        for url in (
            "http://cache.upstash.io",
            "https://cache.example.net",
            "https://cache.upstash.io/path",
        ):
            with self.subTest(url=url):
                configured = {
                    **self.backend,
                    "UPSTASH_REDIS_REST_URL": url,
                    "UPSTASH_REDIS_REST_TOKEN": "token",
                }
                self.assertTrue(validate(configured, self.frontend))

    def test_accepts_valid_upstash_pair_without_rediss_fallback(self):
        configured = {
            **self.backend,
            "UPSTASH_REDIS_REST_URL": "https://cache.upstash.io",
            "UPSTASH_REDIS_REST_TOKEN": "token",
            "REDIS_URL": "",
        }
        self.assertEqual(validate(configured, self.frontend), [])

    def test_rejects_wrong_database_schemes_and_google_placeholder(self):
        self.assertTrue(
            validate(
                {**self.backend, "SUPABASE_DATABASE_URL": "sqlite:///peii.db"},
                self.frontend,
            )
        )
        self.assertTrue(
            validate(
                {**self.backend, "READ_REPLICA_DATABASE_URL": "https://db.test/peii"},
                self.frontend,
            )
        )
        self.assertTrue(
            validate(
                {**self.backend, "GOOGLE_OAUTH_CLIENT_ID": "replace-with-client-id"},
                self.frontend,
            )
        )


if __name__ == "__main__":
    unittest.main()
