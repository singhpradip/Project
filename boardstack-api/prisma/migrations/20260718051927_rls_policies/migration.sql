-- Turn on RLS and add the isolation policy for each tenant table.
ALTER TABLE membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership FORCE  ROW LEVEL SECURITY;
ALTER TABLE project    ENABLE ROW LEVEL SECURITY;
ALTER TABLE project    FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON membership
  USING      (organization_id = current_setting('app.current_org')::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org')::uuid);

CREATE POLICY tenant_isolation ON project
  USING      (organization_id = current_setting('app.current_org')::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org')::uuid);

-- The app role can touch tables, but RLS still filters the rows it sees.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO boardstack_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO boardstack_app;