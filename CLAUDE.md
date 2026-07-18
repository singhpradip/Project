# CLAUDE.md

Guidance for Claude Code when working in the **TaskFlow** repo — a multi-tenant project & task management SaaS.

## Project documents (read for context)

Always consult these before non-trivial work; they are the source of truth:

- **`taskflow-system-design.md`** — architecture, multi-tenancy strategy, Auth0, RLS, API design, deployment, folder structure.
- **`taskflow-data-model.md`** — full entity catalog with attributes/constraints, relationships, entity interactions, user data flows, and state machines.
- **`requirements.md`** — end-to-end functional (`FR-*`) and non-functional (`NFR-*`) requirements with acceptance criteria.
- **`SETUP.md`** — installation & project setup flow (monorepo, Docker Postgres, Express 5, Prisma, Next.js, shadcn/ui) built from the official docs.
- **`PROGRESS.md`** — the project task tracker: phases, tasks, current status, and exit criteria.

## Task tracking — keep `PROGRESS.md` current

`PROGRESS.md` is the project's heartbeat. Whenever you work on the project:

1. **Before starting**, open `PROGRESS.md`, find the current phase, and mark the task you're picking up as in progress (`[ ]` → `[~]`).
2. **After finishing**, mark it done (`[~]` → `[x]`), update the phase's `%` and the overview table, and bump "Last updated".
3. When a phase's tasks are all `[x]` and its **exit criteria** are met, mark the phase ✅ and move to the next.
4. Add newly discovered tasks under the right phase; put post-v1 ideas in the parking lot.
5. Record notable changes in the change log at the bottom.
6. Requirement IDs referenced in tasks (e.g. `FR-7`) map back to `requirements.md` — honor those acceptance criteria as "done" means.

Do not consider a piece of work complete until `PROGRESS.md` reflects it.

## What this project is

Multi-tenant B2B SaaS (Jira/Linear-lite). Companies ("organizations") sign up, invite teammates, and manage work on Kanban boards. **Every organization's data is fully isolated.** Tenant isolation is the single most important invariant in this codebase — never write code that could leak data across organizations.

Two deployables in a monorepo:
- `taskflow-api/` — Express backend (REST, business logic, DB).
- `taskflow-web/` — Next.js frontend (App Router).
- `packages/shared/` — Zod schemas + inferred TS types, imported by **both**.

## Tech stack (do not substitute without asking)

Next.js (App Router) · React · TypeScript · Tailwind · shadcn/ui · React Hook Form · React Query (TanStack) · Zustand · Zod · Node/Express · PostgreSQL · Prisma · Auth0 (Organizations) · Docker.

## Non-negotiable rules

### Multi-tenancy & data isolation
- Every tenant-scoped table has an `organization_id` column — including join tables.
- **Postgres Row-Level Security is the source of truth for isolation.** Do not disable, bypass, or work around RLS. The API DB role must never have `BYPASSRLS` or superuser.
- All tenant queries run inside a transaction that first executes `SET LOCAL app.current_org = '<org uuid>'`. Never query tenant tables outside this context.
- Never trust an `organization_id` from the request body/params. The org comes only from the validated Auth0 token (cross-checked against the subdomain) in `resolveTenant` middleware.
- When adding a new tenant table: add `organization_id`, enable + force RLS, and add the `tenant_isolation` policy. Add an integration test proving cross-tenant access is blocked.

### Auth & permissions
- Auth is Auth0 (Organizations). Do not build custom login/password logic.
- The backend validates JWTs against Auth0 JWKS and reads `org_id` + `roles`/`permissions` claims.
- RBAC (owner/admin/member/viewer) is enforced **server-side** on every mutating route. Frontend hiding of controls is UX only, never the security boundary.

### Validation
- All API input is validated with Zod at the middleware boundary (params, query, body).
- Validation schemas live in `packages/shared` and are reused by React Hook Form on the client. One schema, both sides — do not duplicate.

## State management (frontend) — respect the boundaries

- **Server data → React Query only.** Anything from the API (issues, projects, members, comments). Never copy server data into Zustand.
- **Ephemeral UI state → Zustand.** Open modals, active filters, drag-in-progress, selected issue.
- **Form state → React Hook Form + Zod resolver.**
- **Shareable state → URL search params** (e.g. `?assignee=me&label=bug`).
- Mutations that change board state use optimistic updates with rollback in `onError` and reconcile in `onSettled`.

## Backend layering

Keep the pipeline order: `router → requestContext → authenticate → resolveTenant → authorize → validate(zod) → withTenantDb → controller → service → repository`.
- Controllers are thin (parse input, call service, shape response).
- Business logic lives in services. DB access in repositories.
- Multi-write operations (e.g. move issue + write activity log) run in one transaction.

## Conventions

- **Language:** TypeScript everywhere, `strict` mode. No `any` without a comment justifying it.
- **Errors:** return the envelope `{ error: { code, message, details? } }` with correct HTTP status (400 validation, 401, 403, 404, 409, 422).
- **IDs:** UUIDs. Issues also have a per-project sequential `number` (e.g. `MOB-42`).
- **Ordering:** issues use a fractional `position` (double) — never renumber a whole column.
- **Pagination:** cursor-based (`?limit=&cursor=`).
- **Naming:** files `kebab-case`, components `PascalCase`, hooks `useX`, DB tables/columns `snake_case`.
- **Imports:** shared types/schemas from `@taskflow/shared`, not relative cross-package paths.
- **Components:** compose shadcn/ui primitives in `components/ui`; domain components in `components/domain`.

## Commands

```bash
# From repo root
docker compose up            # Postgres + api + web (local dev)

# API (taskflow-api/)
npm run dev                  # start Express in watch mode
npm run test                 # unit + integration (incl. RLS isolation tests)
npx prisma migrate dev       # create/apply migration (dev)
npx prisma generate          # regenerate client after schema change

# Web (taskflow-web/)
npm run dev                  # Next.js dev server
npm run build                # production build
npm run lint                 # ESLint
npx tsc --noEmit             # type-check
```

Before considering a change done: `tsc --noEmit`, `lint`, and `test` must all pass.

## Database changes

- Schema changes go through Prisma Migrate. Never edit the DB by hand or auto-apply migrations at runtime.
- After changing `schema.prisma`, run `prisma generate` and update affected repositories/types.
- New tenant tables require the RLS policy + an isolation test (see rules above).

## Testing expectations

- Services: unit tests.
- Integration tests hit a real Postgres (Testcontainers) and **must include a test proving RLS blocks cross-tenant reads and writes.**
- Critical flows (login → create issue → move card) covered by Playwright e2e.

## Things to avoid

- Do not add new dependencies for problems the existing stack solves (e.g., another state library, another form library).
- Do not put secrets in the repo; use `.env` (see `.env.example`) and the platform secret store.
- Do not bypass the tenant DB middleware or query tenant tables without the org context set.
- Do not implement real-time (WebSockets), billing, or custom fields unless explicitly asked — they are future scope.

## When unsure

Prefer matching existing patterns in the relevant `modules/` (api) or `features/` (web) directory. If a change touches tenancy, auth, or RLS, call it out explicitly and add/adjust the corresponding isolation test.
