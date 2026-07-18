# Boardstack — Installation & Project Setup Flow

**Step-by-step setup for the Boardstack monorepo, built from the official docs for Node/Express 5, Prisma, PostgreSQL, Next.js, and shadcn/ui.** Follow top to bottom; each step is idempotent. Companion to `boardstack-system-design.md`, `boardstack-data-model.md`, `requirements.md`, and `PROGRESS.md`.

> Sources (read if you need detail):
> Next.js — https://nextjs.org/docs/app/getting-started/installation ·
> shadcn/ui — https://ui.shadcn.com/docs/installation ·
> Prisma + Postgres — https://www.prisma.io/docs/prisma-orm/quickstart/prisma-postgres ·
> PostgreSQL — https://www.postgresql.org/docs/ ·
> Express 5 — https://expressjs.com/en/5x/starter/installing/

---

## 0. Prerequisites

| Tool | Version | Why |
|---|---|---|
| **Node.js** | **22 LTS** (≥ 22.18) | Next.js 16 needs ≥ 20.9; Express 5 needs ≥ 18; running `.ts` natively needs ≥ 22.18. Node 22 satisfies all. |
| **npm** | ≥ 10 (ships with Node 22) | Package manager + workspaces. |
| **Docker + Docker Compose** | latest | Runs PostgreSQL locally (and later api/web). |
| **Git** | latest | Version control. |
| PostgreSQL client (optional) | `psql` 16+ | Inspect the DB from the terminal. |
| VS Code (optional) | latest | With Prisma + ESLint extensions. |

Verify:

```bash
node -v      # v22.x
npm -v       # 10.x+
docker -v
docker compose version
```

> **Note on Postgres version:** current stable is PostgreSQL 18; this guide pins the Docker image to `postgres:16` for stability. Either works — bump the tag if you prefer 18.

---

## 1. Create the monorepo

We use a single repo with npm workspaces: two deployables (`boardstack-api`, `boardstack-web`) plus a shared package (`packages/shared`) for Zod schemas/types.

```bash
mkdir boardstack && cd boardstack
git init
```

Create the root `package.json`:

```json
{
  "name": "boardstack",
  "private": true,
  "workspaces": ["boardstack-api", "boardstack-web", "packages/*"],
  "scripts": {
    "dev": "docker compose up",
    "dev:api": "npm run dev -w boardstack-api",
    "dev:web": "npm run dev -w boardstack-web",
    "build": "npm run build -w boardstack-web && npm run build -w boardstack-api",
    "lint": "npm run lint -w boardstack-web && npm run lint -w boardstack-api",
    "typecheck": "npm run typecheck -w boardstack-web && npm run typecheck -w boardstack-api"
  }
}
```

Root `.gitignore`:

```gitignore
node_modules/
.env
.env.local
dist/
.next/
generated/
*.log
```

Create folders:

```bash
mkdir -p boardstack-api boardstack-web packages/shared
```

---

## 2. Shared package (`packages/shared`) — Zod schemas & types

One source of truth for validation, imported by both API and web.

```bash
cd packages/shared
npm init -y
npm install zod
npm install --save-dev typescript
npx tsc --init
```

Set `packages/shared/package.json`:

```json
{
  "name": "@boardstack/shared",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^3.23.0" }
}
```

Create `packages/shared/src/index.ts`:

```ts
export * from "./schemas/issue";
// export * from "./schemas/project"; ...add as you build
```

Create a first schema `packages/shared/src/schemas/issue.ts`:

```ts
import { z } from "zod";

export const issueTypeEnum = z.enum(["task", "bug", "story", "epic"]);
export const priorityEnum = z.enum(["low", "medium", "high", "urgent"]);

export const createIssueSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(20_000).optional(),
  type: issueTypeEnum.default("task"),
  priority: priorityEnum.default("medium"),
  assigneeId: z.string().uuid().nullable().optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  labelIds: z.array(z.string().uuid()).default([]),
  dueDate: z.coerce.date().nullable().optional(),
});

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
```

```bash
cd ../..   # back to repo root
```

---

## 3. PostgreSQL via Docker

Create `docker-compose.yml` at the repo root (start with just the database while developing locally; add api/web services later):

```yaml
services:
  db:
    image: postgres:16
    container_name: boardstack-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: boardstack
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./boardstack-api/prisma/init:/docker-entrypoint-initdb.d # optional bootstrap SQL

volumes:
  pgdata:
```

Bring it up:

```bash
docker compose up -d db
docker compose ps          # db should be healthy
```

### 3.1 Create the non-superuser API role (RLS requirement)

The API must connect as a role **without** `BYPASSRLS`/superuser so RLS always applies. Create it once:

```bash
docker exec -it boardstack-db psql -U postgres -d boardstack -c "
  CREATE ROLE boardstack_app WITH LOGIN PASSWORD 'app_password' NOBYPASSRLS;
  GRANT CONNECT ON DATABASE boardstack TO boardstack_app;
  GRANT USAGE, CREATE ON SCHEMA public TO boardstack_app;
"
```

> Migrations may run as `postgres` (owner), while the running API connects as `boardstack_app`. This keeps RLS honest at runtime.

---

## 4. Express 5 API (`boardstack-api`)

Based on the Express 5 install guide, using TypeScript.

```bash
cd boardstack-api
npm init -y
npm install express cors helmet cookie-parser dotenv
npm install --save-dev typescript tsx @types/node @types/express @types/cors @types/cookie-parser
```

Create `boardstack-api/tsconfig.json` (Node-style TS, strict):

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "verbatimModuleSyntax": true,
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src", "prisma"]
}
```

Set `boardstack-api/package.json` scripts (`type: module`):

```json
{
  "name": "boardstack-api",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node src/index.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate",
    "prisma:studio": "prisma studio"
  }
}
```

Create a minimal server `boardstack-api/src/index.ts`:

```ts
import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import "dotenv/config";

const app: Express = express();

app.use(helmet());
app.use(cors({ origin: process.env.WEB_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`API listening on :${port}`));
```

Create `boardstack-api/.env` (and a committed `.env.example` without secrets):

```dotenv
PORT=4000
WEB_ORIGIN=http://localhost:3000
# Migrations run as owner; runtime app connects as the non-superuser role:
DATABASE_URL="postgresql://boardstack_app:app_password@localhost:5432/boardstack?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/boardstack?schema=public"
# Auth0 (fill from your Auth0 tenant — see system-design §5)
AUTH0_DOMAIN=
AUTH0_AUDIENCE=
```

Smoke test:

```bash
npm run dev
# in another shell:
curl http://localhost:4000/health   # {"status":"ok"}
```

---

## 5. Prisma + PostgreSQL (in `boardstack-api`)

Following the Prisma quickstart, adapted for our **local Docker Postgres** (not managed Prisma Postgres). We use the node-postgres driver adapter.

```bash
# still in boardstack-api
npm install --save-dev prisma @types/pg
npm install @prisma/client @prisma/adapter-pg pg
npx prisma init
```

`prisma init` scaffolds `prisma/schema.prisma`, `prisma.config.ts`, and adds `DATABASE_URL` to `.env` (we already set ours — keep the Docker URL).

Edit `prisma/schema.prisma` — set the datasource to PostgreSQL and add the first tenant models. (Full schema comes from `boardstack-data-model.md`; start small.)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model Organization {
  id          String   @id @default(uuid()) @db.Uuid
  auth0OrgId  String   @unique @map("auth0_org_id")
  name        String
  slug        String   @unique
  createdAt   DateTime @default(now()) @map("created_at")

  memberships Membership[]
  projects    Project[]

  @@map("organization")
}

model AppUser {
  id          String   @id @default(uuid()) @db.Uuid
  auth0UserId String   @unique @map("auth0_user_id")
  email       String
  name        String?
  avatarUrl   String?  @map("avatar_url")
  createdAt   DateTime @default(now()) @map("created_at")

  memberships Membership[]

  @@map("app_user")
}

model Membership {
  id             String       @id @default(uuid()) @db.Uuid
  organizationId String       @map("organization_id") @db.Uuid
  userId         String       @map("user_id") @db.Uuid
  role           String
  createdAt      DateTime     @default(now()) @map("created_at")

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           AppUser      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
  @@map("membership")
}

model Project {
  id             String       @id @default(uuid()) @db.Uuid
  organizationId String       @map("organization_id") @db.Uuid
  key            String
  name           String
  createdAt      DateTime     @default(now()) @map("created_at")

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, key])
  @@map("project")
}
```

Create the first migration and generate the client (run as the DB owner via `DIRECT_URL`):

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5.1 Instantiate Prisma Client with the pg adapter

`boardstack-api/src/lib/prisma.ts`:

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });
```

### 5.2 Add RLS (raw SQL migration — Prisma does not manage this)

Create an empty migration and add the policy SQL:

```bash
npx prisma migrate dev --create-only --name rls_policies
```

In the generated `prisma/migrations/<timestamp>_rls_policies/migration.sql`, add — for **every** tenant table:

```sql
ALTER TABLE organization ENABLE ROW LEVEL SECURITY; -- root table gated by membership
ALTER TABLE membership   ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership   FORCE  ROW LEVEL SECURITY;
ALTER TABLE project      ENABLE ROW LEVEL SECURITY;
ALTER TABLE project      FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON project
  USING      (organization_id = current_setting('app.current_org')::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org')::uuid);

CREATE POLICY tenant_isolation ON membership
  USING      (organization_id = current_setting('app.current_org')::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org')::uuid);

-- Grant table privileges to the runtime role (RLS still restricts rows)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO boardstack_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO boardstack_app;
```

Apply:

```bash
npx prisma migrate dev
```

### 5.3 Tenant DB middleware (sets the org context per request)

`boardstack-api/src/middleware/with-tenant-db.ts` (simplified):

```ts
import { prisma } from "../lib/prisma.js";

export async function withTenantDb(req, res, next) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_org = '${req.tenant.organizationId}'`
      );
      req.db = tx;              // handlers must use req.db, never the global prisma
      await next();
    });
  } catch (err) {
    next(err);
  }
}
```

> This is the heart of isolation: `SET LOCAL` is transaction-scoped, so a pooled connection can't leak one tenant's context into another's request. See `boardstack-system-design.md` §8.1.

---

## 6. Next.js 16 web app (`boardstack-web`)

From the Next.js install guide, using the App Router with TypeScript, Tailwind, ESLint, `src/`, and the `@/*` alias.

```bash
cd ..   # repo root
npx create-next-app@latest boardstack-web \
  --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

> Defaults enable Turbopack. Node ≥ 20.9 required (we have 22).

Run it once to confirm:

```bash
cd boardstack-web
npm run dev        # http://localhost:3000
```

Add `typecheck` to `boardstack-web/package.json` scripts:

```json
{ "scripts": { "typecheck": "tsc --noEmit" } }
```

### 6.1 Data + state libraries

```bash
npm install @tanstack/react-query zustand react-hook-form @hookform/resolvers zod
npm install @auth0/nextjs-auth0        # Auth0 session (see system-design §5)
```

Add the React Query provider — `src/app/providers.tsx`:

```tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Wrap it in `src/app/layout.tsx`:

```tsx
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
```

Use the shared package (already linked by workspaces): `import { createIssueSchema } from "@boardstack/shared";`

---

## 7. shadcn/ui (in `boardstack-web`)

From the shadcn install guide (Next.js path). Tailwind is already set up by `create-next-app`.

```bash
# in boardstack-web
npx shadcn@latest init
```

Answer the prompts (base color, CSS variables — accept sensible defaults). This creates `components.json` and `src/components/ui`. Then add the primitives you'll use:

```bash
npx shadcn@latest add button input textarea select dialog dropdown-menu \
  form label badge avatar table tabs sonner skeleton command
```

> `form` pulls in the React Hook Form integration; use it with the shared Zod resolver (see shadcn "React Hook Form" guide). Domain components (IssueCard, BoardColumn…) compose these primitives under `src/components/domain`.

Quick check — drop a `<Button>` on the home page, run `npm run dev`, confirm it renders styled.

---

## 8. Wire the API into docker-compose (optional, for full-stack `up`)

Add Dockerfiles and extend `docker-compose.yml` so `docker compose up` runs everything.

`boardstack-api/Dockerfile`:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]
```

`boardstack-web/Dockerfile`:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
```

Extend `docker-compose.yml`:

```yaml
  api:
    build: ./boardstack-api
    env_file: ./boardstack-api/.env
    ports: ["4000:4000"]
    depends_on: [db]

  web:
    build: ./boardstack-web
    env_file: ./boardstack-web/.env.local
    ports: ["3000:3000"]
    depends_on: [api]
```

```bash
docker compose up --build
```

---

## 9. Verification checklist

Run these before declaring the skeleton done (maps to PROGRESS Phase 1 exit criteria):

- [ ] `docker compose up -d db` → DB healthy; `boardstack_app` role exists and is `NOBYPASSRLS`.
- [ ] `npm run dev -w boardstack-api` → `GET /health` returns `{"status":"ok"}`.
- [ ] `npx prisma migrate dev` applies cleanly; `npx prisma studio` shows the tables.
- [ ] RLS migration applied; policies exist on tenant tables.
- [ ] `npm run dev -w boardstack-web` → home page renders with a styled shadcn `<Button>`.
- [ ] `@boardstack/shared` imports resolve in both api and web.
- [ ] `npm run typecheck` and `npm run lint` pass in both packages.
- [ ] (Phase 1 gate) RLS isolation integration test proves cross-tenant read/write is blocked.

---

## 10. Command cheat-sheet

```bash
# Database
docker compose up -d db          # start Postgres
docker compose down              # stop everything
docker exec -it boardstack-db psql -U postgres -d boardstack   # psql shell

# API (boardstack-api/)
npm run dev                      # tsx watch
npm run prisma:migrate           # prisma migrate dev
npm run prisma:generate          # regenerate client
npm run prisma:studio            # visual DB editor
npm run typecheck                # tsc --noEmit

# Web (boardstack-web/)
npm run dev                      # Next.js (Turbopack) on :3000
npm run build                    # production build
npm run lint                     # ESLint
npx shadcn@latest add <comp>     # add a UI primitive

# From repo root
npm run dev                      # docker compose up (db + api + web)
npm run typecheck && npm run lint
```

---

## 11. What's next

The skeleton above satisfies most of **PROGRESS.md → Phase 1 (Foundations & tenancy)**. Remaining Phase 1 items: Auth0 tenant + JWKS `authenticate` middleware, `resolveTenant`, the RLS isolation test, and CI. Then proceed to Phase 2 (orgs/members/RBAC).

Update `PROGRESS.md` as you complete each item.

---

*End of document.*
