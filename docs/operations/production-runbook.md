# FlashERP Production Runbook

## Deployment boundary

Run one backend container and one frontend container on a single host. PostgreSQL is an external or managed PostgreSQL 16 instance; do not expose the database publicly. This is the supported RPO 24 hours / RTO 4 hours deployment profile.

Before the first deployment:

1. Create a production `.env` from `.env.example` with a unique database password. Leave `VITE_API_URL` empty for the bundled same-origin Nginx proxy; set it to the public API URL only when the API is hosted separately.
2. Set `CORS_ORIGINS` to the exact frontend origin(s), without a wildcard.
3. Confirm the reverse proxy terminates HTTPS. Session cookies are marked `Secure` when `NODE_ENV=production`.
4. Run `docker compose -f compose.production.yaml config` and review the rendered configuration.

## Release

```bash
docker compose -f compose.production.yaml build
docker compose -f compose.production.yaml up -d
docker compose -f compose.production.yaml ps
curl -fsS https://erp.example.com/ready
```

Migrations run during backend startup. If `/ready` does not become healthy, inspect `docker compose -f compose.production.yaml logs backend`, fix the migration or configuration issue, and keep the previous release available for rollback.

## Backup and restore

Take at least one daily logical backup and retain seven days. The backup must be stored outside the application host.

```bash
pg_dump --format=custom --no-owner --no-acl \
  --host "$DB_HOST" --port "${DB_PORT:-5432}" \
  --username "$DB_USER" --dbname "$DB_DATABASE" \
  --file "flash-erp-$(date +%F).dump"
```

For a restore drill, provision an isolated database, restore the dump, point a temporary backend at it, run `/ready`, and execute `npm run test:integration` against that database. Record the elapsed restore time; the target is four hours or less.

## Operations checks

- `/health` confirms the process is responding.
- `/ready` confirms the database connection and migrations are usable.
- Review structured `outbox` warnings. Events reaching `OUTBOX_MAX_ATTEMPTS` are dead-lettered and require investigation before replay.
- Audit rows are append-only and deduplicated by outbox event ID.
- Never edit accounting, inventory, or audit rows manually in production. Correct business data with the corresponding reversal or compensating transaction.

## Incident response

For a suspected data issue, stop write traffic, preserve logs and the latest dump, and record the request ID from the response header. Restore to an isolated database before attempting repair. For a failed release, stop the new backend, start the previous image, and do not roll back an already-applied migration without a reviewed forward migration.
