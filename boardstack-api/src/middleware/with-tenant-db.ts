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
