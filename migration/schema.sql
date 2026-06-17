-- Target database: Supabase Postgres
-- This schema models one customer order with one or more team-specific order sections.

create extension if not exists pgcrypto;

create type order_status as enum (
  'PAYMENT_PENDING',
  'PAYMENT_CHECKING',
  'PAID',
  'READY',
  'COMPLETE',
  'PAYMENT_ISSUE',
  'CANCELED'
);

create type admin_role as enum (
  'team'
);

create table events (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  order_prefix text not null default 'A',
  current_order_number integer not null default 0,
  bank_name text not null default '',
  account_number text not null default '',
  account_holder text not null default '',
  qr_image_url text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, code)
);

create table admin_pins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  role admin_role not null,
  pin_hash text not null,
  label text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    role = 'team' and team_id is not null
  )
);

create table menus (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  team_id uuid not null references teams(id) on delete restrict,
  code text not null,
  name text not null,
  price integer not null check (price >= 0),
  category text not null default '기타',
  is_available boolean not null default true,
  sort_order integer not null default 999,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, code)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  order_no text not null,
  order_token_hash text not null,
  pickup_name text not null,
  phone text not null,
  depositor_name text not null default '',
  customer_key text not null,
  memo text not null default '',
  total_amount integer not null check (total_amount >= 0),
  payment_method text not null default 'TRANSFER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, order_no)
);

create table order_sections (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  team_id uuid not null references teams(id) on delete restrict,
  status order_status not null default 'PAYMENT_PENDING',
  subtotal_amount integer not null check (subtotal_amount >= 0),
  admin_note text not null default '',
  status_updated_at timestamptz not null default now(),
  status_updated_by text not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, team_id)
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  order_section_id uuid not null references order_sections(id) on delete cascade,
  menu_id uuid references menus(id) on delete set null,
  team_id uuid not null references teams(id) on delete restrict,
  menu_code text not null,
  menu_name text not null,
  category text not null,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0 and quantity <= 99),
  subtotal integer not null check (subtotal >= 0),
  created_at timestamptz not null default now()
);

create table order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  order_section_id uuid references order_sections(id) on delete cascade,
  from_status order_status,
  to_status order_status not null,
  actor_type text not null,
  actor_label text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index idx_orders_event_customer on orders(event_id, customer_key, created_at desc);
create index idx_orders_event_order_no on orders(event_id, order_no);
create index idx_order_sections_status on order_sections(status, status_updated_at desc);
create index idx_order_sections_team_status on order_sections(team_id, status, status_updated_at desc);
create index idx_order_items_order on order_items(order_id);
create index idx_menus_event_team_sort on menus(event_id, team_id, sort_order, name);

create or replace function next_order_no(target_event_code text)
returns text
language plpgsql
security definer
as $$
declare
  next_num integer;
  prefix text;
begin
  update events
  set
    current_order_number = current_order_number + 1,
    updated_at = now()
  where code = target_event_code
    and is_active = true
  returning current_order_number, order_prefix
  into next_num, prefix;

  if next_num is null then
    raise exception 'active event not found: %', target_event_code;
  end if;

  return prefix || lpad(next_num::text, 3, '0');
end;
$$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_events_updated_at
before update on events
for each row execute function set_updated_at();

create trigger set_teams_updated_at
before update on teams
for each row execute function set_updated_at();

create trigger set_menus_updated_at
before update on menus
for each row execute function set_updated_at();

create trigger set_orders_updated_at
before update on orders
for each row execute function set_updated_at();

create trigger set_order_sections_updated_at
before update on order_sections
for each row execute function set_updated_at();

-- RLS baseline: keep tables private. Next.js API routes use service role.
alter table events enable row level security;
alter table teams enable row level security;
alter table admin_pins enable row level security;
alter table menus enable row level security;
alter table orders enable row level security;
alter table order_sections enable row level security;
alter table order_items enable row level security;
alter table order_status_events enable row level security;
