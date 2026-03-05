# Database & Edge Function Rules

## Edge functions

All edge functions live in `supabase/functions/<action-name>/index.ts`.
This is where the Supabase CLI looks when running `supabase functions deploy`.
Never create edge functions in `apps/api/` — they will not be deployed.

### Edge function structure

```
supabase/functions/<action-name>/
  index.ts       # Handler
  validator.ts   # Input validation
```

### Every action must

1. Validate the caller's role (see `docs/architecture.md` section 11)
2. Validate the state transition is legal
3. Emit an audit event to `audit_log` for destructive actions (see section 12)
4. Return a structured result: `{ success: boolean, data?: T, error?: string }`

### CORS

Every edge function must handle OPTIONS preflight and include `x-demo-staff-id` in allowed headers:

```ts
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-staff-id',
}

if (req.method === 'OPTIONS') {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
```

### Error handling

- Never expose internal error details to the client
- Log full error internally, return a safe generic message externally
- Use typed error codes, not free-form strings

## Migrations

- Every schema change must be a migration file in `/supabase/migrations/`
- Never modify schema via the Supabase dashboard
- Migration filenames: `YYYYMMDDHHMMSS_description.sql`
- Each migration must be reversible — include a rollback comment if not obvious
- Test every migration with `supabase db reset` before opening a PR

## RLS

- RLS must be enabled on every table — no exceptions
- New tables must have at least a stub policy before merging
- Flag any RLS policy change with a comment for human review: `-- HUMAN REVIEW REQUIRED`

## Naming conventions

- Tables: `snake_case`, plural (e.g. `orders`, `menu_items`)
- Columns: `snake_case`
- Foreign keys: `<table_singular>_id` (e.g. `order_id`, `restaurant_id`)
- Indexes: `idx_<table>_<column>`
- Timestamps: always include `created_at` and `updated_at` on every table

## Audit log

- Every destructive action (delete, void, cancel) must insert a row into `audit_log`
- Audit log is append-only — never update or delete rows from it
- Flag any change to audit logic for human review: `-- HUMAN REVIEW REQUIRED`

## Core tables

`restaurants`, `users`, `roles`, `tables`, `menus`, `menu_items`, `modifiers`,
`orders`, `order_items`, `payments`, `shifts`, `audit_log`