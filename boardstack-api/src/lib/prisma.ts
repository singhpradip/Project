import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

// Runtime connects as the weak app role (RLS applies). Note the import path:
// Prisma 7 generates the client into src/generated/prisma, NOT "@prisma/client".
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });
