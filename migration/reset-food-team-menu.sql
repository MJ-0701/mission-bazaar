-- Reset mission-bazaar-2026 operating data to one unified food team.
-- This deletes existing orders, menus, teams, and admin PIN rows for the event,
-- then re-seeds the food team + menus. 관리자 PIN(master/admin)은 별도로
-- migration/admin-pin.local.sql 로 시드한다. enum/제약은 migration/admin-roles.sql 선행.

with event_ref as (
  select id
  from events
  where code = 'mission-bazaar-2026'
  limit 1
),
deleted_orders as (
  delete from orders
  where event_id = (select id from event_ref)
  returning id
),
deleted_admin_pins as (
  delete from admin_pins
  where event_id = (select id from event_ref)
  returning id
),
deleted_menus as (
  delete from menus
  where event_id = (select id from event_ref)
  returning id
),
deleted_teams as (
  delete from teams
  where event_id = (select id from event_ref)
  returning id
),
reset_counter as (
  update events
  set
    current_order_number = 0,
    updated_at = now()
  where id = (select id from event_ref)
  returning id
),
inserted_team as (
  insert into teams (event_id, code, name, sort_order)
  select id, 'food', '먹거리팀', 10
  from event_ref
  returning id, event_id
),
inserted_menus as (
  insert into menus (
    event_id,
    team_id,
    code,
    name,
    price,
    category,
    sort_order,
    is_available
  )
  select
    inserted_team.event_id,
    inserted_team.id,
    menu.code,
    menu.name,
    menu.price,
    menu.category,
    menu.sort_order,
    true
  from inserted_team
  cross join (
    values
      ('food-canape-4', '카나페 4개', 3000, '디쉬', 10),
      ('food-morning-sandwich-set', '모닝샌드위치 세트 (대파크림치즈, 에그샐러드)', 6000, '디쉬', 20),
      ('food-watermelon-punch', '수박화채', 5000, '음료', 30),
      ('food-hallabong-ade', '한라봉에이드', 4000, '음료', 40),
      ('food-coffee', '커피', 3000, '음료', 50)
  ) as menu(code, name, price, category, sort_order)
  returning id
)
-- WITH 체인 종료용. 관리자 PIN은 여기서 시드하지 않고 migration/admin-pin.local.sql(master/admin)로 별도 적용.
select count(*) as inserted_menu_count from inserted_menus;
