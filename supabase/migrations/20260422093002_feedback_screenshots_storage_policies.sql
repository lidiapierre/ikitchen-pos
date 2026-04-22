-- HUMAN REVIEW REQUIRED
-- Adds the feedback-screenshots storage bucket and its 3 RLS policies.
-- The bucket and policies were applied directly to production on 2026-04-22
-- (bucket created in PR #443, policies added by Stark as a hotfix).
-- This migration tracks them in the repo so schema history is complete.
-- Idempotent: bucket uses ON CONFLICT DO NOTHING; policies use pg_policies checks.
--
-- Security notes (intentional, matches production):
--   - SELECT is TO public: screenshots must be readable by unauthenticated clients
--     for the feedback widget to display uploaded images.
--   - DELETE is TO authenticated (any authenticated user): this is intentional for
--     the MVP; tighter scoping (by owner/role) can be added in a follow-up.

-- Rollback:
-- DROP POLICY "feedback_screenshots_delete_authenticated" ON storage.objects;
-- DROP POLICY "feedback_screenshots_select_public" ON storage.objects;
-- DROP POLICY "feedback_screenshots_insert_authenticated" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'feedback-screenshots';

-- Ensure the bucket exists (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-screenshots', 'feedback-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- INSERT policy: authenticated users can upload screenshots
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'feedback_screenshots_insert_authenticated'
  ) THEN
    CREATE POLICY "feedback_screenshots_insert_authenticated"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'feedback-screenshots');
  END IF;
END $$;

-- SELECT policy: public (unauthenticated) read access intentional — required for
-- the feedback widget to render uploaded screenshots without auth context.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'feedback_screenshots_select_public'
  ) THEN
    CREATE POLICY "feedback_screenshots_select_public"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'feedback-screenshots');
  END IF;
END $$;

-- DELETE policy: any authenticated user can delete — intentional for MVP.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'feedback_screenshots_delete_authenticated'
  ) THEN
    CREATE POLICY "feedback_screenshots_delete_authenticated"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'feedback-screenshots');
  END IF;
END $$;
