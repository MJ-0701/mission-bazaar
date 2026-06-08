"use client";

import { useEffect, useMemo, useState } from "react";
import { formatWon, normalizeAdminPin } from "@/lib/domain";
import type { AdminDashboard, OrderSection, OrderStatus } from "@/lib/types";

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

const statusOrder: OrderStatus[] = [
  "PAYMENT_CHECKING",
  "PAYMENT_ISSUE",
  "PAID",
  "READY",
  "PAYMENT_PENDING",
  "CANCELED"
];

function nextAction(status: OrderStatus) {
  if (status === "PAYMENT_PENDING" || status === "PAYMENT_CHECKING" || status === "PAYMENT_ISSUE") {
    return { status: "PAID" as OrderStatus, label: "입금확인" };
  }
  if (status === "PAID") {
    return { status: "READY" as OrderStatus, label: "준비완료" };
  }
  if (status === "READY") {
    return { status: "COMPLETE" as OrderStatus, label: "수령완료" };
  }
  return null;
}

function statusClass(status: OrderStatus) {
  return `status-${status.toLowerCase().replaceAll("_", "-")}`;
}

function orderCreatedAsc(a: OrderSection, b: OrderSection) {
  return (
    a.createdAt.localeCompare(b.createdAt) ||
    a.orderNo.localeCompare(b.orderNo, "ko", { numeric: true }) ||
    a.teamName.localeCompare(b.teamName, "ko")
  );
}

export function AdminApp() {
  const [pin, setPin] = useState("");
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [filter, setFilter] = useState<OrderStatus | "ALL">("ALL");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [cancelDraft, setCancelDraft] = useState<{ sectionId: string; reason: string } | null>(null);

  async function loadDashboard(silent = false) {
    try {
      setDashboard(await api<AdminDashboard>("/api/admin/dashboard"));
      setError("");
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "관리자 데이터를 불러오지 못했습니다.");
      }
    }
  }

  useEffect(() => {
    loadDashboard(true);
    const timer = window.setInterval(() => loadDashboard(true), 2500);
    return () => window.clearInterval(timer);
  }, []);

  async function login() {
    setBusy("login");
    setError("");
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ pin: normalizeAdminPin(pin) })
      });
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function logout() {
    await api("/api/admin/logout", { method: "POST" });
    setDashboard(null);
    setPin("");
  }

  async function changeStatus(section: OrderSection, status: OrderStatus, adminNote = "") {
    setBusy(section.id);
    setError("");
    try {
      setDashboard(
        await api<AdminDashboard>("/api/admin/status", {
          method: "POST",
          body: JSON.stringify({
            sectionId: section.id,
            status,
            adminNote
          })
        })
      );
      setCancelDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "상태 변경에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function updateAvailability(menuId: string, isAvailable: boolean) {
    setBusy(menuId);
    setError("");
    try {
      setDashboard(
        await api<AdminDashboard>("/api/admin/menus", {
          method: "POST",
          body: JSON.stringify({ menuId, isAvailable })
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "메뉴 상태 변경에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  const visibleOrders = useMemo(() => {
    const orders = dashboard?.orders || [];
    return orders
      .filter((order) => {
        if (filter === "ALL" && order.status === "CANCELED") {
          return false;
        }
        if (filter !== "ALL" && order.status !== filter) {
          return false;
        }
        if (teamFilter !== "ALL" && order.teamId !== teamFilter) {
          return false;
        }
        const text = `${order.orderNo} ${order.pickupName} ${order.phone} ${order.teamName}`.toLowerCase();
        return text.includes(query.trim().toLowerCase());
      })
      .sort(orderCreatedAsc);
  }, [dashboard, filter, query, teamFilter]);
  const activeOrderCount = (dashboard?.orders || []).filter((order) => order.status !== "CANCELED").length;

  async function confirmCancel(section: OrderSection) {
    const reason = cancelDraft?.sectionId === section.id ? cancelDraft.reason.trim() : "";
    if (reason.length < 2) {
      setError("주문 취소 사유를 입력해주세요.");
      return;
    }
    await changeStatus(section, "CANCELED", reason);
  }

  if (!dashboard) {
    return (
      <>
        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand">
              <h1>운영 콘솔</h1>
              <p>운영팀 PIN으로 주문과 품절 상태를 관리합니다.</p>
            </div>
            <a className="btn" href="/">
              주문 화면
            </a>
          </div>
        </header>
        <main className="main main-narrow">
          <section className="panel login-panel">
            <div className="panel-head">
              <h2>관리자 로그인</h2>
            </div>
            <div className="panel-body">
              <div className="field">
                <label htmlFor="pin">PIN</label>
                <input
                  id="pin"
                  inputMode="numeric"
                  placeholder="0000"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      login();
                    }
                  }}
                />
              </div>
              <button className="btn primary full" type="button" disabled={busy === "login"} onClick={login}>
                로그인
              </button>
              <p className="hint-line">로컬 데모 PIN: 0000 / 1111 / 2222</p>
              {error ? <p className="error">{error}</p> : null}
            </div>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <h1>운영 콘솔</h1>
            <p>
              {dashboard.admin.role === "master" ? "통합 관리자" : dashboard.admin.teamName} · 갱신{" "}
              {dashboard.updatedAt.replace("T", " ").slice(0, 19)}
            </p>
          </div>
          <div className="button-row" style={{ marginTop: 0 }}>
            {dashboard.demoMode ? <span className="badge warning">데모 모드</span> : null}
            <button className="btn" type="button" onClick={() => loadDashboard()}>
              새로고침
            </button>
            <button className="btn" type="button" onClick={logout}>
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <main className="main admin-layout">
        <aside className="sidebar">
          <section className="panel">
            <div className="panel-head">
              <h2>상태</h2>
              <button
                className={`btn status-reset ${filter === "ALL" ? "active" : ""}`}
                type="button"
                onClick={() => setFilter("ALL")}
              >
                전체 상태
              </button>
            </div>
            <div className="panel-body metric-grid">
              <button
                className={`metric-card metric-card-all ${filter === "ALL" ? "active" : ""}`}
                type="button"
                onClick={() => setFilter("ALL")}
              >
                <span>전체 상태</span>
                <strong>{activeOrderCount}</strong>
              </button>
              {statusOrder.map((status) => (
                <button
                  className={`metric-card ${statusClass(status)} ${filter === status ? "active" : ""}`}
                  type="button"
                  key={status}
                  onClick={() => setFilter(filter === status ? "ALL" : status)}
                  aria-pressed={filter === status}
                >
                  <span>{dashboard.statusLabels[status]}</span>
                  <strong>{dashboard.stats[status] || 0}</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>필터</h2>
            </div>
            <div className="panel-body">
              <div className="field" style={{ marginTop: 0 }}>
                <label htmlFor="query">검색</label>
                <input id="query" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="teamFilter">팀</label>
                <select
                  id="teamFilter"
                  className="btn full"
                  value={teamFilter}
                  onChange={(event) => setTeamFilter(event.target.value)}
                >
                  <option value="ALL">전체</option>
                  {dashboard.teams.map((team) => (
                    <option value={team.id} key={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn full" type="button" onClick={() => setFilter("ALL")}>
                진행 주문 보기
              </button>
            </div>
          </section>
        </aside>

        <div className="admin-main">
          <section className="panel">
            <div className="panel-head">
              <h2>주문 목록</h2>
              <span className="muted">{visibleOrders.length}건</span>
            </div>
            <div className="panel-body admin-order-list">
              {visibleOrders.length ? (
                visibleOrders.map((order) => {
                  const action = nextAction(order.status);
                  return (
                    <article className={`order-card ${statusClass(order.status)}`} key={order.id}>
                      <div className="order-summary">
                        <div className="order-number">{order.orderNo}</div>
                        <div>
                          <span className={`badge status-badge ${statusClass(order.status)}`}>{order.teamName}</span>
                          <p className={`status-text ${statusClass(order.status)}`}>{order.statusLabel}</p>
                          <strong className="order-amount">{formatWon(order.subtotalAmount)}</strong>
                        </div>
                      </div>
                      <div className="order-details">
                        <p>
                          <strong>픽업자</strong> {order.pickupName} <span className="muted">연락처 {order.phone}</span>
                        </p>
                        {order.items.map((item) => (
                          <div key={item.id}>
                            {item.menuName} x {item.quantity} = {formatWon(item.subtotal)}
                          </div>
                        ))}
                        {order.memo ? <div className="info-box" style={{ marginTop: 12 }}>{order.memo}</div> : null}
                      </div>
                      <div className="button-row order-actions">
                        {action ? (
                          <button
                            className={`btn status-button ${statusClass(action.status)} full`}
                            type="button"
                            disabled={busy === order.id}
                            onClick={() => changeStatus(order, action.status)}
                          >
                            {action.label}
                          </button>
                        ) : null}
                        {order.status === "PAYMENT_CHECKING" || order.status === "PAYMENT_ISSUE" ? (
                          <button
                            className="btn status-button status-payment-issue full"
                            type="button"
                            disabled={busy === order.id}
                            onClick={() => changeStatus(order, "PAYMENT_ISSUE")}
                          >
                            입금문제
                          </button>
                        ) : null}
                        {order.status === "CANCELED" ? (
                          <button
                            className="btn status-button status-payment-checking full"
                            type="button"
                            disabled={busy === order.id}
                            onClick={() => changeStatus(order, "PAYMENT_CHECKING")}
                          >
                            주문 복구
                          </button>
                        ) : null}
                        {order.status !== "READY" && order.status !== "CANCELED" ? (
                          <button
                            className="btn status-button status-canceled full"
                            type="button"
                            disabled={busy === order.id}
                            onClick={() =>
                              setCancelDraft({
                                sectionId: order.id,
                                reason: cancelDraft?.sectionId === order.id ? cancelDraft.reason : ""
                              })
                            }
                          >
                            취소
                          </button>
                        ) : null}
                      </div>
                      {order.status === "CANCELED" ? (
                        <div className="cancel-note">
                          <strong>취소 사유</strong>
                          {order.adminNote || "취소 사유가 기록되지 않았습니다."}
                        </div>
                      ) : null}
                      {cancelDraft?.sectionId === order.id ? (
                        <div className="cancel-confirm">
                          <div>
                            <strong>주문 취소 확인</strong>
                            <p>잘못 누른 취소를 막기 위해 사유 입력 후 한 번 더 확정해야 합니다.</p>
                          </div>
                          <label htmlFor={`cancel-${order.id}`}>취소 사유</label>
                          <textarea
                            id={`cancel-${order.id}`}
                            value={cancelDraft.reason}
                            onChange={(event) =>
                              setCancelDraft({
                                sectionId: order.id,
                                reason: event.target.value
                              })
                            }
                            placeholder="예: 중복 주문, 고객 요청, 입금 불일치"
                          />
                          <div className="button-row">
                            <button
                              className="btn full"
                              type="button"
                              disabled={busy === order.id}
                              onClick={() => setCancelDraft(null)}
                            >
                              돌아가기
                            </button>
                            <button
                              className="btn status-button status-canceled full"
                              type="button"
                              disabled={busy === order.id || cancelDraft.reason.trim().length < 2}
                              onClick={() => confirmCancel(order)}
                            >
                              취소 확정
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <div className="empty-state">표시할 주문이 없습니다.</div>
              )}
              {error ? <p className="error">{error}</p> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>메뉴 품절 관리</h2>
            </div>
            <div className="panel-body stock-grid">
              {dashboard.menus.map((menu) => (
                <article className={`stock-card ${menu.isAvailable ? "" : "soldout"}`} key={menu.id}>
                  <div className="stock-main">
                    <h3 className="stock-name">{menu.name}</h3>
                    <p className="stock-meta">
                      {menu.teamName} · {menu.category} · {formatWon(menu.price)}
                    </p>
                  </div>
                  <div className="stock-footer">
                    <span className={`badge ${menu.isAvailable ? "" : "danger"}`}>
                      {menu.isAvailable ? "판매중" : "품절"}
                    </span>
                    <button
                      className="btn stock-button"
                      type="button"
                      disabled={busy === menu.id}
                      onClick={() => updateAvailability(menu.id, !menu.isAvailable)}
                    >
                      {menu.isAvailable ? "품절 처리" : "판매 재개"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
