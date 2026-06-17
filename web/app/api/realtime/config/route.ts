import { ok } from "@/lib/http";

// 브라우저 Realtime 구독용 공개 설정. anon key는 공개 키라 노출 OK.
// anon key 미설정(플레이스홀더)이면 enabled=false → 클라이언트는 폴링으로만 동작.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  // 유효한 anon key(JWT 또는 publishable)만 enabled. 짧은 플레이스홀더 제외.
  const enabled = Boolean(url && anonKey && anonKey.length > 40);
  return ok({
    enabled,
    url,
    anonKey,
    topic: "bazaar-orders",
    event: "orders_changed"
  });
}
