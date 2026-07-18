# Boardstack — Project Progress Tracker

**The single source of truth for what's done, in progress, and next.** Update this file as work advances. Companion to `requirements.md`, `boardstack-system-design.md`, and `boardstack-data-model.md`.

| | |
|---|---|
| **Overall status** | 🟡 Planning complete — ready to start Phase 1 |
| **Current phase** | Phase 0 → Phase 1 |
| **Last updated** | 2026-07-17 |

---

## How to use this file

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

**Conventions**
- When you start a task, change `[ ]` → `[~]` and set it as the phase's "current".
- When you finish, change `[~]` → `[x]` and update the phase % and the "Last updated" date.
- A phase is **Done** only when every task is `[x]` **and** its exit criteria are met.
- Requirement IDs (e.g. `FR-7`) map back to `requirements.md`.
- Do not start Phase N+1 work that depends on Phase N until Phase N's exit criteria pass. Cross-cutting polish is the exception.

**Progress overview**

| Phase | Title | Status | % |
|---|---|---|---|
| 0 | Planning & docs | ✅ Done | 100% |
| 1 | Foundations & tenancy | ⬜ Not started | 0% |
| 2 | Orgs, members & RBAC | ⬜ Not started | 0% |
| 3 | Projects & issues | ⬜ Not started | 0% |
| 4 | Kanban board | ⬜ Not started | 0% |
| 5 | Collaboration | ⬜ Not started | 0% |
| 6 | Sprints & labels | ⬜ Not started | 0% |
| 7 | Search & dashboards | ⬜ Not started | 0% |
| 8 | Polish, a11y & hardening | ⬜ Not started | 0% |
| 9 | Deployment & docs | ⬜ Not started | 0% |

---

## Phase 0 — Planning & documentation ✅

- [x] Choose project (multi-tenant PM SaaS)
- [x] System design document (`boardstack-system-design.md`)
- [x] Data model & data flow (`boardstack-data-model.md`)
- [x] Requirements spec (`requirements.md`)
- [x] Repo guidance (`CLAUDE.md`)
- [x] Installation & setup flow (`SETUP.md`, from official docs)
- [x] Progress tracker (this file)

**Exit criteria:** all planning docs reviewed and agreed. ✅

---

## Phase 1 — Foundations & tenancy  *(FR-1, FR-2, NFR-1, NFR-7)*

**Goal:** a runnable skeleton with auth, the tenant DB context, and RLS proven to work.

- [ ] Monorepo scaffold (`boardstack-api`, `boardstack-web`, `packages/shared`) + workspaces
- [ ] `docker-compose.yml` (Postgres + api + web) + `.env.example` for each app
- [ ] Express app bootstrap (health endpoint, error envelope, request-id logger)
- [ ] Prisma init + connect to Postgres; base `schema.prisma`
- [ ] Auth0 tenant setup: application, API, Organizations enabled, roles/permissions defined
- [ ] `authenticate` middleware — verify Auth0 JWT via JWKS
- [ ] `resolveTenant` middleware — map `org_id` ↔ subdomain, load membership
- [ ] `withTenantDb` middleware — open txn + `SET LOCAL app.current_org`
- [ ] RLS scaffolding: raw-SQL migration enabling + forcing RLS + `tenant_isolation` policy on a first table
- [ ] Non-superuser API DB role (no `BYPASSRLS`)
- [ ] Next.js app scaffold (App Router) + Tailwind + shadcn/ui init
- [ ] Auth0 Next.js SDK wired: login, callback, logout, session cookie
- [ ] Subdomain middleware on the web app
- [ ] React Query provider + base API client (attaches Bearer token)
- [ ] **RLS isolation integration test (Testcontainers): cross-tenant read/write blocked**
- [ ] CI pipeline: `tsc --noEmit` + `lint` + `test`

**Exit criteria:** `docker compose up` runs all three services; a user can log in via Auth0; the cross-tenant isolation test passes in CI.

---

## Phase 2 — Organizations, members & RBAC  *(FR-2, FR-3, FR-4)*

**Goal:** full org lifecycle and role-based permissions.

- [ ] `organization`, `app_user`, `membership`, `invitation` tables + RLS + migrations
- [ ] First-login provisioning: create org + owner membership + seed default project/columns/labels
- [ ] `GET /me`, `GET /organizations` endpoints
- [ ] Org switcher UI
- [ ] Members: list, invite (Auth0 invitation), change role, remove
- [ ] `authorize` / `requirePermission` middleware + role→permission mapping
- [ ] Frontend: hide/disable controls by permission
- [ ] Members management UI (shadcn table + dialogs, RHF+Zod for invite form)
- [ ] Tests: RBAC denials (Viewer/Member) + invitation acceptance flow

**Exit criteria:** an Owner can invite a teammate who joins with the right role; permission checks enforced server-side and reflected in UI.

---

## Phase 3 — Projects & issues  *(FR-5, FR-6, FR-7)*

**Goal:** the core CRUD and the issue entity.

- [ ] `project`, `board_column`, `issue`, `label`, `issue_label` tables + RLS + migrations
- [ ] Shared Zod schemas for project & issue in `packages/shared`
- [ ] Projects API: create/list/get/update/archive/delete
- [ ] Board columns API: list + configure/reorder
- [ ] Issues API: create (sequential `number` + `activity`), get, update, delete, sub-tasks
- [ ] Projects UI: list, create, settings (workflow columns)
- [ ] Issue create/edit modal (RHF + shared Zod, assignee/labels/priority/points/due date)
- [ ] Issue detail panel (fields + placeholder for comments/activity)
- [ ] Tests: issue numbering, validation parity, activity written on create/update

**Exit criteria:** a member can create a project and full CRUD issues; per-project numbering works; edits log activity.

---

## Phase 4 — Kanban board  *(FR-8)*

**Goal:** the signature drag-and-drop experience.

- [ ] Board query endpoint (issues grouped by column, RLS-scoped)
- [ ] `PATCH /issues/:id/move` (status + fractional position + activity, transactional)
- [ ] Board UI: columns + cards (shadcn + Tailwind)
- [ ] Drag-and-drop with optimistic update (React Query `onMutate`/`onError`/`onSettled`)
- [ ] Zustand store for drag-in-progress / selected issue
- [ ] Within-column reordering via fractional positioning
- [ ] Tests: optimistic update + rollback on server error; e2e move card (Playwright)

**Exit criteria:** dragging a card updates instantly, persists, logs activity, and rolls back on failure.

---

## Phase 5 — Collaboration  *(FR-9, FR-10, FR-14)*

**Goal:** comments, activity feed, notifications.

- [ ] `comment`, `activity`, `notification` tables + RLS + migrations
- [ ] Comments API: list/create/edit/delete (own; admin any)
- [ ] @mention parsing → `notification(mention)`
- [ ] Activity feed API + UI on issue detail
- [ ] Notifications API (list, mark read) + UI (bell/inbox)
- [ ] Assignment → `notification(assigned)`
- [ ] Background queue for notification side effects (optional: BullMQ + Redis)
- [ ] Tests: mention creates notification; activity feed ordering

**Exit criteria:** commenting and @mentions work; each issue shows a correct chronological activity feed; users get notifications.

---

## Phase 6 — Sprints & labels  *(FR-11, FR-12)*

**Goal:** agile planning.

- [ ] `sprint` table + RLS + migration
- [ ] Sprints API: create, start (guard single active), complete (roll unfinished), list
- [ ] Backlog UI: groom + drag issues into a sprint
- [ ] Sprint board view (filter to active sprint)
- [ ] Burndown endpoint + chart (derived from activity)
- [ ] Labels: manage per project + filter by label
- [ ] Tests: single-active-sprint guard; completion rolls unfinished issues

**Exit criteria:** a sprint can be planned, started, run, and completed with a working burndown.

---

## Phase 7 — Search, filters & dashboards  *(FR-13, FR-15, FR-16)*

**Goal:** find things and see the big picture.

- [ ] Issue list filtering (assignee/label/priority/sprint/status/text) + cursor pagination
- [ ] URL search-param sync + Zustand for active filters
- [ ] Text search on title/description (RLS-scoped)
- [ ] Dashboard aggregations endpoint (by status/assignee/priority, velocity, overdue)
- [ ] Dashboard UI with charts
- [ ] (Optional) Attachments: upload to object storage + `attachment` metadata
- [ ] Tests: filter correctness; aggregation numbers

**Exit criteria:** filters are shareable via URL and dashboards render accurate, tenant-scoped metrics.

---

## Phase 8 — Polish, accessibility & hardening  *(NFR-2, NFR-3, NFR-4)*

- [ ] Dark/light mode
- [ ] Keyboard shortcuts for common actions
- [ ] Loading skeletons, empty states, error toasts everywhere
- [ ] Responsive layout down to tablet
- [ ] Accessibility pass (focus, ARIA, contrast — WCAG 2.1 AA basics)
- [ ] Rate limiting + input hardening
- [ ] Performance: indexes verified, N+1 checks, board < 1s
- [ ] Error tracking (Sentry) + structured logging with org id

**Exit criteria:** the app feels production-grade; a11y and performance targets met.

---

## Phase 9 — Deployment & documentation  *(NFR-6, NFR-7)*

- [ ] Staging + production environments (per-env Auth0 + DB)
- [ ] CD pipeline: build images, run migrations as a deploy step, deploy web + api
- [ ] Seed/demo data script for the live demo
- [ ] README with setup + architecture overview + screenshots
- [ ] Health/readiness endpoints + basic metrics dashboard
- [ ] Final security review (RLS role, secrets, headers)

**Exit criteria:** app is live at a demo URL with a seeded demo org and a polished README.

---

## Backlog / parking lot (post-v1)

Real-time (WebSockets) · billing (Stripe) · custom fields & workflow engine · saved views · public API & webhooks · SSO/SCIM · time tracking · automations.

---

## Change log

| Date | Change |
|---|---|
| 2026-07-17 | Planning complete (Phase 0). Tracker created. |
| 2026-07-17 | Added `SETUP.md` — install/setup flow from official Node/Express/Prisma/Postgres/Next.js/shadcn docs. |

---

*Keep this file honest — it is the project's heartbeat.*
