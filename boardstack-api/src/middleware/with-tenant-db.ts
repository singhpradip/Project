import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

type TenantHandler = (req: Request, res: Response) => Promise<void> | void;

// Wraps a route handler so it runs INSIDE a transaction with the tenant's RLS
// context set. Using a wrapper (instead of a plain next()-style middleware)
// guarantees the handler's queries execute BEFORE the transaction commits.
//
// Usage:
//   app.get("/api/v1/projects", authenticate, resolveTenant, withTenant(async (req, res) => {
//     const rows = await (req as any).db.project.findMany();
//     res.json({ data: rows });
//   }));
export function withTenant(handler: TenantHandler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.$transaction(async (tx) => {
        // SET LOCAL scopes the org to this transaction only (safe on pooled connections).
        await tx.$executeRawUnsafe(
          `SET LOCAL app.current_org = '${(req as any).tenant.organizationId}'`,
        );
        (req as any).db = tx; // handlers use req.db (RLS-scoped), never the global prisma
        await handler(req, res);
      });
    } catch (err) {
      next(err);
    }
  };
}
