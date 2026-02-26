# Database Rules

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
