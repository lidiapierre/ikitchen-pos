-- Drop unused tables.assigned_server_id column
-- Server assignment is tracked on sections (sections.assigned_server_id), not on individual tables.
-- This column was added in 20260401002000 but is not referenced by any code.
-- Rollback: ALTER TABLE public.tables ADD COLUMN assigned_server_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
--   (note: any data in this column prior to drop cannot be recovered)
ALTER TABLE public.tables DROP COLUMN IF EXISTS assigned_server_id;
