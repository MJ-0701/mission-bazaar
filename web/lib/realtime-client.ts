"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type RealtimeHandle = { close: () => void };

// 주문 변경 broadcast 핑 구독. 핑 받으면 onChange() 호출(기존 API로 재조회).
// onStatus(true)=구독 성공 → 폴링을 느슨하게, false=실패 → 폴링 백업 유지.
// anon key 미설정/연결 실패 시 null 반환(폴링 폴백).
export async function subscribeOrders(
  onChange: () => void,
  onStatus?: (connected: boolean) => void
): Promise<RealtimeHandle | null> {
  try {
    const res = await fetch("/api/realtime/config", { cache: "no-store" });
    const json = (await res.json()) as {
      ok: boolean;
      data?: { enabled: boolean; url: string; anonKey: string; topic: string; event: string };
    };
    if (!json.ok || !json.data?.enabled) {
      return null;
    }
    const { url, anonKey, topic, event } = json.data;
    const client: SupabaseClient = createClient(url, anonKey, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 10 } }
    });
    const channel = client.channel(topic, { config: { broadcast: { self: false } } });
    channel
      .on("broadcast", { event }, () => onChange())
      .subscribe((status) => {
        onStatus?.(status === "SUBSCRIBED");
      });
    return {
      close: () => {
        try {
          client.removeChannel(channel);
        } catch {
          // 정리 실패 무시
        }
      }
    };
  } catch {
    return null;
  }
}
