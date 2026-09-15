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

## Production build

```bash
npm run build -w frontend
```

The generated `dist/` directory is served by the frontend Docker image. Leave `VITE_API_URL` empty when the bundled Nginx proxy and backend share the public origin; set it only when the API is hosted elsewhere. Docker builds accept it as a build argument:

```bash
docker compose build --build-arg VITE_API_URL=http://localhost:3333 frontend
```

## API conventions

Authenticated browser requests use the backend-issued HttpOnly session cookie plus the CSRF cookie/header pair, and send the first organization scope as `x-org-unit-id`. Bearer tokens remain available for non-browser integrations. The Sales screen is the first persisted vertical slice; its totals and state transitions are returned by the backend and remain correct after a page reload.
