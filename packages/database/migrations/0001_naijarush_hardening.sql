-- Naija Rush is accessed only by its own server (direct Postgres connection),
-- never through the Supabase Data API. Match the other Venix Platform product
-- schemas: RLS on every table, no policies, no access for anon/authenticated.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'naijarush' LOOP
    EXECUTE format('ALTER TABLE naijarush.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA naijarush FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA naijarush FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA naijarush FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA naijarush REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA naijarush REVOKE ALL ON SEQUENCES FROM anon, authenticated';
  END IF;
END $$;
