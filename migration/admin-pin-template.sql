-- Replace the hash values using:
-- COOKIE_SECRET='<same-as-web-env>' EVENT_CODE='mission-bazaar-2026' node web/scripts/hash-admin-pin.mjs 0000 1111 2222

delete from admin_pins
where event_id = (select id from events where code = 'mission-bazaar-2026');

insert into admin_pins (event_id, team_id, role, pin_hash, label)
select
  events.id,
  null,
  'master',
  '<MASTER_PIN_HASH>',
  'master'
from events
where events.code = 'mission-bazaar-2026';

insert into admin_pins (event_id, team_id, role, pin_hash, label)
select
  events.id,
  teams.id,
  'team',
  '<YEONGJU_PIN_HASH>',
  '영주팀'
from events
join teams on teams.event_id = events.id and teams.code = 'yeongju'
where events.code = 'mission-bazaar-2026';

insert into admin_pins (event_id, team_id, role, pin_hash, label)
select
  events.id,
  teams.id,
  'team',
  '<JEJU_PIN_HASH>',
  '제주팀'
from events
join teams on teams.event_id = events.id and teams.code = 'jeju'
where events.code = 'mission-bazaar-2026';
