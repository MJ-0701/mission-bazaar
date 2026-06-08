"use client";

import { useEffect, useMemo, useState } from "react";
import { formatWon, groupMenusByTeam } from "@/lib/domain";
import type { Menu, OrderGroup, PublicBootstrap } from "@/lib/types";

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function api<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });
  const result = (await response.json()) as ApiResult<T>;
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

export function CustomerOrderApp() {
  const [bootstrap, setBootstrap] = useState<PublicBootstrap | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [pickupName, setPickupName] = useState("");
  const [phone, setPhone] = useState("");
  const [memo, setMemo] = useState("");
  const [createdOrder, setCreatedOrder] = useState<OrderGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<PublicBootstrap>("/api/public/bootstrap")
      .then(setBootstrap)
      .catch((err) => setError(err.message));
  }, []);

  const menus = bootstrap?.menus || [];
  const selectedLines = useMemo(() => {
    return Object.entries(quantities)
      .map(([menuId, quantity]) => {
        const menu = menus.find((item) => item.id === menuId);
        if (!menu || quantity <= 0) {
          return null;
        }
        return {
          menu,
          quantity,
          subtotal: menu.price * quantity
        };
      })
      .filter(Boolean) as Array<{ menu: Menu; quantity: number; subtotal: number }>;
  }, [menus, quantities]);
  const totalAmount = selectedLines.reduce((sum, line) => sum + line.subtotal, 0);
  const totalQuantity = selectedLines.reduce((sum, line) => sum + line.quantity, 0);
  const selectedTeamNames = Array.from(new Set(selectedLines.map((line) => line.menu.teamName)));
  const groupedMenus = bootstrap ? groupMenusByTeam(menus, bootstrap.teams) : [];

  function setQty(menuId: string, next: number) {
    setCreatedOrder(null);
    setQuantities((prev) => ({
      ...prev,
      [menuId]: Math.max(0, Math.min(99, next))
    }));
  }

  async function submitOrder() {
    setBusy(true);
    setError("");
    try {
      const order = await api<OrderGroup>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          pickupName,
          phone,
          memo,
          items: selectedLines.map((line) => ({
            menuId: line.menu.id,
            quantity: line.quantity
          }))
        })
      });
      setCreatedOrder(order);
      try {
        localStorage.setItem(
          "mission-bazaar:last-order",
          JSON.stringify({
            orderNo: order.orderNo,
            token: order.orderToken,
            snapshot: order
          })
        );
      } catch {
        // localStorage is only a fast-path cache.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "주문 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function markPaid() {
    if (!createdOrder?.orderToken) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const order = await api<OrderGroup>(`/api/orders/${createdOrder.orderNo}/payment-checking`, {
        method: "POST",
        body: JSON.stringify({ token: createdOrder.orderToken })
      });
      const url = `/pickup?orderNo=${encodeURIComponent(order.orderNo)}&token=${encodeURIComponent(
        order.orderToken || createdOrder.orderToken
      )}`;
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "상태 변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (!bootstrap) {
    return (
      <main className="main">
        <div className="panel">
          <div className="panel-body empty-state">{error || "메뉴를 불러오는 중입니다."}</div>
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="topbar customer-topbar">
        <div className="topbar-inner">
          <div className="brand">
            <h1>{bootstrap.appTitle}</h1>
            <p>메뉴 선택 후 송금하면 운영팀이 입금을 확인합니다.</p>
          </div>
          <div className="customer-top-summary">
            <span>{totalQuantity ? `${totalQuantity}개 선택` : "주문 대기"}</span>
            <strong>{formatWon(totalAmount)}</strong>
            {bootstrap.demoMode ? <em>데모 모드</em> : null}
          </div>
        </div>
      </header>

      <main className="main customer-grid customer-main">
        <section className="panel customer-menu-panel">
          <div className="panel-head">
            <div>
              <h2>메뉴 선택</h2>
            </div>
            <button className="btn subtle" type="button" onClick={() => window.location.reload()}>
              새로고침
            </button>
          </div>
          <div className="panel-body">
            {groupedMenus.map((teamGroup) => {
              const teamQuantity = selectedLines
                .filter((line) => line.menu.teamId === teamGroup.team.id)
                .reduce((sum, line) => sum + line.quantity, 0);

              return (
              <div className="team-block" key={teamGroup.team.id}>
                <div className="team-heading">
                  <div>
                    <span className="team-marker">{teamGroup.team.name.slice(0, 1)}</span>
                    <h2 className="team-title">{teamGroup.team.name}</h2>
                  </div>
                  <span className={`team-count ${teamQuantity ? "active" : ""}`}>
                    {teamQuantity ? `${teamQuantity}개 선택` : "선택 가능"}
                  </span>
                </div>
                {teamGroup.categories.map((category) => (
                  <div key={`${teamGroup.team.id}-${category.category}`}>
                    <p className="category-label">{category.category}</p>
                    <div className="menu-grid">
                      {category.items.map((menu) => {
                        const quantity = quantities[menu.id] || 0;
                        return (
                          <article
                            className={`menu-card ${quantity ? "selected" : ""} ${menu.isAvailable ? "" : "soldout"}`}
                            key={menu.id}
                          >
                            <div className="menu-copy">
                              <h3 className="menu-name">{menu.name}</h3>
                              <div className="price-line">
                                <span>{formatWon(menu.price)}</span>
                                <span className={`badge ${menu.isAvailable ? "" : "danger"}`}>
                                  {menu.isAvailable ? "판매중" : "품절"}
                                </span>
                              </div>
                            </div>
                            <div className="stepper" aria-label={`${menu.name} 수량`}>
                              <button
                                type="button"
                                disabled={!menu.isAvailable || quantity <= 0}
                                onClick={() => setQty(menu.id, quantity - 1)}
                              >
                                -
                              </button>
                              <span>{quantity}</span>
                              <button
                                type="button"
                                disabled={!menu.isAvailable}
                                onClick={() => setQty(menu.id, quantity + 1)}
                              >
                                +
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              );
            })}
          </div>
        </section>

        <aside className="panel order-panel checkout-panel">
          <div className="panel-head">
            <div>
              <h2>주문서</h2>
            </div>
          </div>
          <div className="panel-body">
            {createdOrder ? (
              <div className="receipt-flow">
                <div className="info-box">
                  <strong>입금할 때 주문번호와 픽업자명을 함께 적어주세요.</strong>
                  예: {createdOrder.orderNo} {createdOrder.pickupName}
                </div>
                <div className="receipt-card">
                  <span>주문번호</span>
                  <strong>{createdOrder.orderNo}</strong>
                  <small>{createdOrder.sections.map((s) => s.teamName).join(" / ")}</small>
                </div>
                <div className="payment-card">
                  <span>입금 금액</span>
                  <strong>{formatWon(createdOrder.totalAmount)}</strong>
                  <small>
                    {bootstrap.settings.bankName || "은행명"} {bootstrap.settings.accountNumber || "계좌번호"}{" "}
                    {bootstrap.settings.accountHolder || "예금주"}
                  </small>
                </div>
                <div className="info-box">현재 상태: {createdOrder.sections.map((s) => s.teamName).join(" / ")} 입금 대기</div>
                <button className="btn primary full" type="button" disabled={busy} onClick={markPaid}>
                  입금했어요
                </button>
                <button className="btn full" type="button" onClick={() => setCreatedOrder(null)}>
                  새 주문 시작
                </button>
              </div>
            ) : (
              <>
                <div className="checkout-total">
                  <span>{selectedLines.length ? selectedTeamNames.join(" / ") : "메뉴를 선택해주세요"}</span>
                  <strong>{formatWon(totalAmount)}</strong>
                  <small>{totalQuantity ? `총 ${totalQuantity}개` : " "}</small>
                </div>
                {selectedLines.length ? (
                  <div className="cart-lines">
                    {selectedLines.map((line) => (
                      <div className="cart-line" key={line.menu.id}>
                        <span>
                          {line.menu.name} x {line.quantity}
                        </span>
                        <strong>{formatWon(line.subtotal)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">선택한 메뉴가 없습니다.</div>
                )}

                <div className="field">
                  <label htmlFor="pickupName">픽업자명</label>
                  <input id="pickupName" value={pickupName} onChange={(event) => setPickupName(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="phone">연락처</label>
                  <input
                    id="phone"
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="memo">요청사항 선택</label>
                  <textarea id="memo" value={memo} onChange={(event) => setMemo(event.target.value)} />
                </div>
                <button className="btn primary full" type="button" disabled={busy || !totalAmount} onClick={submitOrder}>
                  주문 생성
                </button>
              </>
            )}
            {error ? <p className="error">{error}</p> : null}
          </div>
        </aside>
      </main>
    </>
  );
}
