import type { NextFunction, Request, Response } from "express";
import { prismaAdmin } from "../lib/prisma-admin.js";

// Bridges Auth0 identity → internal tenant. Reads org_id + sub from the validated
// token, finds the organization, JIT-provisions the user + membership, and attaches
// req.tenant (used by withTenantDb to set the RLS context, and by authorize for RBAC).
export async function resolveTenant(req: Request, res: Response, next: NextFunction) {
  const claims: any = (req as any).auth?.payload ?? {};
  const auth0OrgId: string | undefined = claims.org_id;
  const auth0UserId: string | undefined = claims.sub;

  if (!auth0OrgId || !auth0UserId) {
    return res
      .status(401)
      .json({ error: { code: "no_org", message: "Token missing org_id or subject. Log in to an organization." } });
  }

  const org = await prismaAdmin.organization.findUnique({ where: { auth0OrgId } });
  if (!org) {
    return res
      .status(404)
      .json({ error: { code: "org_not_found", message: "Unknown organization" } });
  }

  // Provision the user from token claims (idempotent).
  const user = await prismaAdmin.appUser.upsert({
    where: { auth0UserId },
    update: { email: claims.email ?? undefined, name: claims.name ?? undefined },
    create: { auth0UserId, email: claims.email ?? "", name: claims.name ?? null },
  });

  // Provision membership. The token carrying this org_id already proves Auth0 membership,
  // so we trust it and create the link on first request (default role: owner for now).
  const membership = await prismaAdmin.membership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    update: {},
    create: { organizationId: org.id, userId: user.id, role: "owner" },
  });

  (req as any).tenant = {
    organizationId: org.id,
    userId: user.id,
    role: membership.role,
    permissions: (claims.permissions as string[]) ?? [],
  };
  next();
}
