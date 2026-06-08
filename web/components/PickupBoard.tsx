"use client";

import { useEffect, useMemo, useState } from "react";
import { formatWon } from "@/lib/domain";
import type { PickupSnapshot } from "@/lib/types";

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function api<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    },
    cache: "no-store"
  });
  const result = (await response.json()) as ApiResult<T>;
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

export function PickupBoard({ orderNo, token }: { orderNo: string; token: string }) {
  const [access, setAccess] = useState({ orderNo, token });
  const [snapshot, setSnapshot] = useState<PickupSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busySection, setBusySection] = useState("");

  const currentOrder = useMemo(() => snapshot?.order, [snapshot]);
  const hasAccess = Boolean(access.orderNo && access.token);

  async function refresh(silent = false, nextAccess = access) {
    if (!nextAccess.orderNo || !nextAccess.token) {
      return;
    }
    try {
      const data = await api<PickupSnapshot>(
        `/api/pickup?orderNo=${encodeURIComponent(nextAccess.orderNo)}&token=${encodeURIComponent(nextAccess.token)}`
      );
      setSnapshot(data);
      setError("");
      try {
        localStorage.setItem("mission-bazaar:pickup-snapshot", JSON.stringify(data));
      } catch {
        // cache only
      }
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "픽업 상태를 불러오지 못했습니다.");
      }
    }
  }

  useEffect(() => {
    let nextAccess = { orderNo, token };
    try {
      if (!nextAccess.orderNo || !nextAccess.token) {
        const cachedLast = localStorage.getItem("mission-bazaar:last-order");
        if (cachedLast) {
          const parsed = JSON.parse(cachedLast) as { orderNo?: string; token?: string; snapshot?: PickupSnapshot["order"] };
          if (parsed.orderNo && parsed.token) {
            nextAccess = { orderNo: parsed.orderNo, token: parsed.token };
            if (parsed.snapshot) {
              setSnapshot({
                order: parsed.snapshot,
                orders: parsed.snapshot.sections,
                teams: [],
                updatedAt: parsed.snapshot.updatedAt,
                demoMode: false
              });
            }
          }
        }
      }
      const cached = localStorage.getItem("mission-bazaar:pickup-snapshot");
      if (cached) {
        const parsed = JSON.parse(cached) as PickupSnapshot;
        if (parsed.order.orderNo === nextAccess.orderNo) {
          setSnapshot(parsed);
        }
      }
    } catch {
      // ignore malformed cache
    }

    setAccess(nextAccess);
    if (!nextAccess.orderNo || !nextAccess.token) {
      setError("");
      return;
    }

    if (!orderNo || !token) {
      window.history.replaceState(
        null,
        "",
        `/pickup?orderNo=${encodeURIComponent(nextAccess.orderNo)}&token=${encodeURIComponent(nextAccess.token)}`
      );
    }

    refresh(false, nextAccess);
    const timer = window.setInterval(() => refresh(true, nextAccess), 2500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNo, token]);

  async function complete(sectionId: string) {
    setBusySection(sectionId);
    setError("");
    try {
      setSnapshot(
        await api<PickupSnapshot>("/api/pickup/complete", {
          method: "POST",
          body: JSON.stringify({ orderNo: access.orderNo, token: access.token, sectionId })
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "수령 완료 처리에 실패했습니다.");
    } finally {
      setBusySection("");
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <h1>선교 바자회 주문 픽업</h1>
            <p>주문번호별 입금 확인과 준비 상태가 표시됩니다.</p>
          </div>
          <a className="btn" href="/">
            주문 화면
          </a>
        </div>
      </header>

      <main className="main">
        <section className="panel">
          <div className="panel-head">
            <h2>픽업 상태</h2>
            <span className="muted">갱신 {snapshot?.updatedAt ? snapshot.updatedAt.replace("T", " ").slice(0, 19) : "-"}</span>
          </div>
          <div className="panel-body">
            {!hasAccess ? (
              <div className="empty-state empty-state-action">
                <strong>주문 후 픽업 상태를 확인할 수 있습니다.</strong>
                <p>주문을 만들고 입금했어요를 누르면 이 화면으로 자동 이동합니다.</p>
                <a className="btn primary" href="/">
                  주문 화면으로 이동
                </a>
              </div>
            ) : currentOrder ? (
              <div className="info-box" style={{ marginBottom: 20 }}>
                <strong>
                  {currentOrder.pickupName} / {currentOrder.phone}
                </strong>
                현재 주문 {currentOrder.orderNo} · 총액 {formatWon(currentOrder.totalAmount)}
              </div>
            ) : null}

            {hasAccess && snapshot?.orders.length ? (
              <div className="pickup-grid">
                {snapshot.orders.map((section) => {
                  const ready = section.status === "READY";
                  return (
                    <article className={`pickup-card ${ready ? "ready" : ""}`} key={section.id}>
                      <div className="pickup-number">{section.orderNo}</div>
                      <div className="pickup-meta">
                        {section.teamName} · {section.statusLabel}
                      </div>
                      <div className="pickup-items">
                        {section.items.map((item) => (
                          <div key={item.id}>
                            {item.menuName} x {item.quantity} = {formatWon(item.subtotal)}
                          </div>
                        ))}
                      </div>
                      {ready ? (
                        <button
                          className="btn primary full"
                          type="button"
                          disabled={busySection === section.id}
                          onClick={() => complete(section.id)}
                        >
                          수령 완료
                        </button>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : hasAccess ? (
              <div className="empty-state">{error || "픽업 상태를 불러오는 중입니다."}</div>
            ) : null}
            {hasAccess && error ? <p className="error">{error}</p> : null}
          </div>
        </section>
      </main>
    </>
  );
}
