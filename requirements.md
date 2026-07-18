# Boardstack — Requirements Specification

**End-to-end functional and non-functional requirements. Companion to `boardstack-system-design.md` and `boardstack-data-model.md`.**

| | |
|---|---|
| **Author** | Pradip Singh |
| **Status** | Draft v1.0 |
| **Date** | 2026-07-17 |

---

## 1. Purpose & scope

Boardstack is a multi-tenant B2B SaaS for project & task management (Jira/Linear-lite). This document defines **what** the system must do (functional requirements as epics → user stories → acceptance criteria) and **how well** it must do it (non-functional requirements), plus constraints and explicit out-of-scope items.

Requirement IDs: functional `FR-*`, non-functional `NFR-*`. Acceptance criteria use Given/When/Then.

### 1.1 Personas

| Persona | Description | Primary role(s) |
|---|---|---|
| **Founder/Owner** | Signs up, creates the org, owns billing & settings. | Owner |
| **Team Admin** | Manages members, projects, workflow config. | Admin |
| **Contributor** | Day-to-day: creates issues, works the board, comments. | Member |
| **Stakeholder** | Reads boards and dashboards, no edits. | Viewer |

---

## 2. Functional requirements

### FR-1 — Authentication & session (Auth0)

**User stories**
- As a user, I can sign up and log in via Auth0 Universal Login (password + social).
- As a user, I stay logged in across page reloads via a secure session.
- As a user, I can log out.

**Acceptance criteria**
- Given valid credentials, when I log in, then I receive a session and land on my organization's board.
- Given an expired/invalid token, when I call the API, then I get `401` and am redirected to login.
- Sessions are stored in httpOnly cookies; no tokens in localStorage.

### FR-2 — Organizations & multi-tenancy

**User stories**
- As a new user, I can create an organization and become its Owner.
- As a user in multiple orgs, I can switch between them.
- As a user, I only ever see data belonging to the active organization.

**Acceptance criteria**
- Given I sign up, when I create an org with a unique slug, then an Auth0 Organization + `organization` row + Owner `membership` are created, and a default project/board/labels are seeded.
- Given I belong to orgs A and B, when I switch to B, then all subsequent data is scoped to B (verified by token `org_id` ↔ subdomain).
- Given a user of org A, when they request an org B resource, then the API returns `403/404` and the DB (RLS) returns zero rows. **(Cross-tenant isolation — must be covered by an automated test.)**

### FR-3 — Members & invitations

**User stories**
- As an Admin, I can invite teammates by email and assign a role.
- As an invitee, I can accept an invite and join the org.
- As an Admin, I can change a member's role or remove them.

**Acceptance criteria**
- Given I am Admin+, when I invite an email, then an `invitation` (pending) + Auth0 invitation are created.
- Given a pending invite, when the invitee accepts, then a `membership` is created and the invite becomes `accepted`.
- Given I am a Member/Viewer, when I try to manage members, then I am denied (`403`).
- Role changes take effect on the member's next token refresh.

### FR-4 — Role-based access control (RBAC)

**Roles:** Owner, Admin, Member, Viewer (see §1.1).

**Acceptance criteria**
- Every mutating endpoint enforces the required permission server-side.
- Given a Viewer, when they view a board, then all edit controls are hidden/disabled **and** the API rejects any mutation they attempt.
- Owner-only actions (delete org, transfer ownership, billing) are inaccessible to others.

### FR-5 — Projects

**User stories**
- As Admin+, I can create, edit, archive, and delete projects.
- As a member, I can view the list of projects in my org.

**Acceptance criteria**
- Given Admin+, when I create a project with a unique `key`, then it is created with a default set of board columns and labels.
- Project `key` is unique within the org; issues are numbered per project (`MOB-1`, `MOB-2`…).
- Archived projects are hidden from default views but retained.

### FR-6 — Board & workflow configuration

**User stories**
- As Admin+, I can configure the columns (statuses) of a project's board.
- As a member, I can view issues arranged in columns.

**Acceptance criteria**
- Given a project, when I add/rename/reorder columns, then `board_column` rows update and existing issues remain valid.
- Each column has a `status_key` and a reporting `category` (todo/in_progress/done).
- Optional WIP limit can be set per column.

### FR-7 — Issues (core)

**User stories**
- As a member, I can create an issue with title, description, type, priority, assignee, labels, story points, and due date.
- As a member, I can view, edit, and delete issues (per permissions).
- As a member, I can create sub-tasks (issues with a parent).

**Acceptance criteria**
- Given the issue form, when I submit invalid data, then client-side Zod validation blocks it and the server re-validates with the same schema.
- Given a valid create, when saved, then the issue gets a sequential per-project `number`, and an `activity(created)` row is written in the same transaction.
- Given an assignee is set, then a notification is generated for that user.
- Editing any field bumps `updated_at` and appends an `activity(updated)` row.

### FR-8 — Kanban drag-and-drop

**User stories**
- As a member, I can drag a card between columns to change its status.
- As a member, I can reorder cards within a column.

**Acceptance criteria**
- Given I drag a card, when I drop it, then the UI updates optimistically **before** the server responds.
- Given the server accepts the move, then `issue.status` + `issue.position` update and `activity(moved, {from,to})` is appended atomically.
- Given the server rejects the move, then the board rolls back to its previous state and shows an error.
- Reordering uses fractional `position` — no full-column renumber occurs.

### FR-9 — Comments & mentions

**User stories**
- As a member, I can comment on an issue.
- As a member, I can @mention teammates in a comment.

**Acceptance criteria**
- Given I post a comment, when saved, then a `comment` + `activity(commented)` are written.
- Given I @mention a user, then a `notification(mention)` is generated for them.
- Comment authors can edit/delete their own comments; Admins can delete any.

### FR-10 — Activity feed & audit trail

**Acceptance criteria**
- Every mutation to an issue appends an append-only `activity` row in the same transaction as the change.
- Given an issue, when I open it, then I see a chronological activity feed (created, moved, assigned, labeled, commented, updated).
- Activity rows are never edited or deleted.

### FR-11 — Sprints & backlog

**User stories**
- As a member, I can groom a backlog and add issues to a sprint.
- As Admin/Member, I can start and complete a sprint.
- As a member, I can view a burndown chart for an active sprint.

**Acceptance criteria**
- At most one `active` sprint exists per project.
- Given I start a sprint, then `state='active'` and `start_date=now()`.
- Given I complete a sprint, then unfinished issues return to backlog (or roll to the next sprint) and `state='completed'`.
- Burndown is derived from `activity` "done" transitions within the sprint window.

### FR-12 — Labels

**Acceptance criteria**
- Labels are scoped per project with a unique name and a color.
- Issues can have many labels; labels can be applied to many issues (`issue_label`).
- Boards/lists can be filtered by label.

### FR-13 — Filtering, search & shareable views

**User stories**
- As a member, I can filter issues by assignee, label, priority, sprint, status, and text.
- As a member, I can share a filtered view via URL.

**Acceptance criteria**
- Filters are reflected in URL search params (e.g. `?assignee=me&label=bug`) and restored on load.
- Lists are cursor-paginated (`?limit=&cursor=`).
- Text search matches issue title/description within the org (RLS-scoped).

### FR-14 — Notifications

**Acceptance criteria**
- Users receive in-app notifications for mentions, assignments, and (optionally) due-soon issues.
- Notifications have read/unread state; users can mark as read.

### FR-15 — Dashboards & reporting

**Acceptance criteria**
- Per-project dashboard shows issues by status, by assignee, by priority, velocity, and overdue count.
- Aggregations are computed server-side and RLS-scoped.

### FR-16 — Attachments (optional v1)

**Acceptance criteria**
- Users can attach files to issues; binaries live in object storage, metadata in `attachment`.
- Attachment access is tenant-scoped.

---

## 3. Non-functional requirements

### NFR-1 — Security & data isolation *(highest priority)*
- Tenant isolation enforced at three layers: Auth0 token, application middleware, and Postgres RLS.
- API DB role has **no** `BYPASSRLS`/superuser.
- All input validated with Zod at the boundary; parameterized queries only.
- RBAC enforced server-side on every mutation.
- Secrets stored in the platform secret store, never in the repo. HTTPS everywhere; httpOnly cookies.
- **Automated test proving cross-tenant reads/writes are blocked is a release gate.**

### NFR-2 — Performance
- Board loads (typical project ≤ 500 issues) in < 1s on broadband.
- API p95 latency < 300ms for reads, < 500ms for writes under normal load.
- Composite indexes on `(organization_id, project_id, status)`; cursor pagination; React Query caching.

### NFR-3 — Reliability & data integrity
- Multi-write operations (e.g. move + activity) are transactional.
- Migrations gated in CI/CD, never auto-applied at runtime.
- Graceful shutdown; background jobs retry with backoff.

### NFR-4 — Usability & accessibility
- Responsive down to tablet width; keyboard shortcuts for common actions.
- WCAG 2.1 AA basics: focus states, ARIA on interactive components (shadcn/ui provides much of this), color contrast.
- Loading skeletons, empty states, and clear error toasts.
- Light/dark mode.

### NFR-5 — Maintainability
- TypeScript `strict` everywhere; no `any` without justification.
- One validation schema shared client/server (`packages/shared`).
- Layered backend (controller → service → repository); thin controllers.
- Consistent error envelope `{ error: { code, message, details? } }`.

### NFR-6 — Observability
- Structured logs with request id + `organization_id` on every line.
- Error tracking (e.g. Sentry); health/readiness endpoints; basic metrics (rate, latency, errors).

### NFR-7 — Portability & DevEx
- One-command local env via `docker compose up` (Postgres + api + web).
- Environment parity local → staging → production; per-env Auth0 tenant + DB.
- Seed script for demo data.

### NFR-8 — Testing
- Unit tests for services; integration tests on real Postgres (Testcontainers) including the RLS isolation test; Playwright e2e for login → create issue → move card.
- CI must pass `tsc --noEmit`, `lint`, and `test` before merge.

---

## 4. Constraints & assumptions

- **Fixed stack** (do not substitute without agreement): Next.js (App Router), React, TS, Tailwind, shadcn/ui, React Hook Form, React Query, Zustand, Zod, Node/Express, PostgreSQL, Prisma, Auth0, Docker.
- Two separate deployables (Express API + Next.js web) in one monorepo with a shared package.
- Tenant resolution via subdomain (`slug.boardstack.com`).
- Single Postgres database, shared schema, RLS for isolation.
- Assumes Auth0 free/dev tier is sufficient for the demo.

---

## 5. Out of scope (v1) / future

Real-time via WebSockets/SSE · billing (Stripe) & plan limits · custom fields and custom workflows engine · saved filters/named views · public API & webhooks · SSO/SCIM enterprise provisioning · native mobile apps · time tracking · automations/rules.

---

## 6. Traceability (requirements → build phases)

| Requirement | Build phase (see PROGRESS.md) |
|---|---|
| FR-1, FR-2, NFR-1 | Phase 1 — Foundations & tenancy |
| FR-3, FR-4 | Phase 2 — Orgs, members, RBAC |
| FR-5, FR-6, FR-7 | Phase 3 — Projects & issues |
| FR-8 | Phase 4 — Kanban board |
| FR-9, FR-10, FR-14 | Phase 5 — Collaboration |
| FR-11, FR-12 | Phase 6 — Sprints & labels |
| FR-13, FR-15, FR-16 | Phase 7 — Search & dashboards |
| NFR-4 (polish) | Phase 8 — Polish & a11y |

---

*End of document.*
