# FlashERP

FlashERP is a modular-monolith ERP for a single enterprise. The application is
TypeScript-first, runs on AdonisJS v7+, and uses PostgreSQL with Lucid ORM.

## Development setup

```bash
npm ci
copy .env.example .env
node ace generate:key
npm run typecheck
npm run lint
npm run test:unit
```

The database-backed Adonis commands require PostgreSQL configured through the
`DB_*` variables in `.env`.

## Architecture

- `app/platform/` contains framework-neutral functional primitives and
  immutable domain value objects, workflow primitives, and boundary adapters.
- `app/modules/<name>/contracts/` is the only public surface of a business
  module.
- `app/modules/<name>/services/` and `models/` remain private to the module.
- `database/migrations/modules/` contains migrations grouped by module.
- `tests/unit/platform/` contains property-based tests for platform invariants.

Business failures are represented by `Result.err(new DomainError(...))`.
Controllers should adapt validated input and delegate results to the HTTP
presenter; they must not contain business exception handling.
