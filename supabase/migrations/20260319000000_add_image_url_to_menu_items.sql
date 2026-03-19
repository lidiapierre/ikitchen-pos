-- Add description and image_url to menu_items
ALTER TABLE menu_items ADD COLUMN description text;
ALTER TABLE menu_items ADD COLUMN image_url text;

-- Create menu-uploads storage bucket for item photos and PDF menus
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-uploads', 'menu-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
CREATE POLICY "menu_uploads_insert_authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'menu-uploads');

-- Allow public read access for uploaded images
CREATE POLICY "menu_uploads_select_public"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'menu-uploads');

-- Allow authenticated users to delete their uploads
CREATE POLICY "menu_uploads_delete_authenticated"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'menu-uploads');

-- Rollback:
-- DROP POLICY "menu_uploads_delete_authenticated" ON storage.objects;
-- DROP POLICY "menu_uploads_select_public" ON storage.objects;
-- DROP POLICY "menu_uploads_insert_authenticated" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'menu-uploads';
-- ALTER TABLE menu_items DROP COLUMN image_url;
-- ALTER TABLE menu_items DROP COLUMN description;
