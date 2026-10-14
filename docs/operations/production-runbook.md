# FlashERP Production Runbook

## Deployment boundary

Run one backend container and one frontend container on a single host. PostgreSQL is an external or managed PostgreSQL 16 instance; do not expose the database publicly. This is the supported RPO 24 hours / RTO 4 hours deployment profile.

For shared business terminology, see the [FlashERP glossary](../terminology.md). Technical operating terms are defined here alongside the relevant procedures.

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

The PO approval migration adds a stored approval snapshot. Existing `DRAFT` POs have no recoverable approval history and start again at manager review on their first approval request. Existing `APPROVED` POs remain approved. Release the backend and frontend together so the UI reads the current step and submits its ID.

## Provision a PO approver

`ADMIN` grants API permissions, not approval-stage authority. Assign `MANAGER` or `DIRECTOR` explicitly; bootstrap does not assign either role. Every PO starts with manager review. POs totaling at least 100,000 minor units also require director review afterward. An ADMIN with only `DIRECTOR` cannot approve the initial manager step. Choose the role for the person's responsibility; do not automatically assign both roles.

There is currently no role-management API. Use the transaction below with an authorized database operator. It looks up an active user by username, accepts exactly one approval role, creates that role if absent, and assigns it idempotently. It also grants that role only `procurement.order.read` and `procurement.order.approve`, and grants the selected user access to one existing company. Roles apply across the user's organization scopes. The bootstrap ADMIN already has these permissions and `org-root` scope; non-admin approvers need both permissions and the specific company scope.

Set the username, one role code, and the company ID explicitly, then paste the SQL into the resulting `psql` session:

```bash
psql --host "$DB_HOST" --port "${DB_PORT:-5432}" \
  --username "$DB_USER" --dbname "$DB_DATABASE" \
  --set=ON_ERROR_STOP=on --set=approver_username=admin \
  --set=approval_role=MANAGER --set=company_id=org-root
```

```sql
BEGIN;
SELECT set_config('flasherp.approver_username', :'approver_username', true),
       set_config('flasherp.approval_role', :'approval_role', true),
       set_config('flasherp.approval_company', :'company_id', true);

DO $$
DECLARE
  selected_user_id text;
  selected_role_id text;
  selected_company_id text;
  selected_role_code text := current_setting('flasherp.approval_role');
BEGIN
  IF selected_role_code NOT IN ('MANAGER', 'DIRECTOR') THEN
    RAISE EXCEPTION 'Choose exactly one role: MANAGER or DIRECTOR';
  END IF;
  SELECT id INTO STRICT selected_user_id
    FROM local_users
    WHERE username = lower(trim(current_setting('flasherp.approver_username')))
      AND is_active;
  SELECT id INTO STRICT selected_company_id
    FROM organization_units
    WHERE id = current_setting('flasherp.approval_company') AND kind = 'COMPANY';

  INSERT INTO roles (id, code, name)
    VALUES ('role-' || lower(selected_role_code), selected_role_code, selected_role_code)
    ON CONFLICT (code) DO NOTHING;
  SELECT id INTO STRICT selected_role_id FROM roles WHERE code = selected_role_code;
  INSERT INTO permissions (code, description)
    VALUES ('procurement.order.read', 'procurement.order.read'),
           ('procurement.order.approve', 'procurement.order.approve')
    ON CONFLICT (code) DO NOTHING;
  INSERT INTO role_permissions (role_id, permission_code)
    VALUES (selected_role_id, 'procurement.order.read'),
           (selected_role_id, 'procurement.order.approve')
    ON CONFLICT (role_id, permission_code) DO NOTHING;
  INSERT INTO user_roles (user_id, role_id)
    VALUES (selected_user_id, selected_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  INSERT INTO user_organization_scopes (user_id, organization_unit_id)
    VALUES (selected_user_id, selected_company_id)
    ON CONFLICT (user_id, organization_unit_id) DO NOTHING;
END;
$$;
COMMIT;
```

Missing/inactive users, unknown companies, invalid role codes, or other SQL errors abort the transaction. Role assignments take effect on the next authenticated request; refresh the browser to reload session metadata. A missing stage role returns `UNAUTHORIZED_APPROVER` with HTTP 403 and preserves the session. A stale step returns `INVALID_APPROVAL_STEP` with HTTP 409; reload the PO before deciding again. HTTP 401 means authentication failed and clears the browser session. Invalid stored approval state returns a generic HTTP 500; investigate the record rather than restarting its workflow manually.

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
