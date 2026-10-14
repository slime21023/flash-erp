# FlashERP Web Console

This directory contains the Svelte 5 frontend for FlashERP. It is a Vite single-page application; the backend remains the source of truth for authentication, permissions, business rules, totals, and document state.

## Development

From the repository root:

```bash
npm install
npm run dev -w frontend
```

The dev server runs on `http://localhost:5173` and proxies the backend at `http://localhost:3333` by default. Set `VITE_API_URL` before starting Vite when the API is elsewhere.

The backend must be running and an admin user must exist. Follow the root [README](../README.md) for PostgreSQL, migrations, and bootstrap instructions.

## Code quality

From the repository root:

```bash
npm run check:code
npm run format
npm run check -w frontend
```

The root Biome configuration formats frontend TypeScript, CSS, HTML, and complete Svelte components, including embedded scripts and styles. Biome lint is disabled for `.svelte` files; `svelte-check` handles their type and component diagnostics. Root `lint` and `check:code` both invoke the frontend `check` script, which also typechecks the Vite configuration. Run `npm run check -w frontend` for these frontend checks alone. Biome's Svelte parser and formatter remain experimental. Markdown, YAML, and SVG assets are outside the Biome formatting scope. See [CONTRIBUTING.md](../CONTRIBUTING.md#formatting--linting) for the shared rules and editor setup.

## Production build

```bash
npm run build -w frontend
```

The generated `dist/` directory is served by the frontend Docker image. Leave `VITE_API_URL` empty when the bundled Nginx proxy and backend share the public origin; set it only when the API is hosted elsewhere. Docker builds accept it as a build argument:

```bash
docker compose build --build-arg VITE_API_URL=http://localhost:3333 frontend
```

## API conventions

All business and identity endpoints use `/api`. The oRPC OpenAPI client in `src/lib/api.ts` imports the browser-safe contract from the backend source tree; Valibot schemas provide input/output types without separate frontend interfaces. The frontend Docker builder includes that shared source.

Authenticated browser requests include the HttpOnly session cookie and CSRF cookie/header pair. The client sends the cached session's first organization scope as `x-org-unit-id`; individual calls can override it with `{ context: { organizationUnitId, requestId } }`. HTTP 401 clears the browser session; HTTP 403 preserves it. Session storage contains only validated public session fields, and never an access token. Bearer tokens remain available for non-browser integrations.

`VITE_API_URL` is the backend origin, such as `http://localhost:3333`, without `/api`. OpenAPI contracts supply endpoint paths. The public probes stay at `/health` and `/ready`; API documentation is at `/api/docs`.
