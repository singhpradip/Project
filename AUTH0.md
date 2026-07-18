# Boardstack — Auth0 Setup Guide (Authentication & Tenancy)

**Add real login, organizations, and RBAC to Boardstack using Auth0.** Annotated LEARN-style: dashboard clicks + code, each with the *why*. Companion to `LEARN.md`, `boardstack-system-design.md` (§5), and `PROGRESS.md` (Phase 1 auth items → Phase 2).

Same rhythm as LEARN.md: **What → Why → Verify.**

> **Versions this guide targets (verified against official docs):**
> - Frontend: **`@auth0/nextjs-auth0` v4** — uses `Auth0Client` and auto-mounts `/auth/*` routes.
> - Next.js **16** — the auth interceptor file is **`proxy.ts`** (not `middleware.ts`).
> - Backend: **`express-oauth2-jwt-bearer`** — Auth0's official Express JWT validator.

---

## 0. The mental model (read first)

Auth0 handles *who the user is*; Boardstack handles *what they can see*. The split:

```
Browser (Next.js)                 Auth0                      Express API
    │  click "Log in"              │                             │
    ├─────────────────────────────►  Universal Login (org)       │
    │  ◄──────────── session cookie + tokens (org_id, roles)     │
    │                                                            │
    │  call API with  Authorization: Bearer <access_token>  ─────►
    │                                        verify JWT (JWKS),  │
    │                                        read org_id + roles │
    │                                        resolveTenant → RLS │
    │  ◄──────────────────────── tenant-scoped JSON ────────────┤
```

Key ideas:

- The **frontend** never validates tokens itself — the SDK manages the login redirect and stores the session in an httpOnly cookie. It just needs to *attach the access token* when calling your API.
- The **access token is a JWT** signed by Auth0. Your API verifies its signature against Auth0's public keys (JWKS) and trusts the claims inside — crucially `org_id` (which tenant) and the user's roles/permissions.
- **Auth0 Organizations** is the feature that makes each Boardstack organization a first-class tenant in Auth0. When a user logs into an org, the token carries that org's `org_id`.
- Your `resolveTenant` middleware maps that `org_id` to your internal `organization` row and sets the Postgres `app.current_org` — connecting Auth0 identity to your RLS isolation.

---

## 1. Auth0 dashboard setup (one-time)

Create a free account at [auth0.com](https://auth0.com) and sign in to the [dashboard](https://manage.auth0.com). You'll create **four** things: an API, an Application, Organizations, and Roles.

### 1.1 Create the API (this defines your "audience")

**Applications → APIs → Create API.**

- **Name:** `Boardstack API`
- **Identifier (audience):** `https://api.boardstack.local` (this is just an identifier string — it never has to be a real URL, but it must match `AUTH0_AUDIENCE` in your backend `.env`)
- **Signing algorithm:** RS256 (default)

**Why:** the "audience" tells Auth0 to issue a **JWT access token meant for your API**. Without an API/audience, Auth0 issues opaque tokens your backend can't verify. Enable **RBAC** and **Add Permissions in the Access Token** under this API's *Settings → RBAC Settings* so roles land in the token.

Define permissions under the API's **Permissions** tab, e.g.:

```
project:read   project:write
issue:read     issue:write
member:read    member:write
org:admin
```

### 1.2 Create the Application (Regular Web App)

**Applications → Applications → Create Application.**

- **Name:** `Boardstack Web`
- **Type:** **Regular Web Application** (important — the Next.js SDK v4 requires this, not SPA)

In the application's **Settings**, add these URLs (for local dev):

| Field | Value |
|---|---|
| Allowed Callback URLs | `http://localhost:3000/auth/callback` |
| Allowed Logout URLs | `http://localhost:3000` |
| Allowed Web Origins | `http://localhost:3000` |

**Why the `/auth/callback` path:** the v4 SDK auto-mounts its routes under `/auth/*`, so the callback is `/auth/callback` (not the old `/api/auth/callback`).

Note the **Domain**, **Client ID**, and **Client Secret** from this app's settings — you'll need them in a moment.

### 1.3 Enable Organizations

**Organizations → (create your first org for testing), e.g. `acme`.**

- Under your **Application → Organizations** tab, set **"Type of Users" = Business Users** and enable the org login prompt (allow "Prompt for Organization" or "Business Users").
- Add yourself as a member of the `acme` organization (Organizations → acme → Members → Add).

**Why:** Organizations is Auth0's native multi-tenancy. Logging in "to an org" makes Auth0 put `org_id` (and `org_name`) claims in the token — the hook your `resolveTenant` uses.

### 1.4 Create Roles

**User Management → Roles → Create Role** for each: `owner`, `admin`, `member`, `viewer`. Assign permissions (from §1.1) to each role, then assign a role to your test user **within the organization** (Organizations → acme → Members → your user → Roles).

**Why:** these become the `permissions`/roles claims in the token that your backend RBAC checks read.

---

## 2. Frontend — wire up login (`boardstack-web`)

### 2.1 Environment variables

The SDK is already installed (`@auth0/nextjs-auth0`). Add to `boardstack-web/.env.local`:

```dotenv
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=xxxxxxxxxxxxxxxx
AUTH0_CLIENT_SECRET=xxxxxxxxxxxxxxxx
AUTH0_SECRET=<run: openssl rand -hex 32>
APP_BASE_URL=http://localhost:3000
# The API audience — so the SDK requests a JWT access token for your backend:
AUTH0_AUDIENCE=https://api.boardstack.local
```

Generate the session-encryption secret:

```bash
openssl rand -hex 32     # paste the output as AUTH0_SECRET
```

**Why `AUTH0_SECRET`:** it encrypts the session cookie. `APP_BASE_URL` tells the SDK where your app lives (for redirects).

### 2.2 The Auth0 client

Create `boardstack-web/src/lib/auth0.ts`:

```ts
import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  authorizationParameters: {
    // Request a JWT access token for the Boardstack API, plus a refresh token.
    audience: process.env.AUTH0_AUDIENCE,
    scope: "openid profile email offline_access",
  },
});
```

**Why `authorizationParameters.audience`:** without it, the access token isn't scoped to your API and your backend can't validate it. `offline_access` enables refresh tokens so sessions can be renewed.

### 2.3 The auth interceptor — `proxy.ts` (Next.js 16)

Create `boardstack-web/src/proxy.ts` (note: **`proxy.ts`**, and inside `src/` because you use a `src/` dir):

```ts
import { auth0 } from "./lib/auth0";

export async function proxy(request: Request) {
  return await auth0.middleware(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
```

**Why:** this single line mounts all 13 `/auth/*` routes (login, callback, logout, access-token, profile, …) and keeps the session rolling. Next.js 16 renamed `middleware.ts` → `proxy.ts`; using the new name avoids the deprecation path.

### 2.4 Login / logout UI

The SDK gives you routes to link to — use plain `<a>` tags (not `<Link>`, so routing hits the server):

```tsx
// somewhere in a page/component
import { auth0 } from "@/lib/auth0";

export default async function Home() {
  const session = await auth0.getSession();

  if (!session) {
    return (
      <div>
        <a href="/auth/login?organization=acme">Log in to Acme</a>
      </div>
    );
  }

  return (
    <div>
      <p>Welcome, {session.user.name}</p>
      <a href="/auth/logout">Log out</a>
    </div>
  );
}
```

**Why `?organization=acme`:** it tells Auth0 which organization to authenticate against, so the token carries that `org_id`. (In production you'd derive this from the subdomain.)

**✅ Verify:** run `npm run dev:web`, click "Log in", authenticate, and you should return to the app as a logged-in user. Visit `http://localhost:3000/auth/profile` to see your session JSON.

### 2.5 Calling the API with the access token

An API client that attaches the token. The SDK exposes the token via the `/auth/access-token` route or `getAccessToken()`:

```ts
// src/lib/api.ts (server-side usage)
import { auth0 } from "@/lib/auth0";

export async function apiFetch(path: string, init: RequestInit = {}) {
  const { token } = await auth0.getAccessToken();
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
```

Add `NEXT_PUBLIC_API_URL=http://localhost:4000` to `.env.local`.

---

## 3. Backend — validate tokens & resolve the tenant (`boardstack-api`)

### 3.1 Install the validator

```bash
cd boardstack-api
npm install express-oauth2-jwt-bearer
```

**Why:** `express-oauth2-jwt-bearer` is Auth0's official Express middleware. It fetches Auth0's public keys (JWKS), verifies the JWT's signature, issuer, audience, and expiry, and attaches the decoded claims to `req.auth`.

Your `.env` already has:

```dotenv
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://api.boardstack.local
```

### 3.2 `authenticate` middleware

Create `boardstack-api/src/middleware/authenticate.ts`:

```ts
import { auth } from "express-oauth2-jwt-bearer";

// Verifies the Auth0 JWT (signature via JWKS, issuer, audience, expiry).
// On success, populates req.auth.payload with the token claims.
export const authenticate = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  tokenSigningAlg: "RS256",
});
```

**Why:** if the token is missing/invalid/expired, this middleware short-circuits with `401` before any handler runs — exactly the behavior required by FR-1.

### 3.3 `resolveTenant` middleware

Create `boardstack-api/src/middleware/resolve-tenant.ts`:

```ts
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

// Reads org_id + user from the validated token, maps to our internal
// organization + membership, and attaches req.tenant for withTenantDb.
export async function resolveTenant(req: Request, res: Response, next: NextFunction) {
  const claims = (req as any).auth?.payload ?? {};
  const auth0OrgId = claims.org_id as string | undefined;
  const auth0UserId = claims.sub as string | undefined;

  if (!auth0OrgId || !auth0UserId) {
    return res.status(401).json({ error: { code: "no_org", message: "Token missing org or subject" } });
  }

  // Find the org by its Auth0 org id (owner-level query; organization table isn't RLS-gated).
  const org = await prisma.organization.findUnique({ where: { auth0OrgId } });
  if (!org) {
    return res.status(404).json({ error: { code: "org_not_found", message: "Unknown organization" } });
  }

  // Confirm the user is actually a member of this org.
  const user = await prisma.appUser.findUnique({ where: { auth0UserId } });
  const membership = user
    ? await prisma.membership.findUnique({
        where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      })
    : null;

  if (!membership) {
    return res.status(403).json({ error: { code: "not_a_member", message: "Not a member of this organization" } });
  }

  // Optional in prod: cross-check org.slug against the request subdomain.
  (req as any).tenant = {
    organizationId: org.id,
    userId: user!.id,
    role: membership.role,
    permissions: (claims.permissions as string[]) ?? [],
  };
  next();
}
```

**Why:** this is the bridge between Auth0 identity and your database. It proves membership (defense layer 2) and hands `organizationId` to `withTenantDb`, which sets `app.current_org` for RLS (defense layer 3).

### 3.4 An `authorize` helper (RBAC)

Create `boardstack-api/src/middleware/authorize.ts`:

```ts
import type { NextFunction, Request, Response } from "express";

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const perms = (req as any).tenant?.permissions ?? [];
    if (!perms.includes(permission)) {
      return res.status(403).json({ error: { code: "forbidden", message: `Missing permission: ${permission}` } });
    }
    next();
  };
}
```

### 3.5 Wire the pipeline

The order matters (see `CLAUDE.md`): `authenticate → resolveTenant → authorize → validate → withTenantDb → handler`. Example protected route in `src/index.ts`:

```ts
import { authenticate } from "./middleware/authenticate.js";
import { resolveTenant } from "./middleware/resolve-tenant.js";
import { requirePermission } from "./middleware/authorize.js";
import { withTenantDb } from "./middleware/with-tenant-db.js";

app.get(
  "/api/v1/projects",
  authenticate,
  resolveTenant,
  requirePermission("project:read"),
  withTenantDb,
  async (req, res) => {
    const projects = await (req as any).db.project.findMany();
    res.json({ data: projects });
  },
);
```

**✅ Verify:** with the web app logged in, call this endpoint (via your `apiFetch`). You should get back only the current org's projects. A request with no token → `401`; a valid token for an org you're not in → `403`.

---

## 4. Provisioning users & organizations

Auth0 owns identities, but your database needs matching `app_user`, `organization`, and `membership` rows. Two common approaches:

**A. Just-in-time sync (simplest to start).** On the first authenticated request, upsert the user and (if you pre-created the org) the membership. Add near the top of `resolveTenant`, before the membership check:

```ts
// upsert the user from token claims
const dbUser = await prisma.appUser.upsert({
  where: { auth0UserId },
  update: { email: claims.email, name: claims.name },
  create: { auth0UserId, email: claims.email ?? "", name: claims.name },
});
```

**B. Post-login Action (production-grade).** Add an Auth0 **Action** (Login flow) that, after login, calls your API (or the Auth0 Management API) to ensure the org + membership exist and to enrich the token. This keeps provisioning server-authoritative.

**Creating a brand-new org** (the "sign up and create an organization" flow, FR-2) uses the **Auth0 Management API** from your backend: create the Auth0 Organization, add the user as a member with the `owner` role, then create the matching `organization` + `membership` rows. That's a Phase 2 feature — this guide gets you to "log in to an existing org and hit protected, tenant-scoped endpoints."

---

## 5. Local subdomains (optional, for the subdomain model)

Production uses `acme.boardstack.com`; locally, browsers don't resolve subdomains of `localhost` by default. Options:

- Use `*.localhost` (works in Chrome/Edge/Firefox): `acme.localhost:3000` resolves to `127.0.0.1` automatically.
- Or add entries to `/etc/hosts`: `127.0.0.1 acme.localhost`.
- For now you can skip subdomains and rely on the `org_id` claim from `?organization=acme`; add the subdomain ↔ `org.slug` cross-check when you wire the web `proxy.ts` to read the host.

---

## 6. Verification checklist

- [ ] Auth0 API created with identifier matching `AUTH0_AUDIENCE`; RBAC + "add permissions to access token" enabled.
- [ ] Regular Web App created; callback `/auth/callback`, logout `/`, web origin set.
- [ ] Organization `acme` created; your user is a member with a role.
- [ ] `boardstack-web/.env.local` filled; `openssl` secret set.
- [ ] `lib/auth0.ts` + `src/proxy.ts` created; `/auth/login?organization=acme` logs you in.
- [ ] `/auth/profile` shows your session; token has `org_id` + `permissions`.
- [ ] `authenticate` + `resolveTenant` + `requirePermission` + `withTenantDb` wired on a route.
- [ ] Protected endpoint returns tenant-scoped data; `401` without token, `403` for wrong org/permission.

---

## 7. Where this lands in the plan

Completing this guide checks off the remaining **Phase 1** auth items (Auth0 tenant, `authenticate`, `resolveTenant`, Auth0 Next SDK) and opens **Phase 2** (org lifecycle, members, invitations, full RBAC) in `PROGRESS.md`.

---

## 8. Troubleshooting

- **`401` on every API call** — token audience mismatch. Ensure `authorizationParameters.audience` (web) === API identifier === `AUTH0_AUDIENCE` (api).
- **Token has no `org_id`** — you didn't log in *to an organization*. Use `/auth/login?organization=<name>` and ensure the app's Organizations setting allows business users.
- **Token has no `permissions`** — enable "Add Permissions in the Access Token" on the API's RBAC settings, and assign roles/permissions to the user within the org.
- **`Callback URL mismatch`** — the exact `http://localhost:3000/auth/callback` must be in Allowed Callback URLs.
- **SDK can't find config** — confirm `.env.local` (not `.env`) for the web app, and restart `npm run dev:web`.

---

*Next: build the org-creation flow (Management API) and members management — Phase 2.*
