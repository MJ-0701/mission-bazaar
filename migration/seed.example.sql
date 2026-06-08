-- Example seed data for local/staging Supabase.
-- Replace bank/account/QR/admin pin hashes before production use.

with inserted_event as (
  insert into events (
    code,
    title,
    order_prefix,
    bank_name,
    account_number,
    account_holder,
    qr_image_url
  )
  values (
    'mission-bazaar-2026',
    '선교 바자회',
    'A',
    '은행명',
    '계좌번호',
    '예금주',
    ''
  )
  on conflict (code) do update set
    title = excluded.title,
    bank_name = excluded.bank_name,
    account_number = excluded.account_number,
    account_holder = excluded.account_holder,
    qr_image_url = excluded.qr_image_url,
    updated_at = now()
  returning id
),
event_ref as (
  select id from inserted_event
  union
  select id from events where code = 'mission-bazaar-2026'
  limit 1
),
inserted_teams as (
  insert into teams (event_id, code, name, sort_order)
  select event_ref.id, team.code, team.name, team.sort_order
  from event_ref
  cross join (
    values
      ('yeongju', '영주팀', 10),
      ('jeju', '제주팀', 20)
  ) as team(code, name, sort_order)
  on conflict (event_id, code) do update set
    name = excluded.name,
    sort_order = excluded.sort_order,
    updated_at = now()
  returning id, event_id, code
),
team_ref as (
  select id, event_id, code from inserted_teams
  union
  select teams.id, teams.event_id, teams.code
  from teams
  join event_ref on teams.event_id = event_ref.id
)
insert into menus (
  event_id,
  team_id,
  code,
  name,
  price,
  category,
  sort_order
)
select
  team_ref.event_id,
  team_ref.id,
  menu.code,
  menu.name,
  menu.price,
  menu.category,
  menu.sort_order
from team_ref
join (
  values
    ('yeongju', 'yeongju-morning-sand', '모닝샌드', 8000, '음식', 10),
    ('yeongju', 'yeongju-blueberry-ade', '블루베리 에이드', 4500, '음료', 20),
    ('yeongju', 'yeongju-americano', '아메리카노', 3000, '음료', 30),
    ('yeongju', 'yeongju-honey-black-tea', '자몽허니 블랙티', 4500, '음료', 40),
    ('jeju', 'jeju-main-dish', 'Main-Dish', 7000, '음식', 10),
    ('jeju', 'jeju-drink', 'Drink', 4500, '음료', 20)
) as menu(team_code, code, name, price, category, sort_order)
  on menu.team_code = team_ref.code
on conflict (event_id, code) do update set
  team_id = excluded.team_id,
  name = excluded.name,
  price = excluded.price,
  category = excluded.category,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Admin PIN hashes are inserted by the app/admin setup script after hashing raw PINs.
-- Required rows:
-- - role master, team_id null
-- - role team, team_id yeongju
-- - role team, team_id jeju
