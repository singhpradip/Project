#!/usr/bin/env bash
#
# Boardstack — automated project bootstrap
# Runs the OFFICIAL scaffolding CLIs for each tool in order, non-interactively.
# Idempotent-ish: skips a package if its folder already exists.
#
# Usage:
#   chmod +x scripts/bootstrap.sh
#   ./scripts/bootstrap.sh
#
# Requires: Node 22 LTS, npm 10+, Docker. See SETUP.md §0.

set -euo pipefail

# ------------------------------------------------------------------ helpers
step() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
info() { printf "  \033[0;90m%s\033[0m\n" "$*"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ------------------------------------------------------------------ 0. checks
step "0. Checking prerequisites"
node -v | grep -qE 'v(2[2-9]|[3-9][0-9])' || { echo "Need Node >= 22 (see SETUP.md §0)"; exit 1; }
command -v docker >/dev/null || { echo "Docker not found"; exit 1; }
info "Node $(node -v), npm $(npm -v), Docker present"

# ------------------------------------------------------------------ 1. root workspace
step "1. Root monorepo (npm workspaces)"
if [ ! -f package.json ]; then
  cat > package.json <<'JSON'
{
  "name": "boardstack",
  "private": true,
  "workspaces": ["boardstack-api", "boardstack-web", "packages/*"],
  "scripts": {
    "dev": "docker compose up",
    "dev:api": "npm run dev -w boardstack-api",
    "dev:web": "npm run dev -w boardstack-web",
    "typecheck": "npm run typecheck -w boardstack-api && npm run typecheck -w boardstack-web",
    "lint": "npm run lint -w boardstack-web && npm run lint -w boardstack-api"
  }
}
JSON
  cat > .gitignore <<'GIT'
node_modules/
.env
.env.local
dist/
.next/
generated/
*.log
GIT
  git init -q 2>/dev/null || true
  info "root package.json + .gitignore created"
else
  info "root package.json exists — skipping"
fi

# ------------------------------------------------------------------ 2. shared package (Zod)
step "2. Shared package @boardstack/shared (official: npm init + zod)"
if [ ! -d packages/shared ]; then
  mkdir -p packages/shared/src/schemas
  ( cd packages/shared
    npm init -y >/dev/null
    npm pkg set name="@boardstack/shared" type="module" main="src/index.ts" types="src/index.ts"
    npm pkg set exports["."]="./src/index.ts"
    npm install zod >/dev/null
    npm install --save-dev typescript >/dev/null
  )
  cat > packages/shared/src/index.ts <<'TS'
export * from "./schemas/issue";
TS
  cat > packages/shared/src/schemas/issue.ts <<'TS'
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
TS
  info "shared package scaffolded"
else
  info "packages/shared exists — skipping"
fi

# ------------------------------------------------------------------ 3. Postgres via Docker
step "3. PostgreSQL (official postgres image via docker compose)"
if [ ! -f docker-compose.yml ]; then
  cat > docker-compose.yml <<'YML'
services:
  db:
    image: postgres:16
    container_name: boardstack-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: boardstack
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
YML
  info "docker-compose.yml created"
fi
docker compose up -d db
info "waiting for Postgres to accept connections..."
until docker exec boardstack-db pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
# Non-superuser runtime role for RLS (idempotent)
docker exec boardstack-db psql -U postgres -d boardstack -v ON_ERROR_STOP=0 -c \
  "DO \$\$ BEGIN
     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='boardstack_app') THEN
       CREATE ROLE boardstack_app WITH LOGIN PASSWORD 'app_password' NOBYPASSRLS;
     END IF;
   END \$\$;
   GRANT CONNECT ON DATABASE boardstack TO boardstack_app;
   GRANT USAGE, CREATE ON SCHEMA public TO boardstack_app;" >/dev/null
info "Postgres up; role boardstack_app ready (NOBYPASSRLS)"

# ------------------------------------------------------------------ 4. Express 5 API + TypeScript
step "4. Express 5 API (official: npm install express + TS)"
if [ ! -d boardstack-api ]; then
  mkdir -p boardstack-api/src/lib boardstack-api/src/middleware
  ( cd boardstack-api
    npm init -y >/dev/null
    npm pkg set type="module"
    npm pkg set scripts.dev="tsx watch src/index.ts"
    npm pkg set scripts.start="node src/index.ts"
    npm pkg set scripts.typecheck="tsc --noEmit"
    npm pkg set scripts.lint="eslint ."
    npm pkg set scripts."prisma:migrate"="prisma migrate dev"
    npm pkg set scripts."prisma:generate"="prisma generate"
    npm pkg set scripts."prisma:studio"="prisma studio"
    # official runtime + dev deps
    npm install express cors helmet cookie-parser dotenv >/dev/null
    npm install --save-dev typescript tsx @types/node @types/express @types/cors @types/cookie-parser >/dev/null
  )
  cat > boardstack-api/tsconfig.json <<'JSON'
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
JSON
  cat > boardstack-api/src/index.ts <<'TS'
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

app.get("/health", (_req: Request, res: Response) => res.json({ status: "ok" }));

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`API listening on :${port}`));
TS
  cat > boardstack-api/.env <<'ENV'
PORT=4000
WEB_ORIGIN=http://localhost:3000
DATABASE_URL="postgresql://boardstack_app:app_password@localhost:5432/boardstack?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/boardstack?schema=public"
AUTH0_DOMAIN=
AUTH0_AUDIENCE=
ENV
  cp boardstack-api/.env boardstack-api/.env.example
  info "Express API scaffolded"
else
  info "boardstack-api exists — skipping"
fi

# ------------------------------------------------------------------ 5. Prisma (official CLI)
step "5. Prisma ORM (official: prisma init --datasource-provider postgresql)"
if [ ! -f boardstack-api/prisma/schema.prisma ]; then
  ( cd boardstack-api
    npm install --save-dev prisma @types/pg >/dev/null
    npm install @prisma/client @prisma/adapter-pg pg >/dev/null
    # official init; sets datasource provider so no manual edit needed
    npx --yes prisma init --datasource-provider postgresql >/dev/null
    # Prisma migrate/CLI must run as the DB OWNER (shadow DB + DDL), not the app role.
    # Repoint prisma.config.ts datasource to DIRECT_URL (postgres owner).
    perl -0pi -e 's/url:\s*process\.env\["DATABASE_URL"\]/url: process.env["DIRECT_URL"]/' prisma.config.ts
  )
  # pg-adapter client. Prisma 7's `prisma-client` generator outputs to src/generated/prisma,
  # so import PrismaClient from there (NOT "@prisma/client"). Runtime uses the app role.
  cat > boardstack-api/src/lib/prisma.ts <<'TS'
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });
TS
  # tenant DB middleware
  cat > boardstack-api/src/middleware/with-tenant-db.ts <<'TS'
import { prisma } from "../lib/prisma.js";

export async function withTenantDb(req: any, _res: any, next: any) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_org = '${req.tenant.organizationId}'`,
      );
      req.db = tx;
      await next();
    });
  } catch (err) {
    next(err);
  }
}
TS
  info "Prisma initialized. NEXT: add models to prisma/schema.prisma (from boardstack-data-model.md),"
  info "then run:  cd boardstack-api && npx prisma migrate dev --name init && npx prisma generate"
  info "Add RLS via: npx prisma migrate dev --create-only --name rls_policies  (paste SQL from SETUP.md §5.2)"
else
  info "prisma already initialized — skipping"
fi

# ------------------------------------------------------------------ 6. Next.js 16 (official create-next-app)
step "6. Next.js + TypeScript + Tailwind + ESLint (official: create-next-app)"
if [ ! -d boardstack-web ]; then
  npx --yes create-next-app@latest boardstack-web \
    --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
  ( cd boardstack-web
    npm pkg set scripts.typecheck="tsc --noEmit"
    # data/state/form libs (official packages)
    npm install @tanstack/react-query zustand react-hook-form @hookform/resolvers zod >/dev/null
    npm install @auth0/nextjs-auth0 >/dev/null
  )
  info "Next.js app created with Tailwind + TS + ESLint + App Router"
else
  info "boardstack-web exists — skipping"
fi

# ------------------------------------------------------------------ 7. shadcn/ui (official CLI)
step "7. shadcn/ui (official: shadcn init + add)"
if [ ! -f boardstack-web/components.json ]; then
  ( cd boardstack-web
    # -d = defaults (template=next, preset=nova); -y skips confirmation. No --base-color in current CLI.
    npx --yes shadcn@latest init -d -y
    # Add components one-by-one so a renamed/missing name can't abort the whole batch.
    for c in button input textarea select dialog dropdown-menu label badge avatar \
             table tabs sonner skeleton command card checkbox field form; do
      npx --yes shadcn@latest add "$c" -y -o || echo "  (skipped '$c' — not in registry)"
    done
  )
  info "shadcn/ui initialized and base components added"
else
  info "shadcn already initialized — skipping"
fi

# ------------------------------------------------------------------ done
step "✅ Bootstrap complete"
cat <<'DONE'

Next steps (see SETUP.md §5 and §9, PROGRESS.md Phase 1):
  1. Add the full Prisma models from boardstack-data-model.md.
  2. cd boardstack-api && npx prisma migrate dev --name init && npx prisma generate
  3. Add the RLS migration (SETUP.md §5.2) and re-run migrate dev.
  4. Start everything:  npm run dev        (docker compose up: db + api + web)
     or individually:   npm run dev:api  /  npm run dev:web
  5. Verify:  curl http://localhost:4000/health   →  {"status":"ok"}
              open http://localhost:3000           →  styled shadcn Button

DONE
