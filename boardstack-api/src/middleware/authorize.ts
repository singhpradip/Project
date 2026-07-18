import type { NextFunction, Request, Response } from "express";

// RBAC guard: requires a specific permission (from the token's `permissions` claim,
// populated by the roles you assigned in Auth0). Use on mutating routes, e.g.
//   app.post("/api/v1/projects", authenticate, resolveTenant, requirePermission("project:write"), ...)
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const perms: string[] = (req as any).tenant?.permissions ?? [];
    if (!perms.includes(permission)) {
      return res
        .status(403)
        .json({ error: { code: "forbidden", message: `Missing permission: ${permission}` } });
    }
    next();
  };
}
