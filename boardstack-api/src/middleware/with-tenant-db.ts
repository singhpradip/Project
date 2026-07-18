import { prisma } from "../lib/prisma.js";

// Runs each request inside a transaction that sets the current org,
// so RLS scopes every query to that tenant.
export async function withTenantDb(req: any, _res: any, next: any) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_org = '${req.tenant.organizationId}'`,
      );
      req.db = tx; // handlers must use req.db, never the global prisma
      await next();
    });
  } catch (err) {
    next(err);
  }
}
