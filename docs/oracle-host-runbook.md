# Oracle host deployment runbook

This runbook is for one host-native, one-worker API deployment. Replace every angle-bracket
placeholder before use; never put credentials in these tracked files, command history, or Caddy
configuration.

## Install and firewall

1. Create the unprivileged `peii` account and deploy the backend at `/opt/peii/backend` with its
   virtual environment at `/opt/peii/backend/.venv`.
2. Copy `deploy/oracle/peii-backend.service`, `peii-retention-purge.service`, and
   `peii-retention-purge.timer` to `/etc/systemd/system/`. Copy `deploy/oracle/Caddyfile` to
   `/etc/caddy/Caddyfile`.
3. Put `PEII_DOMAIN=<api-domain>` and `ACME_EMAIL=<operations-email>` in a root-owned Caddy
   environment file at `/etc/caddy/peii.env` with mode `0600`, then wire that exact file into
   Caddy with `systemctl edit caddy`:

   ```ini
   [Service]
   EnvironmentFile=/etc/caddy/peii.env
   ```

   Run `systemctl daemon-reload` after saving the drop-in. Put application settings only in
   `/etc/peii/backend.env`, owned by `root:root` with mode `0600`; systemd reads it before dropping
   to the `peii` account.
4. Allow only TCP 80 and 443 to Caddy at the host/cloud firewall. Do **not** expose port 8000,
   PostgreSQL, Redis, Adminer, or SSH to the public internet; restrict SSH to the operations
   network and use key-based access. Confirm Uvicorn is bound only to `127.0.0.1:8000`.
5. Run `systemctl daemon-reload` and validate Caddy. Defer API/Caddy startup until the
   one-time migration and checks in the release procedure below have completed. The Caddyfile
   removes client-supplied forwarding headers and replaces them;
   set `TRUSTED_PROXY_CIDRS=["127.0.0.1/32"]` only when Caddy is the immediate proxy. For any CDN or
    load balancer, verify its forwarding behavior and configure its exact immediate-proxy CIDRs.
    Keep Uvicorn `--no-proxy-headers`: FastAPI's `resolve_client_ip()` must see Caddy as the direct
    peer and is the sole component that interprets the replaced `X-Forwarded-For` header.
    Keep `/api/v1/ready` host-local at Caddy because each probe checks PostgreSQL and Redis;
    external uptime monitoring should use the dependency-free `/api/v1/health` liveness route.

## Required configuration and external services

- Use `DEBUG=false`, `DB_MODE=supabase`, exact HTTPS `BACKEND_CORS_ORIGINS`,
  `RATE_LIMIT_ENABLED=true`, `RATE_LIMIT_INCLUDE_CLIENT_IP=true`, and
  `RATE_LIMIT_READ_FAILURE_POLICY=fail_closed`.
- Set `DATABASE_TLS_MODE=verify-full`. Psycopg2/Alembic use `sslmode=verify-full`, and asyncpg
  uses a hostname-checking, certificate-verifying SSL context. Set
  `DATABASE_TLS_CA_BUNDLE_PATH` only when the provider requires a private or provider-specific
  CA bundle; otherwise the system trust store is used. The optional bundle must be readable by
  the `peii` API and protected migration identities.
- Configure Upstash with a secure HTTPS REST URL and token (or an approved `rediss://` endpoint).
  Test a rate-limited route and alert on Redis/rate-limit failures; never use an in-process
  fallback.
- Keep `CSV_EXPORT_ENABLED=false` in backend and frontend server environments for this release.
- In Supabase Dashboard **Authentication → JWT Settings**, set JWT expiry to **600–900 seconds**
  (10–15 minutes), record the selected value, and verify refresh/session behavior before launch.
- Remove the `public` schema from the Supabase Data API exposed schemas/tables and retain the
  database migration ACL/RLS checks as defense in depth. Never expose a service-role key to the
  browser.

## Release procedure

1. Verify backups/PITR restore steps, put the API in maintenance, drain writes, and stop old API
   processes. Capture the starting Alembic version.
2. For databases that have not yet applied `b43d56b55144`, run the read-only JSONB preflight
   before migration:

   ```bash
   psql "service=peii-migration" --file /opt/peii/backend/scripts/preflight_survey_question_jsonb.sql
   ```

   Configure the `peii-migration` libpq service and protected password file for the
   migration identity first; do not put a credential-bearing URL on the command line.
   The command must exit zero with no rows. Repair malformed values in a reviewed data-fix before
   continuing; do not modify the historical `b43d56b55144` migration.
3. From `/opt/peii/backend`, run `./.venv/bin/alembic heads`,
   then run `./.venv/bin/alembic upgrade head` **once** with the
   protected migration identity. Do not migrate independently from API replicas.
4. Run `./.venv/bin/alembic check` after the upgrade (a pending database cannot pass this
   check). Confirm revision `c1d2e3f4a5b6` is applied. Verify every application table has enabled,
    non-forced RLS, no policies, and no effective `PUBLIC`, `anon`, `authenticated`, or
    `service_role` table/column privileges. Only then run
    `systemctl enable --now peii-backend.service`, validate Caddy and enable its service. Verify
    `/api/v1/ready` locally and `/api/v1/health` through Caddy, then reopen traffic.

## Retention, logs, alerts, and rollback

Run the dry run with the same protected environment as the service. Enable the timer only
after the dry run, backup/restore rehearsal, and explicit approval of the real retention sweep
have been recorded. The enable command below starts future mutating purges:

```bash
sudo systemd-run --wait --collect --unit=peii-retention-dry-run \
  --uid=peii --gid=peii --working-directory=/var/lib/peii \
  --property=EnvironmentFile=/etc/peii/backend.env \
  --setenv=PYTHONPATH=/opt/peii/backend --setenv=HF_HOME=/var/lib/peii/huggingface \
  /opt/peii/backend/.venv/bin/python /opt/peii/backend/scripts/purge_expired_responses.py --dry-run
systemctl enable --now peii-retention-purge.timer
systemctl list-timers peii-retention-purge.timer
```

The timer targets one `Type=oneshot` service; systemd serializes starts of that unit so timer
firings do not overlap. Alert on a failed service, a missed timer run, zero/nonzero unexpected
purge volume, backlog growth, Caddy 5xx spikes, Uvicorn restarts, failed rate-limit reads,
database connection failures, and low disk space. Ship root-readable journald/Caddy logs to the
approved collector with request, authorization, cookies, tokens, response bodies, withdrawal
codes, and PII redacted; restrict log-reader access and set a documented retention period.

Both protected units use `StateDirectory=peii`, so systemd creates the writable runtime state at
`/var/lib/peii`. They run there while importing the read-only application from `/opt/peii/backend`;
the ML cache (`ml_cache.json`), false-positive training data (`ml_training_data.jsonl`), and Hugging
Face model cache (`/var/lib/peii/huggingface`) therefore remain writable under `ProtectSystem=strict`.
Do not make `/opt/peii/backend` writable to the service account.

For an incident, close ingress and preserve logs/metrics. Do not downgrade the fail-closed
lockdown migrations. Restore a validated backup/PITR copy into an isolated database, rehearse
`alembic upgrade head`, JSONB/RLS/ACL checks, and smoke tests, then promote only a reviewed
forward fix or the verified restored release.

## Runtime installation and persistent model files

Use Python **3.14.7** with `torch==2.14.0`, `transformers==5.16.1`, and
`greenlet==3.5.5`. `requirements.lock` contains generic version constraints and preserves
the non-GPU baseline versions. In a fresh virtual environment, install Torch first from the
selected official index, then the application requirements, from `backend/`:

```bash
./.venv/bin/pip install --no-deps torch==2.14.0 -c requirements.lock --index-url https://download.pytorch.org/whl/cpu
./.venv/bin/pip install -r requirements.txt -c requirements.lock
./.venv/bin/pip check
```

CPU is the default for ARM64 and x86_64. To select CUDA 13.0, replace the first command's
index with `https://download.pytorch.org/whl/cu130`; keep the same Torch release and
constraints. Use a fresh environment when switching variants because the existing build can
already satisfy `torch==2.14.0`. No architecture-specific wheel URL is embedded in the lock.

Docker performs the same two-stage installation using the `TORCH_INDEX_URL` build argument,
which defaults to the CPU index. On a configured NVIDIA host, select the CUDA index and GPU
reservation with:

```bash
docker compose -f docker-compose.yml -f docker-compose.cuda.yml up --build
```

This override requires compatible host GPU drivers and the NVIDIA container runtime. It
requests GPU access; it does not change ML source or prove inference uses a GPU. There is no
ARM-only build restriction. Official Python 3.14 CPU/CUDA wheels exist for ARM64 and x86_64,
but previous runtime evidence covers ARM64 CPU only. x86_64 and GPU hardware remain untested;
ARM CUDA dependency resolution also remains unverified after the earlier wheel-tag failure.
For each selected platform, require a clean `pip check`, imports, model download, and exact
cold/offline English/Tagalog sentiment and feedback comparison before acceptance. Keep one
worker because each worker loads another copy of the models.
Warm the models under the service identity with the service's `HF_HOME` and writable state
directory; verify a second restart can reuse them. Back up the feedback training JSONL and
cache files with restrictive permissions; they may contain survey text. Retain the exact release
and model provenance with the deployment evidence.

Local Compose uses `peii_ml_models` at `/var/cache/huggingface` and `peii_ml_state` at
`/var/lib/peii`, with `PYTHONPATH=/app`. Copy any required old `/app/ml_cache.json` or
`ml_training_data.jsonl` into the state volume before replacing the old container. Do not use
`docker compose down -v` for routine updates. Oracle uses its existing `/var/lib/peii`
StateDirectory instead of these Docker volumes.

## Provision secrets once and configure Vercel

Generate five independent random secrets of at least 32 bytes during provisioning, in a
protected password manager or an exclusive private file, and install them in the deployment
environment. Never generate secrets in startup commands, Dockerfiles, unit files, or builds.
Do not print secret values to terminal output or commit them. Keep stable backups: rotating
withdrawal or respondent HMAC secrets invalidates existing withdrawal/dedupe behavior and
requires an explicit incident plan.

| Key | Backend | Vercel server |
| --- | --- | --- |
| `RATE_LIMIT_KEY_HMAC_SECRET` | Yes | No |
| `WITHDRAWAL_CODE_HMAC_SECRET` | Yes | No |
| `SURVEY_RESPONDENT_HMAC_SECRET` | Yes | No |
| `SURVEY_OAUTH_STATE_KEY` | No | Yes |
| `PASSWORD_RESET_GRANT_SECRET` | Yes | Same value |

Set the Vercel project root to `frontend`, install with `npm ci`, and build with `npm run build`.
Allowlist only `NEXT_PUBLIC_API_URL=https://<api-domain>/api/v1`,
`BACKEND_INTERNAL_URL=https://<api-domain>/api/v1`, `APP_ORIGIN=https://<frontend-domain>`,
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, the two Vercel server secrets above,
`CSV_EXPORT_ENABLED=false`, and optional `NEXT_TELEMETRY_DISABLED=1`.
Never add database URLs, Redis credentials, or `SUPABASE_SECRET_KEY` to Vercel.
The Next wrapper preserves provider-supplied process environment values when root env files
are absent or contain local values. Do not upload the local root `.env` with the frontend.

Set the same exact HTTPS `APP_ORIGIN` on the backend and JSON
`BACKEND_CORS_ORIGINS=["https://<frontend-domain>"]`; configure exact provider callback URLs
for production. Preview origins require separately reviewed settings, never a wildcard. Keep
`DEBUG=false`, `CSV_EXPORT_ENABLED=false`, hostname-verified database TLS and fail-closed
Redis as specified above. Verify matching shared secrets without recording their values.

## Protected release commands and deployment-day evidence

The interactive shell does not inherit systemd's EnvironmentFile. Run migration commands
through a protected release job with `/etc/peii/migration.env` (root-owned `0600`, protected
migration database identity), for example:

```bash
sudo systemd-run --wait --collect --unit=peii-release-migration \
  --uid=peii --gid=peii --working-directory=/opt/peii/backend \
  --property=EnvironmentFile=/etc/peii/migration.env \
  /opt/peii/backend/.venv/bin/alembic upgrade head
```

Use the same protected environment for heads/current/check and the JSONB preflight. Do not
source application env files as shell scripts. Never pass database passwords on command lines.
Capture backup/PITR identifier and time before migration, then restore into an isolated target
and prove its revision, row counts, RLS/ACL and smoke tests before treating backups as usable.
Retain the previous code/dependency release and private environment backup. Roll back code only
when compatible with the migrated schema; otherwise keep ingress closed and apply a reviewed
forward fix or validated restore. Do not downgrade irreversible lockdown migrations.

Record dated pass/fail evidence and an owner for each launch gate: target-host dependency and
ML inference check; one worker and cache persistence after restart; protected migration and
restore rehearsal; local readiness and public liveness; exact CORS and HTTPS origins; docs-off,
HSTS and no-store through Vercel/Caddy; spoofed-forwarding rejection; Redis outage fail-closed
behavior; Google OAuth and invite/recovery/withdrawal browser flows; matching stable secrets;
CSV disabled on both hosts; approved consent/contact/retention policy; log redaction; and
approved retention dry run, mutation reconciliation and timer/alert evidence. Repository tests
and prepared templates do not establish these deployment-day outcomes. No live publication or
real-data retention run is authorized by this runbook alone.

Before uploading settings, validate separate private backend and frontend env files without
printing their contents (this is a static check, not a provider connectivity test):

```bash
backend/.venv/bin/python deploy/oracle/check-production-env.py \
  --backend-env /secure/backend.env --frontend-env /secure/frontend.env
```

The checker enforces this one-origin Oracle/Vercel topology, explicit frontend allowlisting,
matching reset-grant/Supabase settings, dedicated secrets, fail-closed Redis, CSV-off and
`verify-full`. It never provisions or rotates values. Run its synthetic regression checks with
`backend/.venv/bin/python deploy/oracle/check-production-env.check.py`.

After deploying the corrected canonical survey definition, inspect existing deployed surveys
without changing them, then apply only the exact known legacy notice correction:

```bash
cd /opt/peii/backend
./.venv/bin/python scripts/update_canonical_survey_notice.py
./.venv/bin/python scripts/update_canonical_survey_notice.py --confirm
```

The first command is mandatory dry-run evidence. The confirmed command targets only non-deleted
records with the exact canonical title and exact legacy paragraph, is idempotent, and writes an
audit event under the configured system actor. It does not relax normal survey history locks.

## Explicit legacy Supabase CA compatibility

Strict X.509 verification remains the default. The verified provider connection can reject the
legacy Supabase 2021 CA chain under Python 3.14's `VERIFY_X509_STRICT` checks. If that exact
provider-chain failure is confirmed, obtain explicit approval for this verification-policy
relaxation before enabling it in a private production environment. The proposed configuration is:

```text
DATABASE_TLS_MODE=verify-full
DATABASE_TLS_CA_BUNDLE_PATH=/etc/peii/certs/supabase-root-2021.crt
DATABASE_TLS_SUPABASE_LEGACY_CA_COMPAT=true
```

The bundled public CA is `deploy/oracle/certs/supabase-root-2021.crt`; Compose mounts that
certificate directory read-only at `/etc/peii/certs`. Install the same public file root-owned and
readable by the API and migration identities at that path on Oracle. Host-local commands must
use a host-readable path. The static environment checker reads and verifies the configured
file, so run it after installing the CA or against a staging environment file with a local path.

The accepted DER SHA-256 fingerprint is
`807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`.
Settings reject missing, changed, multiple, or unaudited certificates. Context construction
rechecks the fingerprint and loads the exact verified PEM bytes. This opt-in removes only
`VERIFY_X509_STRICT`, relaxing OpenSSL's additional certificate well-formedness checks across
the chain; it is a deliberate compatibility tradeoff, not merely an exception for one missing
extension. It retains `CERT_REQUIRED`, trusted-chain verification and hostname checking.
There is no generic retry, `CERT_NONE`, or hostname-verification bypass. Psycopg2/Alembic
continue to use `sslmode=verify-full` with this CA file.

The [official Supabase Studio certificate configuration](https://raw.githubusercontent.com/supabase/supabase/master/apps/studio/hooks/custom-content/custom-content.json)
still points to the [production 2021 CA](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt).
Record the observed verification error and approval with the release evidence. Prefer a newer
provider-issued compatible CA when available; do not expand the fingerprint allowlist as a
routine fix. When the provider chain supports strict verification, install the reviewed CA,
set this flag false, and verify sync/async database connections and readiness before rollout.
A live TLS connection remains a parent/operator release gate; static checks alone do not prove
provider trust or hostname correctness.

The automated compatibility tests cover configuration rejection, CA fingerprint enforcement,
verification flags, and propagation of a simulated verification failure. They do not establish
real wrong-hostname, expired-certificate, or unrelated-CA handshake rejection; record those
negative handshake checks as deployment evidence. Production opt-in approval is specific to
this TLS tradeoff and does not block ordinary strict-mode application tests.

Packaging diagnosis recorded 2026-09-11: the original container's `python -m pip check`
rejected `nvidia-cusparselt-cu13 0.8.1`, whose wheel tag is `manylinux2014_sbsa` rather than
standard aarch64. The standard Linux Torch package requires that CUDA dependency. The
[official CPU wheel index](https://download.pytorch.org/whl/cpu/torch/) provides the same
Torch release for CPython 3.14/aarch64 without CUDA requirements. Installing Torch from the
CPU index avoids that CUDA dependency for the default runtime. The generic lock keeps
`torch==2.14.0`; selecting a different index still requires rebuilt dependency and inference
acceptance and does not establish that the earlier ARM CUDA dependency issue is resolved.
