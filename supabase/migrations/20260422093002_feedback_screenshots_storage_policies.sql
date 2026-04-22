-- Add RLS policies for feedback-screenshots storage bucket
-- These policies were applied directly to production on 2026-04-22 (bucket created in PR #443).
-- This migration tracks them in the repo so they are part of the migration history.
-- Uses DO blocks to avoid errors if policies already exist (idempotent).

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
