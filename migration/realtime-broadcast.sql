-- 실시간 싱크: 주문/섹션 변경 시 Supabase Realtime Broadcast로 "바뀜" 핑 전송.
-- 클라이언트(운영/손님)는 이 핑을 받으면 기존 API로 즉시 재조회. 핑엔 PII 없음(공개 채널 OK).
-- Supabase SQL Editor에서 1회 실행.
-- 선행: Supabase Dashboard → Settings → API 의 anon(public) key를 web 환경변수
--       NEXT_PUBLIC_SUPABASE_ANON_KEY 에 넣고 재배포해야 브라우저가 구독 가능.

create or replace function notify_order_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  perform realtime.send(
    jsonb_build_object('at', extract(epoch from now())),  -- payload: 데이터 없음, 핑만
    'orders_changed',                                      -- event
    'bazaar-orders',                                       -- topic(채널)
    false                                                  -- private=false (공개 핑 채널)
  );
  return null;
end;
$$;

-- 주문 생성/상태변경은 모두 order_sections insert/update를 동반 → 이 트리거 하나로 커버.
drop trigger if exists trg_order_sections_notify on order_sections;
create trigger trg_order_sections_notify
after insert or update on order_sections
for each row
execute function notify_order_change();
