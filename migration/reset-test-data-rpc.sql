-- 테스트 데이터 리셋 RPC. 테스트 기간 동안 on-demand로 호출해 주문/카운터/시퀀스를 비운다.
-- ⚠️ 행사 당일(실주문 발생 후)에는 호출 금지 — 전체 주문 삭제다.
-- Supabase SQL Editor에서 1회 적용. 이후 앱/스크립트가 POST /rest/v1/rpc/reset_test_data 로 호출.
-- 메뉴·팀·관리자 PIN·계좌정보는 보존.

create or replace function reset_test_data(p_event_code text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_deleted  integer;
begin
  select id into v_event_id from events where code = p_event_code;
  if v_event_id is null then
    raise exception '행사를 찾을 수 없습니다: %', p_event_code using errcode = 'P0001';
  end if;

  delete from orders where event_id = v_event_id;  -- sections/items/status_events 는 cascade
  get diagnostics v_deleted = row_count;

  update events set current_order_number = 0, updated_at = now() where id = v_event_id;

  if exists (select 1 from pg_class where relkind = 'S' and relname = 'order_number_seq') then
    perform setval('order_number_seq', 1, false);  -- 다음 주문 = 4청001
  end if;

  return v_deleted;  -- 삭제된 주문 수
end;
$$;
