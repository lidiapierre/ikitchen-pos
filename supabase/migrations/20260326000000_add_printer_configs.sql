create table if not exists printer_configs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  mode text not null default 'browser' check (mode in ('browser', 'network')),
  ip text,
  port integer default 9100,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(restaurant_id)
);

alter table printer_configs enable row level security;

create policy "Staff can read printer config"
  on printer_configs for select
  using (true);

create policy "Owners can manage printer config"
  on printer_configs for all
  using (
    exists (select 1 from users where id = auth.uid() and role in ('owner', 'admin'))
  );
