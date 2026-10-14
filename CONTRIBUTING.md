# Contributing to FlashERP

Thank you for your interest in contributing to **FlashERP**! FlashERP is an open-source, high-reliability Enterprise Resource Planning system built on a **Modular Monolith** architecture with **NestJS**, **TypeORM**, **PostgreSQL**, and **Svelte 5**.

---

## 1. Code of Conduct

We are committed to providing a friendly, safe, and welcoming environment for all contributors, regardless of experience level, background, or identity. Please be respectful and constructive in all discussions, issues, and pull requests.

---

## 2. Core Architecture Guardrails

Before writing or submitting any code, you **must strictly adhere** to the following architecture rules:

1. **Strict Module Encapsulation**:
   - Cross-module dependencies are **strictly limited to `src/modules/<name>/contracts/`**.
   - Direct imports of other modules' `services/`, `entities/`, or `models/` are strictly forbidden and will be rejected by our automated boundary checker:
     ```bash
     npm run architecture:check
     ```
2. **Railway-Oriented Programming (ROP)**:
   - Domain use cases and contract methods **must return `Promise<Result<T, DomainError>>`**.
   - Do **not** throw business exceptions. Use `ok(value)` or `err(new SpecificDomainError())`.
3. **Immutability & Precision**:
   - Monetary values must use `Money` (integer minor units). Never use native JavaScript floating-point numbers for money or currency calculations.
   - Quantities must use `Quantity` (scaled integer representation).
4. **Transaction Propagation**:
   - Multi-table writes and cross-module transactions must be wrapped in `runInTransaction(manager, options, async (client) => ...)` and pass `{ client }` down to sub-calls.
5. **Property-Based Testing (PBT)**:
   - Core algorithms, monetary allocations, and accounting invariants must include property-based tests using `fast-check` with at least 1,000 runs per property.

---

## 3. Development Workflow

### Prerequisites

- Node.js >= 22.0.0
- Docker & Docker Compose (optional, for local PostgreSQL)

### Setup & Run

```bash
# 1. Clone repository
git clone https://github.com/slime21023/flash-erp.git
cd FlashERP

# 2. Install dependencies for all workspaces
npm install

# 3. Environment configuration
cp .env.example .env

# 4. Start local PostgreSQL (port 5433 by default)
docker compose up -d postgres

# 5. Run automated unit and property-based test suite
npm test

# 6. Run PostgreSQL integration tests against the isolated flash_erp_test database
npm run test:integration

# 7. Initialize administrative bootstrap
$env:ADMIN_PASSWORD = 'change-this-before-use'
npm run seed:admin

# 8. Start backend development server (port 3333)
npm run start:dev

# 9. Start frontend Svelte console (port 5173)
npm run dev -w frontend
```

### Formatting & Linting

Biome 2.5.15 formats JavaScript, TypeScript, JSON/JSONC, CSS, HTML, and Svelte. Biome lints supported files except `.svelte`; `svelte-check` owns Svelte type and component diagnostics. Run these commands from the repository root:

```bash
npm run format       # Apply formatting
npm run lint         # Biome lint plus Svelte/frontend checks
npm run format:check # Check formatting without changing files
npm run check:code   # Biome formatting/lint plus Svelte/frontend checks
```

Formatting uses two spaces, single JavaScript quotes, a 100-column target, and semicolons only when needed. Generated output, dependency directories, lockfiles, and SVG assets are excluded. Markdown and YAML are not currently supported by Biome and remain manually maintained.

The Biome lint configuration explicitly migrates the previous rule policy rather than enabling a new blanket preset. Explicit `any`, unused variables, and console output remain allowed in Biome; TypeScript compiler-covered rules stay delegated to `npm run typecheck` and the frontend checks. The migration does not provide exact replacements for ESLint's `no-new-symbol`, TypeScript-specific `no-unused-expressions`, or `triple-slash-reference` rules.

NestJS parameter decorators are enabled in the parser. Biome's full Svelte parser and formatter remain experimental upstream, but Biome lint is disabled for `.svelte` files. Both `npm run lint` and `npm run check:code` invoke the existing frontend `check` script (`svelte-check` followed by the Vite-config TypeScript check); `npm run check -w frontend` is also available independently. CI runs these frontend checks through the lint step rather than repeating them during the build. Import-organizing assists are disabled so formatting does not reorder imports. Editor users can select the `biomejs.biome` extension as their formatter while retaining the Svelte extension for language support.

---

## 4. Scaffolding a New Module

To scaffold a new business domain module following our modular monolith standards, run:

```bash
npm run make:module <module_name>
```

This generates the compliant structure (`contracts/`, `entities/`, `services/`, `controllers/`, `dto/`, and `manifest.ts`).

---

## 5. Submitting a Pull Request (PR)

Before submitting your PR, ensure all checks pass cleanly:

```bash
npm run typecheck            # TypeScript strict compilation
npm run architecture:check   # Modular boundary guard
npm test                     # Unit & Property-Based tests (Vitest)
npm run lint                 # Biome lint + Svelte/frontend checks
npm run format:check         # Biome formatting check
npm run build             # Backend build
npm run build -w frontend # Frontend build
```
