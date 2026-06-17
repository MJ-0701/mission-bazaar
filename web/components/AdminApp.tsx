"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compareMenuCategories, formatWon, menuCategoryLabel, normalizeAdminPin } from "@/lib/domain";
import type { AdminDashboard, Menu, OrderItem, OrderSection, OrderStatus } from "@/lib/types";

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };
type ReceiptLine = { section: OrderSection; item: OrderItem };
type VisibleOrderGroup = {
  id: string;
  orderNo: string;
  pickupName: string;
  phone: string;
  depositorName: string;
  memo: string;
  createdAt: string;
  sections: OrderSection[];
  items: ReceiptLine[];
  subtotalAmount: number;
};

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
  // FIFO: 단조 증가하는 주문번호(sequence 기반) 우선 정렬. createdAt은 동시생성 tie라 보조로만.
  return (
    a.orderNo.localeCompare(b.orderNo, "ko", { numeric: true }) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.teamName.localeCompare(b.teamName, "ko")
  );
}

function statusRank(status: OrderStatus) {
  const index = statusOrder.indexOf(status);
  return index === -1 ? statusOrder.length : index;
}

function primaryStatus(sections: OrderSection[]) {
  return [...sections].sort((a, b) => statusRank(a.status) - statusRank(b.status))[0]?.status || "PAYMENT_PENDING";
}

function awaitingDeposit(sections: OrderSection[]) {
  return sections.some((section) => section.status === "PAYMENT_CHECKING");
}

function groupStatusText(sections: OrderSection[]) {
  if (sections.length === 1) {
    return sections[0].statusLabel;
  }
  return sections.map((section) => `${section.teamName} ${section.statusLabel}`).join(" / ");
}

function groupOrderSections(sections: OrderSection[]): VisibleOrderGroup[] {
  const groups = new Map<string, VisibleOrderGroup>();

  for (const section of sections) {
    const existing = groups.get(section.orderNo);
    const group =
      existing ||
      ({
        id: section.orderNo,
        orderNo: section.orderNo,
        pickupName: section.pickupName,
        phone: section.phone,
        depositorName: section.depositorName,
        memo: section.memo,
        createdAt: section.createdAt,
        sections: [],
        items: [],
        subtotalAmount: 0
      } satisfies VisibleOrderGroup);

    group.sections.push(section);
    group.items.push(...section.items.map((item) => ({ section, item })));
    group.subtotalAmount += section.subtotalAmount;
    groups.set(section.orderNo, group);
  }

  return Array.from(groups.values()).sort(
    (a, b) => a.orderNo.localeCompare(b.orderNo, "ko", { numeric: true }) || a.createdAt.localeCompare(b.createdAt)
  );
}

function groupOrderItemsByCategory(items: ReceiptLine[]) {
  return Array.from(
    items.reduce((map, line) => {
      const category = menuCategoryLabel(line.item.category);
      const existing = map.get(category) || [];
      existing.push(line);
      map.set(category, existing);
      return map;
    }, new Map<string, ReceiptLine[]>())
  )
    .sort(([a], [b]) => compareMenuCategories(a, b))
    .map(([category, groupItems]) => ({
      category,
      quantity: groupItems.reduce((sum, line) => sum + line.item.quantity, 0),
      subtotal: groupItems.reduce((sum, line) => sum + line.item.subtotal, 0),
      items: groupItems
    }));
}

function groupMenusForStock(menus: Menu[]) {
  return Array.from(
    menus.reduce((map, menu) => {
      const category = menuCategoryLabel(menu.category);
      const existing = map.get(category) || [];
      existing.push(menu);
      map.set(category, existing);
      return map;
    }, new Map<string, Menu[]>())
  )
    .sort(([a], [b]) => compareMenuCategories(a, b))
    .map(([category, groupMenus]) => ({
      category,
      menus: groupMenus.sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.teamName.localeCompare(b.teamName, "ko") ||
          a.name.localeCompare(b.name, "ko")
      )
    }));
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
  const [payConfirm, setPayConfirm] = useState<{ sectionId: string } | null>(null);
  const [undoToast, setUndoToast] = useState<{ section: OrderSection; orderNo: string } | null>(null);
  const [soundOn, setSoundOn] = useState(true);

  const undoTimerRef = useRef<number | null>(null);

  const soundOnRef = useRef(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const checkingIdsRef = useRef<Set<string>>(new Set());
  const firstLoadRef = useRef(true);

  function ensureAudio() {
    if (typeof window === "undefined") {
      return;
    }
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        audioCtxRef.current = new Ctx();
      }
    }
    audioCtxRef.current?.resume?.();
  }

  function playAlert() {
    const ctx = audioCtxRef.current;
    if (ctx) {
      try {
        const start = ctx.currentTime;
        [880, 1320].forEach((freq, index) => {
          const at = start + index * 0.18;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
          osc.connect(gain).connect(ctx.destination);
          osc.start(at);
          osc.stop(at + 0.18);
        });
      } catch {
        // 오디오 재생 실패는 무시 (알림 기능 보조용)
      }
    }
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      // 진동 미지원 기기 무시
    }
  }

  function detectNewDeposits(data: AdminDashboard) {
    const checking = data.orders.filter((section) => section.status === "PAYMENT_CHECKING");
    const currentIds = new Set(checking.map((section) => section.id));
    if (!firstLoadRef.current) {
      const fresh = checking.some((section) => !checkingIdsRef.current.has(section.id));
      if (fresh && soundOnRef.current) {
        playAlert();
      }
    }
    checkingIdsRef.current = currentIds;
    firstLoadRef.current = false;
  }

  async function loadDashboard(silent = false) {
    try {
      const data = await api<AdminDashboard>("/api/admin/dashboard");
      detectNewDeposits(data);
      setDashboard(data);
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

  function toggleSound() {
    ensureAudio();
    const next = !soundOn;
    setSoundOn(next);
    soundOnRef.current = next;
    if (next) {
      playAlert();
    }
  }

  async function login() {
    setBusy("login");
    setError("");
    ensureAudio();
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

  async function changeStatus(section: OrderSection, status: OrderStatus, adminNote = ""): Promise<boolean> {
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
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "상태 변경에 실패했습니다.");
      return false;
    } finally {
      setBusy("");
    }
  }

  // 입금확인 = 원탭 즉시 확정 후 5초간 실행취소 토스트 노출(모달 피로 제거).
  async function confirmPaid(section: OrderSection, orderNo: string) {
    setPayConfirm(null);
    const ok = await changeStatus(section, "PAID");
    if (!ok) {
      return; // 입금확정 실패 시 토스트/실행취소 노출 안 함
    }
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
    }
    setUndoToast({ section, orderNo });
    undoTimerRef.current = window.setTimeout(() => setUndoToast(null), 5000);
  }

  async function undoPaid() {
    if (!undoToast) {
      return;
    }
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
    }
    const section = undoToast.section;
    setUndoToast(null);
    await changeStatus(section, "PAYMENT_CHECKING");
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
        const itemText = order.items
          .map((item) => `${item.menuName} ${menuCategoryLabel(item.category)} ${item.quantity}`)
          .join(" ");
        const text = `${order.orderNo} ${order.pickupName} ${order.phone} ${order.depositorName} ${order.teamName} ${itemText}`.toLowerCase();
        return text.includes(query.trim().toLowerCase());
      })
      .sort(orderCreatedAsc);
  }, [dashboard, filter, query, teamFilter]);
  // 노출 순서는 무조건 시간 ASC 선입선출(FIFO). 미확인 강조는 색/대조블록으로만, 순서는 안 바꿈.
  const visibleOrderGroups = useMemo(() => groupOrderSections(visibleOrders), [visibleOrders]);
  const activeOrderCount = (dashboard?.orders || []).filter((order) => order.status !== "CANCELED").length;
  const stockGroups = useMemo(() => groupMenusForStock(dashboard?.menus || []), [dashboard?.menus]);

  // 동명이인 감지: 미확인(입금대기·확인중·문제) 주문 중 같은 입금자명이 몇 건인지(주문번호 기준 distinct).
  const duplicateDepositors = useMemo(() => {
    const orderNosByName = new Map<string, Set<string>>();
    for (const section of dashboard?.orders || []) {
      if (
        section.status !== "PAYMENT_PENDING" &&
        section.status !== "PAYMENT_CHECKING" &&
        section.status !== "PAYMENT_ISSUE"
      ) {
        continue;
      }
      const name = section.depositorName.trim();
      if (!name) {
        continue;
      }
      const set = orderNosByName.get(name) || new Set<string>();
      set.add(section.orderNo);
      orderNosByName.set(name, set);
    }
    const counts = new Map<string, number>();
    for (const [name, set] of orderNosByName) {
      counts.set(name, set.size);
    }
    return counts;
  }, [dashboard?.orders]);

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
                  placeholder="1111"
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
              <p className="hint-line">로컬 데모: master 1111 / admin 2222</p>
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
              {dashboard.admin.teamName || dashboard.admin.label} · 갱신{" "}
              {dashboard.updatedAt.replace("T", " ").slice(0, 19)}
            </p>
          </div>
          <div className="button-row" style={{ marginTop: 0 }}>
            {dashboard.demoMode ? <span className="badge warning">데모 모드</span> : null}
            {dashboard.stats.PAYMENT_CHECKING ? (
              <span className="badge alert-badge">입금확인 대기 {dashboard.stats.PAYMENT_CHECKING}</span>
            ) : null}
            <button className="btn" type="button" onClick={toggleSound} aria-pressed={soundOn}>
              {soundOn ? "🔔 알림 켜짐" : "🔕 알림 꺼짐"}
            </button>
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
              <span className="muted">{visibleOrderGroups.length}건</span>
            </div>
            <div className="panel-body admin-order-list">
              {visibleOrderGroups.length ? (
                visibleOrderGroups.map((order) => {
                  const status = primaryStatus(order.sections);
                  const needsConfirm = awaitingDeposit(order.sections);
                  const dupNameCount = duplicateDepositors.get(order.depositorName.trim()) || 0;
                  const itemGroups = groupOrderItemsByCategory(order.items);
                  const itemQuantity = order.items.reduce((sum, line) => sum + line.item.quantity, 0);
                  const cancelSection = cancelDraft
                    ? order.sections.find((section) => section.id === cancelDraft.sectionId)
                    : null;
                  const paySection = payConfirm
                    ? order.sections.find((section) => section.id === payConfirm.sectionId)
                    : null;
                  return (
                    <article
                      className={`order-card ${statusClass(status)} ${needsConfirm ? "needs-confirm" : ""}`}
                      key={order.id}
                    >
                      <div className="order-summary">
                        <div className="order-number">{order.orderNo}</div>
                        <div>
                          <div className="status-badge-row">
                            {order.sections.map((section) => (
                              <span className={`badge status-badge ${statusClass(section.status)}`} key={section.id}>
                                {section.teamName}
                              </span>
                            ))}
                          </div>
                          <p className={`status-text ${statusClass(status)}`}>{groupStatusText(order.sections)}</p>
                          <strong className="order-amount">{formatWon(order.subtotalAmount)}</strong>
                          <span className="muted">{itemQuantity}개</span>
                        </div>
                      </div>
                      <div className="order-details receipt-details">
                        {needsConfirm ? (
                          <div className="deposit-match">
                            <span className="deposit-match-tag">입금 대조</span>
                            <div className="deposit-match-body">
                              <div>
                                <span>입금자명</span>
                                <strong>{order.depositorName || "-"}</strong>
                              </div>
                              <div>
                                <span>입금액</span>
                                <strong>{formatWon(order.subtotalAmount)}</strong>
                              </div>
                            </div>
                            {dupNameCount > 1 ? (
                              <p className="dup-warning">⚠️ 같은 입금자명 {dupNameCount}건 — 금액으로 구분하세요</p>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="receipt-info-grid">
                          <p>
                            <span>입금자</span>
                            <strong>{order.depositorName || "-"}</strong>
                          </p>
                          <p>
                            <span>픽업자</span>
                            <strong>{order.pickupName}</strong>
                          </p>
                          <p>
                            <span>연락처</span>
                            <strong>{order.phone}</strong>
                          </p>
                        </div>
                        <div className="receipt-item-groups">
                          {itemGroups.map((group) => (
                            <section className="receipt-item-group" key={`${order.id}-${group.category}`}>
                              <div className="receipt-group-head">
                                <strong>{group.category}</strong>
                                <span>
                                  {group.quantity}개 · {formatWon(group.subtotal)}
                                </span>
                              </div>
                              {group.items.map(({ section, item }) => (
                                <div className="receipt-item-row" key={item.id}>
                                  <div>
                                    <strong>{item.menuName}</strong>
                                    <span>{section.teamName}</span>
                                  </div>
                                  <span>x {item.quantity}</span>
                                  <strong>{formatWon(item.subtotal)}</strong>
                                </div>
                              ))}
                            </section>
                          ))}
                        </div>
                        <div className="receipt-total-line">
                          <span>합계</span>
                          <strong>{formatWon(order.subtotalAmount)}</strong>
                        </div>
                        {order.memo ? (
                          <div className="info-box" style={{ marginTop: 12 }}>
                            {order.memo}
                          </div>
                        ) : null}
                      </div>
                      <div className="button-row order-actions">
                        {order.sections.map((section) => {
                          const action = nextAction(section.status);
                          // 입금확인(→PAID)은 master 전용. admin에겐 버튼 숨김.
                          if (action && action.label === "입금확인" && dashboard.admin.role !== "master") {
                            return null;
                          }
                          return action ? (
                            <button
                              className={`btn status-button ${statusClass(action.status)} full`}
                              type="button"
                              disabled={busy === section.id}
                              key={`${section.id}-${action.status}`}
                              onClick={() =>
                                action.label === "입금확인"
                                  ? dupNameCount > 1
                                    ? setPayConfirm({ sectionId: section.id })
                                    : confirmPaid(section, order.orderNo)
                                  : changeStatus(section, action.status)
                              }
                            >
                              {order.sections.length > 1 ? `${section.teamName} ${action.label}` : action.label}
                            </button>
                          ) : null;
                        })}
                        {order.sections
                          .filter((section) => section.status === "PAYMENT_CHECKING")
                          .map((section) => (
                            <button
                              className="btn status-button status-payment-issue full"
                              type="button"
                              disabled={busy === section.id}
                              key={`${section.id}-issue`}
                              onClick={() => changeStatus(section, "PAYMENT_ISSUE")}
                            >
                              {order.sections.length > 1 ? `${section.teamName} 입금문제` : "입금문제"}
                            </button>
                          ))}
                        {order.sections
                          .filter((section) => section.status === "CANCELED")
                          .map((section) => (
                            <button
                              className="btn status-button status-payment-checking full"
                              type="button"
                              disabled={busy === section.id}
                              key={`${section.id}-restore`}
                              onClick={() => changeStatus(section, "PAYMENT_CHECKING")}
                            >
                              {order.sections.length > 1 ? `${section.teamName} 복구` : "주문 복구"}
                            </button>
                          ))}
                        {order.sections
                          .filter((section) => section.status !== "READY" && section.status !== "CANCELED")
                          .map((section) => (
                            <button
                              className="btn status-button status-canceled full"
                              type="button"
                              disabled={busy === section.id}
                              key={`${section.id}-cancel`}
                              onClick={() =>
                                setCancelDraft({
                                  sectionId: section.id,
                                  reason: cancelDraft?.sectionId === section.id ? cancelDraft.reason : ""
                                })
                              }
                            >
                              {order.sections.length > 1 ? `${section.teamName} 취소` : "취소"}
                            </button>
                          ))}
                      </div>
                      {order.sections
                        .filter((section) => section.status === "CANCELED")
                        .map((section) => (
                          <div className="cancel-note" key={`${section.id}-note`}>
                            <strong>{order.sections.length > 1 ? `${section.teamName} 취소 사유` : "취소 사유"}</strong>
                            {section.adminNote || "취소 사유가 기록되지 않았습니다."}
                          </div>
                        ))}
                      {cancelDraft && cancelSection ? (
                        <div className="cancel-confirm">
                          <div>
                            <strong>주문 취소 확인</strong>
                            <p>잘못 누른 취소를 막기 위해 사유 입력 후 한 번 더 확정해야 합니다.</p>
                          </div>
                          <label htmlFor={`cancel-${cancelSection.id}`}>
                            {order.sections.length > 1 ? `${cancelSection.teamName} 취소 사유` : "취소 사유"}
                          </label>
                          <textarea
                            id={`cancel-${cancelSection.id}`}
                            value={cancelDraft.reason}
                            onChange={(event) =>
                              setCancelDraft({
                                sectionId: cancelSection.id,
                                reason: event.target.value
                              })
                            }
                            placeholder="예: 중복 주문, 고객 요청, 입금 불일치"
                          />
                          <div className="button-row">
                            <button
                              className="btn full"
                              type="button"
                              disabled={busy === cancelSection.id}
                              onClick={() => setCancelDraft(null)}
                            >
                              돌아가기
                            </button>
                            <button
                              className="btn status-button status-canceled full"
                              type="button"
                              disabled={busy === cancelSection.id || cancelDraft.reason.trim().length < 2}
                              onClick={() => confirmCancel(cancelSection)}
                            >
                              취소 확정
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {payConfirm && paySection ? (
                        <div className="cancel-confirm pay-confirm">
                          <div>
                            <strong>입금 확인</strong>
                            <p>통장에서 실제 입금을 확인한 뒤 확정하세요.</p>
                          </div>
                          <div className="pay-confirm-facts">
                            <div>
                              <span>입금자명</span>
                              <strong>{order.depositorName || "-"}</strong>
                            </div>
                            <div>
                              <span>입금액</span>
                              <strong>{formatWon(order.subtotalAmount)}</strong>
                            </div>
                          </div>
                          {dupNameCount > 1 ? (
                            <p className="dup-warning">⚠️ 같은 입금자명 {dupNameCount}건 — 금액 일치 꼭 확인</p>
                          ) : null}
                          <div className="button-row">
                            <button
                              className="btn full"
                              type="button"
                              disabled={busy === paySection.id}
                              onClick={() => setPayConfirm(null)}
                            >
                              돌아가기
                            </button>
                            <button
                              className="btn status-button status-paid full"
                              type="button"
                              disabled={busy === paySection.id}
                              onClick={() => confirmPaid(paySection, order.orderNo)}
                            >
                              통장 확인함 · 입금확정
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
            <div className="panel-body stock-category-list">
              {stockGroups.map((group) => (
                <section className="stock-category" key={group.category}>
                  <div className="stock-category-head">
                    <h3>{group.category}</h3>
                    <span>{group.menus.length}개 메뉴</span>
                  </div>
                  <div className="stock-grid">
                    {group.menus.map((menu) => (
                      <article className={`stock-card ${menu.isAvailable ? "" : "soldout"}`} key={menu.id}>
                        <div className="stock-main">
                          <h3 className="stock-name">{menu.name}</h3>
                          <p className="stock-meta">
                            {menu.teamName} · {formatWon(menu.price)}
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
              ))}
            </div>
          </section>
        </div>
      </main>

      {undoToast ? (
        <div className="undo-toast" role="status">
          <span>{undoToast.orderNo} 입금확인 완료</span>
          <button type="button" onClick={undoPaid}>
            실행취소
          </button>
        </div>
      ) : null}
    </>
  );
}
