<div align="center">

# 📋 Boardstack

**A multi-tenant project & task management SaaS — Jira/Linear-lite, built to production standards.**

Companies sign up, invite their team, and manage work on Kanban boards — with every organization's data fully isolated at the database level.

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#-license)

</div>

---

## ✨ Overview

**Boardstack** is a B2B SaaS where each customer ("organization") gets an isolated workspace to plan and track work. It's a portfolio-grade, full-stack application designed to demonstrate real multi-tenancy, clean architecture, and a modern TypeScript stack end to end.

The defining feature is **true tenant isolation**: enforced with three layers of defense — authentication tokens, application middleware, and **PostgreSQL Row-Level Security (RLS)** — so a single coding mistake can never leak one company's data to another.

> **Status:** 🟡 In active development. Foundations (monorepo, database, tenancy, API + web skeletons) are complete; feature work is underway. See [`PROGRESS.md`](./PROGRESS.md) for the live roadmap.

---

## 📑 Table of contents

- [Features](#-features)
- [Tech stack](#-tech-stack)
- [Architecture](#-architecture)
- [Multi-tenancy & security](#-multi-tenancy--security)
- [Monorepo structure](#-monorepo-structure)
- [Getting started](#-getting-started)
- [Environment variables](#-environment-variables)
- [Common commands](#-common-commands)
- [Documentation](#-documentation)
- [Roadmap](#-roadmap)
- [License](#-license)

---

## 🚀 Features

- **Multi-tenant organizations** — isolated workspaces per company, resolved by subdomain.
- **Role-based access control** — Owner / Admin / Member / Viewer, enforced server-side.
- **Projects & issues** — typed issues (task/bug/story/epic) with priority, assignee, labels, story points, sub-tasks, and per-project keys (`MOB-42`).
- **Kanban boards** — drag-and-drop with optimistic updates and rollback.
- **Sprints & backlog** — plan, start, and complete sprints with a burndown.
- **Collaboration** — comments with @mentions, an append-only activity feed, and notifications.
- **Filtering & dashboards** — shareable URL filters and per-project reporting.

> Feature status is tracked in [`PROGRESS.md`](./PROGRESS.md); functional requirements with acceptance criteria live in [`requirements.md`](./requirements.md).

---

## 🛠 Tech stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 16 (App Router), React, TypeScript, Tailwind CSS, shadcn/ui |
| **Data / state** | TanStack React Query (server state), Zustand (UI state), React Hook Form + Zod (forms) |
| **Backend** | Node.js, Express 5, TypeScript |
| **Database** | PostgreSQL 16 + Row-Level Security, Prisma 7 (ORM, driver adapter) |
| **Auth** | Auth0 (Organizations) |
| **Validation** | Zod schemas shared across client & server (`@boardstack/shared`) |
| **Tooling** | Docker Compose, npm workspaces, ESLint, tsx |

---

## 🏗 Architecture

Boardstack is a **monorepo** with two independently deployable apps plus a shared package, talking to one PostgreSQL database.

```
┌─────────────────────────┐        REST + Bearer token        ┌──────────────────────────┐
│  boardstack-web          │  ───────────────────────────────► │  boardstack-api          │
│  Next.js (App Router)    │                                    │  Express 5               │
│  React Query · Zustand   │  ◄─────────────────────────────── │  auth → tenant → RBAC    │
│  React Hook Form + Zod   │            JSON responses          │  → validate → service    │
└─────────────────────────┘                                    └────────────┬─────────────┘
            │                                                                │ Prisma (app role)
            │ Auth0 Universal Login                                          │ SET LOCAL app.current_org
            ▼                                                                ▼
     ┌────────────┐                                              ┌───────────────────────────┐
     │   Auth0    │                                              │  PostgreSQL 16             │
     │  (Orgs)    │                                              │  Row-Level Security (RLS)  │
     └────────────┘                                              └───────────────────────────┘

         packages/shared  ──  Zod schemas + inferred TS types, imported by web AND api
```

The backend follows a strict pipeline: `router → authenticate → resolveTenant → authorize → validate(Zod) → withTenantDb → controller → service → repository`.

Full details: [`boardstack-system-design.md`](./boardstack-system-design.md) · [`boardstack-data-model.md`](./boardstack-data-model.md).

---

## 🔒 Multi-tenancy & security

Tenant isolation is the project's most important invariant, enforced with **defense in depth**:

1. **Auth token** — an Auth0 access token carries the `org_id`; a user only receives tokens for organizations they belong to.
2. **Application middleware** — `resolveTenant` cross-checks the token's org against the subdomain and the user's membership before any handler runs; RBAC is enforced on every mutation.
3. **Database (RLS)** — every tenant-scoped table has an `organization_id` and a Row-Level Security policy. Each request runs inside a transaction that first executes `SET LOCAL app.current_org = '<org>'`, so Postgres physically returns only that tenant's rows — even if a query forgets its `WHERE` clause.

The API connects as a dedicated **non-superuser role** (`NOBYPASSRLS`), so it *cannot* bypass these policies. Migrations run as the database owner via a separate connection.

---

## 📁 Monorepo structure

```
boardstack/
├── boardstack-api/            # Express 5 backend (REST, business logic, DB access)
│   ├── prisma/                # schema.prisma + migrations (incl. raw-SQL RLS)
│   └── src/
│       ├── lib/prisma.ts      # Prisma client (pg driver adapter, app role)
│       ├── middleware/        # authenticate, resolveTenant, authorize, withTenantDb
│       └── index.ts           # app bootstrap
├── boardstack-web/            # Next.js 16 frontend (App Router)
│   └── src/
│       ├── app/               # routes, layout, providers
│       └── components/ui/     # shadcn/ui components
├── packages/
│   └── shared/                # @boardstack/shared — Zod schemas + types (used by both)
├── docker-compose.yml         # PostgreSQL (dev)
└── docs — see below
```

---

## ⚡ Getting started

### Prerequisites

- **Node.js** ≥ 22 (LTS) and **npm** ≥ 10
- **Docker** + Docker Compose
- An **Auth0** tenant (for authentication) — optional until you build auth flows

### 1. Clone & install

```bash
git clone <your-repo-url> boardstack
cd boardstack
npm install
```

### 2. Start PostgreSQL (Docker)

```bash
docker compose up -d db
# Boardstack's Postgres runs on host port 5433 (to avoid clashing with other local DBs)
```

Create the non-superuser application role (once):

```bash
docker exec -it boardstack-db psql -U postgres -d boardstack -c "CREATE ROLE boardstack_app LOGIN PASSWORD 'app_password' NOBYPASSRLS; GRANT CONNECT ON DATABASE boardstack TO boardstack_app; GRANT USAGE, CREATE ON SCHEMA public TO boardstack_app;"
```

### 3. Set up environment variables

```bash
cp boardstack-api/.env.example boardstack-api/.env
# fill in Auth0 values when you're ready for auth
```

### 4. Run database migrations

```bash
cd boardstack-api
npx prisma migrate dev      # creates tables + RLS policies
npx prisma generate         # generates the typed client
cd ..
```

### 5. Start the apps

```bash
npm run dev:api             # API  → http://localhost:4000  (GET /health → {"status":"ok"})
npm run dev:web             # Web  → http://localhost:3000
```

Explore the database anytime with `npx prisma studio` (from `boardstack-api/`).

---

## 🔧 Environment variables

`boardstack-api/.env` (see `.env.example`):

| Variable | Description |
|---|---|
| `PORT` | API port (default `4000`) |
| `WEB_ORIGIN` | Allowed CORS origin (the web app, e.g. `http://localhost:3000`) |
| `DATABASE_URL` | Runtime connection — **non-superuser** `boardstack_app` role (RLS applies) |
| `DIRECT_URL` | Migration connection — database **owner** (`postgres`), used by Prisma CLI |
| `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` | Auth0 tenant + API identifier |

> Two connection strings by design: the app runs under a locked-down role, while migrations use the owner. Never commit `.env` — only `.env.example`.

---

## 📜 Common commands

```bash
# From repo root
npm run dev:api                 # start the Express API (watch mode)
npm run dev:web                 # start the Next.js app
docker compose up -d db         # start PostgreSQL
docker compose down             # stop containers

# In boardstack-api/
npx prisma migrate dev          # create & apply a migration
npx prisma generate             # regenerate the Prisma client
npx prisma studio               # visual database browser

# In boardstack-web/
npx shadcn@latest add <name>    # add a shadcn/ui component
npm run build                   # production build
```

---

## 📚 Documentation

This repo is documented in depth:

| Document | What's inside |
|---|---|
| [`boardstack-system-design.md`](./boardstack-system-design.md) | Architecture, multi-tenancy strategy, Auth0, RLS, API design, deployment |
| [`boardstack-data-model.md`](./boardstack-data-model.md) | Full entity catalog, relationships, data flows, state machines |
| [`requirements.md`](./requirements.md) | Functional (`FR-*`) & non-functional (`NFR-*`) requirements with acceptance criteria |
| [`SETUP.md`](./SETUP.md) | Concise install & setup reference (from official docs) |
| [`LEARN.md`](./LEARN.md) | Hands-on, annotated build guide — rebuild every piece with the "why" |
| [`PROGRESS.md`](./PROGRESS.md) | Phase-by-phase task tracker and current status |

---

## 🗺 Roadmap

- [x] **Phase 0** — Planning & documentation
- [x] **Phase 1** — Foundations & tenancy (monorepo, Docker Postgres, Prisma, RLS, API + web skeletons)
- [ ] **Phase 2** — Organizations, members & RBAC (Auth0)
- [ ] **Phase 3** — Projects & issues
- [ ] **Phase 4** — Kanban board (drag-and-drop)
- [ ] **Phase 5** — Collaboration (comments, activity, notifications)
- [ ] **Phase 6** — Sprints & labels
- [ ] **Phase 7** — Search, filters & dashboards
- [ ] **Phase 8** — Polish, accessibility & hardening
- [ ] **Phase 9** — Deployment

Track live status in [`PROGRESS.md`](./PROGRESS.md).

---

## 📄 License

Released under the [MIT License](./LICENSE).

---

<div align="center">

Built by **Pradip Singh** · Boardstack

</div>
