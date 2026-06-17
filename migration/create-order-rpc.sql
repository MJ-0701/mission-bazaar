-- 주문 생성을 단일 트랜잭션 / 단일 왕복으로 처리하는 RPC.
-- 기존 앱 경로: next_order_no + orders insert + order_sections insert + order_items insert = 순차 4왕복.
-- 변경: 이 함수 1회 호출로 카운터 증가 + 3종 insert를 한 트랜잭션에서 수행 → 동시주문 p95 대폭 개선.
-- 가격/품절은 서버(menus 테이블) 권위값으로 재검증 — 클라이언트가 보낸 가격을 신뢰하지 않음.
-- 같은 menu_id가 중복으로 와도 menu_id 단위로 합산 후 1..99 검증(메뉴당 99 상한 우회 방지).
-- 실패 시(품절/잘못된 메뉴/수량초과/행사없음) RAISE → 트랜잭션 전체 롤백 → 카운터 증가도 되돌아가 번호 누수 없음.
-- Supabase SQL Editor에서 1회 실행.

create or replace function create_order(
  p_event_code     text,
  p_pickup_name    text,
  p_phone          text,
  p_depositor_name text,
  p_customer_key   text,
  p_memo           text,
  p_token_hash     text,
  p_items          jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id    uuid;
  v_num         integer;
  v_prefix      text;
  v_order_no    text;
  v_total       integer;
  v_order       orders;
  v_line_count  integer;
  v_avail_count integer;
  v_result      jsonb;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception '주문할 메뉴가 없습니다.' using errcode = 'P0001';
  end if;

  -- 요청 아이템을 menu_id 단위로 합산 (중복 menuId 병합) — 세션 임시 테이블
  create temporary table _li on commit drop as
  select i.menu_id, sum(i.quantity)::int as quantity
    from jsonb_to_recordset(p_items) as i(menu_id uuid, quantity int)
   where i.menu_id is not null and i.quantity is not null
   group by i.menu_id;

  select count(*) into v_line_count from _li;
  if v_line_count = 0 then
    raise exception '주문할 메뉴가 없습니다.' using errcode = 'P0001';
  end if;

  -- 합산 수량이 1..99 범위인지 (메뉴당 99 상한)
  if exists (select 1 from _li where quantity < 1 or quantity > 99) then
    raise exception '한 메뉴는 최대 99개까지 주문할 수 있습니다.' using errcode = 'P0001';
  end if;

  -- 원자적 카운터 증가 + 이벤트 확보 (단일 UPDATE = 행 락으로 직렬화, 번호 중복 0)
  update events
     set current_order_number = current_order_number + 1,
         updated_at = now()
   where code = p_event_code and is_active = true
  returning id, current_order_number, order_prefix
       into v_event_id, v_num, v_prefix;

  if v_event_id is null then
    raise exception '진행 중인 행사를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  v_order_no := v_prefix || lpad(v_num::text, 3, '0');

  -- 요청 메뉴가 전부 이 행사에 존재하고 판매중인지 검증
  select count(*) into v_avail_count
    from _li l
    join menus m
      on m.id = l.menu_id
     and m.event_id = v_event_id
     and m.is_available = true;
  if v_avail_count <> v_line_count then
    raise exception '선택한 메뉴 중 판매 종료되었거나 잘못된 항목이 있습니다.' using errcode = 'P0001';
  end if;

  -- 합계 (서버 권위 가격)
  select coalesce(sum(m.price * l.quantity), 0)::int into v_total
    from _li l
    join menus m on m.id = l.menu_id and m.event_id = v_event_id;

  insert into orders(event_id, order_no, order_token_hash, pickup_name, phone,
                     depositor_name, customer_key, memo, total_amount, payment_method)
  values (v_event_id, v_order_no, p_token_hash, p_pickup_name, p_phone,
          p_depositor_name, p_customer_key, coalesce(p_memo, ''), v_total, 'TRANSFER')
  returning * into v_order;

  -- 팀별 섹션
  insert into order_sections(order_id, team_id, status, subtotal_amount)
  select v_order.id, m.team_id, 'PAYMENT_PENDING', sum(m.price * l.quantity)::int
    from _li l
    join menus m on m.id = l.menu_id and m.event_id = v_event_id
   group by m.team_id;

  -- 아이템 (메뉴당 1행, 팀으로 섹션에 연결)
  insert into order_items(order_id, order_section_id, menu_id, team_id,
                          menu_code, menu_name, category, unit_price, quantity, subtotal)
  select v_order.id, sec.id, m.id, m.team_id,
         m.code, m.name, m.category, m.price, l.quantity, (m.price * l.quantity)::int
    from _li l
    join menus m on m.id = l.menu_id and m.event_id = v_event_id
    join order_sections sec on sec.order_id = v_order.id and sec.team_id = m.team_id;

  -- 앱 매퍼(mapOrder)가 그대로 소비하도록 REST row 형태로 직렬화
  select jsonb_build_object(
    'order', to_jsonb(v_order),
    'sections', coalesce((
       select jsonb_agg(to_jsonb(sec) || jsonb_build_object('teams', to_jsonb(t)))
         from order_sections sec
         join teams t on t.id = sec.team_id
        where sec.order_id = v_order.id), '[]'::jsonb),
    'items', coalesce((
       select jsonb_agg(to_jsonb(it))
         from order_items it
        where it.order_id = v_order.id), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
