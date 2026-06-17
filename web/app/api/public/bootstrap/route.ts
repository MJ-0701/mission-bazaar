import { fail, ok } from "@/lib/http";
import { store } from "@/lib/store";
import type { PublicBootstrap } from "@/lib/types";

// 메뉴/팀/설정/품절은 거의 변하지 않으므로 짧은 TTL 인메모리 캐시로 동시 부하를 흡수한다.
// - TTL 동안은 Supabase 재조회 없이 즉시 응답(읽기 폭주 대응).
// - 캐시 미스 순간 동시 요청이 몰려도 inflight 공유로 Supabase 호출은 1회만 발생.
// - 품절 토글 등은 최대 TTL_MS 지연되어 반영(주문 생성은 별도로 최신 메뉴를 재검증하므로 안전).
const TTL_MS = 5000;
let cache: { data: PublicBootstrap; at: number } | null = null;
let inflight: Promise<PublicBootstrap> | null = null;

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < TTL_MS) {
      return ok(cache.data);
    }
    if (!inflight) {
      inflight = store
        .getPublicBootstrap()
        .then((data) => {
          cache = { data, at: Date.now() };
          return data;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return ok(await inflight);
  } catch (error) {
    return fail(error, 500);
  }
}
