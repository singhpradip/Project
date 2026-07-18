import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import "dotenv/config";

const app: Express = express();

app.use(helmet()); // security HTTP headers
app.use(cors({ origin: process.env.WEB_ORIGIN, credentials: true })); // allow the web app to call us
app.use(express.json()); // parse JSON request bodies
app.use(cookieParser()); // parse cookies (for the session later)

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`API listening on :${port}`));
