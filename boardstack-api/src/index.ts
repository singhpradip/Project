import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import "dotenv/config";
import { authenticate } from "./middleware/authenticate.js";
import { resolveTenant } from "./middleware/resolve-tenant.js";
import { withTenant } from "./middleware/with-tenant-db.js";
// import { requirePermission } from "./middleware/authorize.js"; // add on mutating routes

const app: Express = express();

app.use(helmet()); // security HTTP headers
app.use(cors({ origin: process.env.WEB_ORIGIN, credentials: true })); // allow the web app to call us
app.use(express.json()); // parse JSON request bodies
app.use(cookieParser()); // parse cookies

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Protected, tenant-scoped route. Pipeline:
//   authenticate  → verify JWT
//   resolveTenant → org_id/sub → org + user + membership → req.tenant
//   withTenantDb  → BEGIN; SET LOCAL app.current_org; req.db (app role, RLS on)
app.get(
  "/api/v1/projects",
  authenticate,
  resolveTenant,
  withTenant(async (req: Request, res: Response) => {
    const projects = await (req as any).db.project.findMany({
      orderBy: { createdAt: "asc" },
    });
    res.json({ data: projects });
  }),
);

// Error handler (last). Turns auth failures into 401, everything else 500.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.status === 401 || err?.name === "UnauthorizedError" || err?.code === "invalid_token") {
    // Log the real reason so we can diagnose (aud/iss/expiry/signature mismatch).
    console.error("AUTH 401:", err?.code, "-", err?.message);
    return res
      .status(401)
      .json({ error: { code: "unauthorized", message: "Invalid or missing token", detail: err?.message } });
  }
  console.error(err);
  res.status(500).json({ error: { code: "server_error", message: "Something went wrong" } });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`API listening on :${port}`));
