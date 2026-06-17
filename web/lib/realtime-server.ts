// 서버에서 주문 변경 시 Supabase Realtime broadcast 핑 전송(공개 채널, 데이터 없음).
// REST broadcast 엔드포인트는 stateless HTTP POST → 지속연결/Redis/트리거 불필요.
// 브라우저는 anon key로 동일 public 채널을 구독해 핑 수신 후 기존 API로 재조회.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TOPIC = "bazaar-orders";
const EVENT = "orders_changed";

export async function publishOrderChange(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || SUPABASE_URL.includes("your-project")) {
    return;
  }
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        messages: [{ topic: TOPIC, event: EVENT, payload: { at: Date.now() }, private: false }]
      }),
      cache: "no-store"
    });
  } catch {
    // 브로드캐스트 실패는 무시 — 클라이언트 폴링이 백업.
  }
}
