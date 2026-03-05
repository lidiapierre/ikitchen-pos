# Action API — Important

Edge functions live in `supabase/functions/`, not here.

Do not create new edge functions in `apps/api/`. The Supabase CLI deploys from `supabase/functions/` automatically. Functions placed here will not be deployed.

See `supabase/CLAUDE.md` for edge function rules and structure.