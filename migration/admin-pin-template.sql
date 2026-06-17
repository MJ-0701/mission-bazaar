-- 관리자 PIN 템플릿 (실제 해시는 git 제외 admin-pin.local.sql 에).
-- 선행조건: migration/admin-roles.sql 의 STEP 1(enum)·STEP 2(check 제거) 적용.
-- 해시 생성:
--   COOKIE_SECRET='<same-as-web-env>' EVENT_CODE='mission-bazaar-2026' \
--     node web/scripts/hash-admin-pin.mjs '<MASTER_PIN>' '<ADMIN_PIN>'

delete from admin_pins
where event_id = (select id from events where code = 'mission-bazaar-2026');

-- master: 전체 권한 + 입금확인
insert into admin_pins (event_id, team_id, role, pin_hash, label)
select events.id, null, 'master', '<MASTER_PIN_HASH>', 'master'
from events where events.code = 'mission-bazaar-2026';

-- admin: 입금확인 제외 전체
insert into admin_pins (event_id, team_id, role, pin_hash, label)
select events.id, null, 'admin', '<ADMIN_PIN_HASH>', 'admin'
from events where events.code = 'mission-bazaar-2026';
