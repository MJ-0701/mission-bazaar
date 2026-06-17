-- 실시간 싱크 방식: 서버(Next API)가 주문 변경 시 Supabase Realtime REST broadcast로
-- 공개 채널('bazaar-orders')에 "바뀜" 핑 전송 → 브라우저가 anon key로 구독해 즉시 재조회.
-- DB 트리거(realtime.send) 방식은 private 채널 + realtime.messages RLS가 필요해 폐기.
-- 따라서 별도 DB 오브젝트 불필요. 아래는 이전에 만든 트리거가 있으면 정리하는 SQL.

drop trigger if exists trg_order_sections_notify on order_sections;
drop function if exists notify_order_change();
