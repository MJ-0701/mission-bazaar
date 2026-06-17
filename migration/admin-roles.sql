-- 관리자 권한 분리: master(전체 + 입금확인) / admin(입금확인 제외 전체).
-- 기존 단일 'team' 역할 모델 → master/admin 2역할.
-- ⚠️ Supabase SQL Editor에서 [STEP 1]을 먼저 단독 실행(커밋)한 뒤 [STEP 2]를 실행.
--    ALTER TYPE ... ADD VALUE 는 같은 트랜잭션에서 곧바로 사용할 수 없기 때문.
-- 실제 PIN 해시 INSERT는 secret이라 migration/admin-pin.local.sql(git 제외)에 둔다.

-- ===== STEP 1 (단독 실행) =====
alter type admin_role add value if not exists 'master';
alter type admin_role add value if not exists 'admin';

-- ===== STEP 2 (STEP 1 커밋 후 실행) =====
-- master/admin은 team_id가 null이므로 기존 'team' 강제 check 제약 제거.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'admin_pins'::regclass and contype = 'c'
  loop
    execute format('alter table admin_pins drop constraint %I', c);
  end loop;
end $$;
