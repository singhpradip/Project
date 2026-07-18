import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

// TRUSTED auth-resolution client. Connects as the DB owner (DIRECT_URL), which is a
// superuser and therefore bypasses RLS. Use ONLY for authentication plumbing:
// looking up an organization by its Auth0 id, and provisioning the user + membership.
// NEVER use this for tenant data queries — those must go through the app-role client
// (lib/prisma.ts) under withTenantDb so RLS applies.
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
export const prismaAdmin = new PrismaClient({ adapter });
