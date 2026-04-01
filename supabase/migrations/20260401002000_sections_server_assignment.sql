-- Migration: Sections + Server Assignment
-- Issue #275: sections with own grid layouts, server assignment, order transfer

CREATE TABLE IF NOT EXISTS public.sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  assigned_server_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  grid_cols INTEGER NOT NULL DEFAULT 8,
  grid_rows INTEGER NOT NULL DEFAULT 6,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "restaurant_isolation" ON public.sections
  FOR ALL
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL;
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS assigned_server_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sections_restaurant_id ON public.sections(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tables_section_id ON public.tables(section_id);
