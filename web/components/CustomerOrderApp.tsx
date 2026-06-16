"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compareMenus, formatWon, groupMenusByCategory, menuCategoryLabel } from "@/lib/domain";
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
  const [depositorName, setDepositorName] = useState("");
  const [memo, setMemo] = useState("");
  const [createdOrder, setCreatedOrder] = useState<OrderGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accountCopyState, setAccountCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [amountCopyState, setAmountCopyState] = useState<"idle" | "copied" | "failed">("idle");

  // 운영자 전용 숨은 진입: 손님 화면엔 노출하지 않고 타이틀 5회 연속 탭 시 /admin 이동.
  const adminTapRef = useRef(0);
  const adminTapTimerRef = useRef<number | null>(null);

  function handleHiddenAdminTap() {
    adminTapRef.current += 1;
    if (adminTapTimerRef.current) {
      window.clearTimeout(adminTapTimerRef.current);
    }
    if (adminTapRef.current >= 5) {
      adminTapRef.current = 0;
      window.location.href = "/admin";
      return;
    }
    adminTapTimerRef.current = window.setTimeout(() => {
      adminTapRef.current = 0;
    }, 1500);
  }

  useEffect(() => {
    api<PublicBootstrap>("/api/public/bootstrap")
      .then(setBootstrap)
      .catch((err) => setError(err.message));
  }, []);

  const menus = bootstrap?.menus || [];
  const selectedLines = useMemo(() => {
    return Object.entries(quantities)
      .reduce<Array<{ menu: Menu; quantity: number; subtotal: number }>>((lines, [menuId, quantity]) => {
        const menu = menus.find((item) => item.id === menuId);
        if (!menu || quantity <= 0) {
          return lines;
        }
        lines.push({
          menu,
          quantity,
          subtotal: menu.price * quantity
        });
        return lines;
      }, [])
      .sort((a, b) => compareMenus(a.menu, b.menu));
  }, [menus, quantities]);
  const totalAmount = selectedLines.reduce((sum, line) => sum + line.subtotal, 0);
  const totalQuantity = selectedLines.reduce((sum, line) => sum + line.quantity, 0);
  const selectedCategoryNames = Array.from(new Set(selectedLines.map((line) => menuCategoryLabel(line.menu.category))));
  const groupedMenus = groupMenusByCategory(menus);
  const accountNumber = bootstrap?.settings.accountNumber?.trim() || "";
  const accountDisplay = [
    bootstrap?.settings.bankName || "은행명",
    accountNumber || "계좌번호",
    bootstrap?.settings.accountHolder || "예금주"
  ].join(" ");

  function setQty(menuId: string, next: number) {
    setCreatedOrder(null);
    setAccountCopyState("idle");
    setAmountCopyState("idle");
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
          depositorName,
          memo,
          items: selectedLines.map((line) => ({
            menuId: line.menu.id,
            quantity: line.quantity
          }))
        })
      });
      setCreatedOrder(order);
      setAccountCopyState("idle");
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

  async function writeClipboard(text: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "-1000px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      return true;
    } catch {
      return false;
    }
  }

  async function copyAccountNumber() {
    if (!accountNumber) {
      setAccountCopyState("failed");
      return;
    }
    if (await writeClipboard(accountNumber)) {
      setAccountCopyState("copied");
      window.setTimeout(() => setAccountCopyState("idle"), 1800);
    } else {
      setAccountCopyState("failed");
    }
  }

  async function copyAmount(amount: number) {
    if (!amount) {
      setAmountCopyState("failed");
      return;
    }
    if (await writeClipboard(String(amount))) {
      setAmountCopyState("copied");
      window.setTimeout(() => setAmountCopyState("idle"), 1800);
    } else {
      setAmountCopyState("failed");
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
            <h1 onClick={handleHiddenAdminTap} style={{ cursor: "default" }}>
              {bootstrap.appTitle}
            </h1>
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
            {groupedMenus.map((categoryGroup) => {
              const categoryQuantity = selectedLines
                .filter((line) => menuCategoryLabel(line.menu.category) === categoryGroup.category)
                .reduce((sum, line) => sum + line.quantity, 0);

              return (
                <div className="team-block" key={categoryGroup.category}>
                  <div className="team-heading">
                    <div>
                      <span className="team-marker">{categoryGroup.category.slice(0, 1)}</span>
                      <h2 className="team-title">{categoryGroup.category}</h2>
                    </div>
                    <span className={`team-count ${categoryQuantity ? "active" : ""}`}>
                      {categoryQuantity ? `${categoryQuantity}개 선택` : "선택 가능"}
                    </span>
                  </div>
                  <div className="menu-grid">
                    {categoryGroup.items.map((menu) => {
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
                              <span className="source-chip">{menu.teamName}</span>
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
                  <strong>입금은 '{createdOrder.depositorName}' 이름으로 해주세요.</strong>
                  운영팀이 예금주명과 금액으로 확인합니다. 가능하면 입금 메모에 주문번호 {createdOrder.orderNo}도 남겨주세요.
                </div>
                <div className="receipt-card">
                  <span>주문번호</span>
                  <strong>{createdOrder.orderNo}</strong>
                  <small>{createdOrder.sections.map((s) => s.teamName).join(" / ")}</small>
                </div>
                <div className="payment-card">
                  <span>입금 금액</span>
                  <div className="amount-copy-row">
                    <strong>{formatWon(createdOrder.totalAmount)}</strong>
                    <button
                      className="copy-account-button"
                      type="button"
                      onClick={() => copyAmount(createdOrder.totalAmount)}
                    >
                      {amountCopyState === "copied" ? "복사됨" : "금액 복사"}
                    </button>
                  </div>
                  <div className="account-copy-row">
                    <small>{accountDisplay}</small>
                    <button className="copy-account-button" type="button" onClick={copyAccountNumber}>
                      {accountCopyState === "copied" ? "복사됨" : "복사"}
                    </button>
                  </div>
                  <p className={`copy-feedback ${accountCopyState}`} aria-live="polite">
                    {accountCopyState === "copied"
                      ? "계좌번호가 복사됐습니다."
                      : accountCopyState === "failed"
                        ? "복사에 실패했습니다. 계좌번호를 길게 눌러 복사해주세요."
                        : amountCopyState === "copied"
                          ? "입금 금액이 복사됐습니다."
                          : " "}
                  </p>
                  {bootstrap.settings.qrImageUrl ? (
                    <div className="transfer-qr">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={bootstrap.settings.qrImageUrl} alt="송금용 QR" />
                      <small>은행/송금 앱에서 이 QR을 스캔하면 계좌가 자동 입력됩니다.</small>
                    </div>
                  ) : null}
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
                  <span>{selectedLines.length ? selectedCategoryNames.join(" / ") : "메뉴를 선택해주세요"}</span>
                  <strong>{formatWon(totalAmount)}</strong>
                  <small>{totalQuantity ? `총 ${totalQuantity}개` : " "}</small>
                </div>
                {selectedLines.length ? (
                  <div className="cart-lines">
                    {selectedLines.map((line) => (
                      <div className="cart-line" key={line.menu.id}>
                        <div>
                          <span>
                            {line.menu.name} x {line.quantity}
                          </span>
                          <small>{line.menu.teamName} · {menuCategoryLabel(line.menu.category)}</small>
                        </div>
                        <strong>{formatWon(line.subtotal)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">선택한 메뉴가 없습니다.</div>
                )}

                <div className="field">
                  <label htmlFor="pickupName">픽업자명 *</label>
                  <input id="pickupName" value={pickupName} onChange={(event) => setPickupName(event.target.value)} />
                  <small className="field-hint">실제 픽업하실 분의 성함을 적어주세요.</small>
                </div>
                <div className="field">
                  <label htmlFor="phone">연락처 *</label>
                  <input
                    id="phone"
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                  <small className="field-hint">픽업하실 분의 연락처를 적어주세요.</small>
                </div>
                <div className="field">
                  <label htmlFor="depositorName">예금주명 *</label>
                  <input
                    id="depositorName"
                    value={depositorName}
                    onChange={(event) => setDepositorName(event.target.value)}
                  />
                  <small className="field-hint">입금 확인을 위해 실제 입금하실 분(예금주) 성함을 적어주세요.</small>
                </div>
                <div className="field">
                  <label htmlFor="memo">요청사항 선택</label>
                  <textarea id="memo" value={memo} onChange={(event) => setMemo(event.target.value)} />
                </div>
                <button
                  className="btn primary full"
                  type="button"
                  disabled={busy || !totalAmount || !pickupName.trim() || !phone.trim() || !depositorName.trim()}
                  onClick={submitOrder}
                >
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
