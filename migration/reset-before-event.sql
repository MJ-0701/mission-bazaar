-- 행사 전 테스트 데이터 초기화 (6/20 실행 예정)
-- 주문/섹션/항목/상태이력 전부 삭제 + 주문번호 카운터 0으로 리셋.
-- 메뉴·팀·관리자 PIN·계좌정보는 그대로 유지됨.
-- 실행 후 첫 실제 주문이 4청001부터 시작.

-- orders 삭제 시 order_sections / order_items / order_status_events 는
-- on delete cascade 로 자동 삭제됨.
delete from orders
where event_id = (select id from events where code = 'mission-bazaar-2026');

update events
set current_order_number = 0, updated_at = now()
where code = 'mission-bazaar-2026';

-- 주문번호는 create_order RPC 적용 후 order_number_seq(sequence)에서 발급되므로
-- 이 sequence도 함께 리셋해야 첫 실제 주문이 4청001부터 시작한다.
-- (RPC 미적용 환경이면 sequence가 없을 수 있어 IF EXISTS 가드)
do $$
begin
  if exists (select 1 from pg_class where relkind = 'S' and relname = 'order_number_seq') then
    perform setval('order_number_seq', 1, false); -- 다음 nextval = 1
  end if;
end $$;

-- 확인용: 0 이어야 정상
select code, current_order_number from events where code = 'mission-bazaar-2026';
