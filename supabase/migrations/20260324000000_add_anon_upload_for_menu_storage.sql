-- Allow anon role to upload to menu-uploads bucket
-- Required until Supabase Auth is implemented (issue #92)
-- Once auth is live, this policy should be replaced with an authenticated-only policy
-- HUMAN REVIEW REQUIRED when auth is added

CREATE POLICY "menu_uploads_insert_anon"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'menu-uploads');

-- Rollback:
-- DROP POLICY "menu_uploads_insert_anon" ON storage.objects;
