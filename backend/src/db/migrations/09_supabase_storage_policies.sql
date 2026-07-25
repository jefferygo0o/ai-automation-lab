/*
 * Migration 09: Supabase Storage RLS policies for agent-snapshots bucket.
 *
 * Run this on your Supabase database (SQL Editor or `supabase db push`)
 * if snapshot uploads fail with:
 *   "new row violates row-level security policy"
 *
 * The service_role key SHOULD bypass RLS, but Supabase Storage buckets
 * created via the dashboard may have restrictive default policies that
 * even service_role cannot override. These policies grant explicit
 * full access to the service_role for the agent-snapshots bucket.
 */

-- Grant service_role full access to the agent-snapshots bucket
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'service_role_all_agent_snapshots'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "service_role_all_agent_snapshots"
      ON storage.objects
      FOR ALL
      TO service_role
      USING (bucket_id = 'agent-snapshots')
      WITH CHECK (bucket_id = 'agent-snapshots');
  END IF;
END $$;

-- Also grant authenticated users read access (for public routes if needed)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'authenticated_read_agent_snapshots'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "authenticated_read_agent_snapshots"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'agent-snapshots');
  END IF;
END $$;
