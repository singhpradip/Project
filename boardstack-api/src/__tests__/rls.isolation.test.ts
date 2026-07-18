/**
 * RLS cross-tenant isolation test  (Phase 1 exit criterion, NFR-1)
 *
 * Proves that a connection using the NON-superuser app role (boardstack_app, DATABASE_URL)
 * can only ever see/modify rows for the organization set in `app.current_org`, even though
 * the database physically contains rows for other organizations.
 *
 * Two connections are used:
 *   - owner (DIRECT_URL, `postgres`)  → seeds data for two orgs, bypassing app-role limits
 *   - app   (DATABASE_URL, `boardstack_app`, NOBYPASSRLS) → the one RLS actually constrains
 *
 * Run:  npm test        (from boardstack-api/)
 */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const owner = new Client({ connectionString: process.env.DIRECT_URL });
const app = new Client({ connectionString: process.env.DATABASE_URL });

// Unique suffix so repeated runs don't collide on unique slugs/keys.
const run = Date.now();
let orgA = "";
let orgB = "";

/** Run a query on the app connection inside a tenant context (RLS requires SET LOCAL in a txn). */
async function asTenant<T = any>(orgId: string, sql: string, params: any[] = []) {
  await app.query("BEGIN");
  try {
    // set_config(key, value, is_local=true) == SET LOCAL, but parameterizable
    await app.query("SELECT set_config('app.current_org', $1, true)", [orgId]);
    const res = await app.query(sql, params);
    await app.query("COMMIT");
    return res.rows as T[];
  } catch (err) {
    await app.query("ROLLBACK");
    throw err;
  }
}

beforeAll(async () => {
  await owner.connect();
  await app.connect();

  // Seed two organizations, each with one project — via the OWNER (not subject to our test).
  // NOTE: Prisma's @default(uuid()) generates ids in the client, so the DB columns
  // have no default. Inserting via raw SQL, we generate them with gen_random_uuid().
  const a = await owner.query(
    `INSERT INTO organization (id, auth0_org_id, name, slug)
     VALUES (gen_random_uuid(), $1, 'Org A', $2) RETURNING id`,
    [`auth0|A-${run}`, `org-a-${run}`],
  );
  const b = await owner.query(
    `INSERT INTO organization (id, auth0_org_id, name, slug)
     VALUES (gen_random_uuid(), $1, 'Org B', $2) RETURNING id`,
    [`auth0|B-${run}`, `org-b-${run}`],
  );
  orgA = a.rows[0].id;
  orgB = b.rows[0].id;

  await owner.query(
    `INSERT INTO project (id, organization_id, key, name) VALUES (gen_random_uuid(), $1, 'AAA', 'Project A')`,
    [orgA],
  );
  await owner.query(
    `INSERT INTO project (id, organization_id, key, name) VALUES (gen_random_uuid(), $1, 'BBB', 'Project B')`,
    [orgB],
  );
});

afterAll(async () => {
  // Clean up (cascades to projects). Runs as owner.
  if (orgA) await owner.query(`DELETE FROM organization WHERE id = $1`, [orgA]);
  if (orgB) await owner.query(`DELETE FROM organization WHERE id = $1`, [orgB]);
  await owner.end();
  await app.end();
});

describe("Row-Level Security tenant isolation", () => {
  it("reads only the current org's projects", async () => {
    const rowsA = await asTenant(orgA, `SELECT key FROM project`);
    expect(rowsA.map((r) => r.key)).toEqual(["AAA"]); // sees A, never B

    const rowsB = await asTenant(orgB, `SELECT key FROM project`);
    expect(rowsB.map((r) => r.key)).toEqual(["BBB"]); // sees B, never A
  });

  it("cannot SELECT another org's project even by id", async () => {
    // In org A's context, try to read org B's rows explicitly — RLS returns zero.
    const leaked = await asTenant(
      orgA,
      `SELECT * FROM project WHERE organization_id = $1`,
      [orgB],
    );
    expect(leaked).toHaveLength(0);
  });

  it("cannot INSERT a row for another org (WITH CHECK blocks it)", async () => {
    // In org A's context, try to create a project tagged as org B → must be rejected.
    await expect(
      asTenant(
        orgA,
        `INSERT INTO project (id, organization_id, key, name) VALUES (gen_random_uuid(), $1, 'HACK', 'Sneaky')`,
        [orgB],
      ),
    ).rejects.toThrow(); // row-level security policy violation

    // And confirm nothing was written for org B.
    const bProjects = await asTenant(orgB, `SELECT key FROM project`);
    expect(bProjects.map((r) => r.key)).toEqual(["BBB"]);
  });

  it("cannot UPDATE another org's rows", async () => {
    // In org A's context, attempt to rename all of org B's projects → affects 0 rows.
    await app.query("BEGIN");
    await app.query("SELECT set_config('app.current_org', $1, true)", [orgA]);
    const res = await app.query(
      `UPDATE project SET name = 'pwned' WHERE organization_id = $1`,
      [orgB],
    );
    await app.query("COMMIT");
    expect(res.rowCount).toBe(0); // RLS made org B's rows invisible to the UPDATE
  });
});
