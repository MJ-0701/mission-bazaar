import {
  ADMIN_TRANSITIONS,
  APP_TITLE,
  EVENT_CODE,
  STATUS_LABELS,
  buildOrderLines,
  canTransition,
  normalizeAdminPin,
  normalizeCustomerKey,
  normalizePhone,
  sanitizeText,
  statusLabel
} from "./domain";
import { hashAdminPin, hashOrderToken, newToken } from "./crypto";
import type {
  AdminDashboard,
  AdminSession,
  CreateOrderPayload,
  Menu,
  OrderGroup,
  OrderItem,
  OrderSection,
  OrderStatus,
  PickupSnapshot,
  PublicBootstrap,
  Settings,
  Team
} from "./types";

type DemoOrder = Omit<OrderGroup, "sections"> & {
  tokenHash: string;
  customerKey: string;
  sections: OrderSection[];
};

type DemoState = {
  counter: number;
  teams: Team[];
  menus: Menu[];
  orders: DemoOrder[];
  settings: Settings;
  pinHashes: Array<{
    role: "master" | "admin";
    teamId: string | null;
    label: string;
    hash: string;
  }>;
};

const nowIso = () => new Date().toISOString();

const state: DemoState = globalThis.__missionBazaarDemoState || {
  counter: 0,
  teams: [
    {
      id: "team-food",
      code: "food",
      name: "먹거리팀",
      sortOrder: 10,
      isActive: true
    }
  ],
  menus: [],
  orders: [],
  settings: {
    bankName: "은행명",
    accountNumber: "계좌번호",
    accountHolder: "예금주",
    qrImageUrl: ""
  },
  pinHashes: []
};

state.menus = state.menus.length
  ? state.menus
  : [
      menu("team-food", "food", "먹거리팀", "food-canape-4", "카나페 4개", 3000, "디쉬", 10),
      menu("team-food", "food", "먹거리팀", "food-morning-sandwich-set", "모닝샌드위치 세트 (대파크림치즈, 에그샐러드)", 6000, "디쉬", 20),
      menu("team-food", "food", "먹거리팀", "food-watermelon-punch", "수박화채", 5000, "음료", 30),
      menu("team-food", "food", "먹거리팀", "food-hallabong-ade", "한라봉에이드", 4000, "음료", 40),
      menu("team-food", "food", "먹거리팀", "food-coffee", "커피", 3000, "음료", 50)
    ];

state.pinHashes = state.pinHashes.length
  ? state.pinHashes
  : [
      { role: "master", teamId: null, label: "master demo", hash: hashAdminPin("1111", EVENT_CODE) },
      { role: "admin", teamId: null, label: "admin demo", hash: hashAdminPin("2222", EVENT_CODE) }
    ];

globalThis.__missionBazaarDemoState = state;

declare global {
  // eslint-disable-next-line no-var
  var __missionBazaarDemoState: DemoState | undefined;
}

function menu(
  teamId: string,
  teamCode: string,
  teamName: string,
  code: string,
  name: string,
  price: number,
  category: string,
  sortOrder: number
): Menu {
  return {
    id: `menu-${code}`,
    teamId,
    teamCode,
    teamName,
    code,
    name,
    price,
    category,
    isAvailable: true,
    sortOrder
  };
}

function orderNo(counter: number) {
  return `A${String(counter).padStart(3, "0")}`;
}

function publicOrder(order: DemoOrder): OrderGroup {
  return {
    id: order.id,
    orderNo: order.orderNo,
    orderToken: order.orderToken,
    pickupName: order.pickupName,
    phone: order.phone,
    depositorName: order.depositorName,
    memo: order.memo,
    totalAmount: order.totalAmount,
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    sections: order.sections
  };
}

function assertToken(order: DemoOrder, token: string) {
  if (order.tokenHash !== hashOrderToken(token)) {
    throw new Error("주문 접근 권한이 없습니다.");
  }
}

function findOrder(orderNoValue: string) {
  const normalized = sanitizeText(orderNoValue, 20).toUpperCase();
  const order = state.orders.find((item) => item.orderNo === normalized);
  if (!order) {
    throw new Error("주문을 찾을 수 없습니다.");
  }
  return order;
}

function withLabels(section: OrderSection): OrderSection {
  return {
    ...section,
    statusLabel: statusLabel(section.status)
  };
}

function sortSections(sections: OrderSection[]) {
  return [...sections].sort((a, b) => {
    return (
      a.createdAt.localeCompare(b.createdAt) ||
      a.orderNo.localeCompare(b.orderNo, "ko", { numeric: true }) ||
      a.teamName.localeCompare(b.teamName, "ko")
    );
  });
}

export async function getPublicBootstrap(): Promise<PublicBootstrap> {
  return {
    appTitle: APP_TITLE,
    eventCode: EVENT_CODE,
    menus: [...state.menus].sort((a, b) => a.sortOrder - b.sortOrder),
    teams: [...state.teams].sort((a, b) => a.sortOrder - b.sortOrder),
    settings: state.settings,
    statusLabels: STATUS_LABELS,
    demoMode: true
  };
}

export async function createOrder(payload: CreateOrderPayload): Promise<OrderGroup> {
  const pickupName = sanitizeText(payload.pickupName, 40);
  const phone = normalizePhone(String(payload.phone ?? "")).slice(0, 20);
  const depositorName = sanitizeText(payload.depositorName, 40);
  const memo = sanitizeText(payload.memo, 300);
  if (!pickupName) {
    throw new Error("픽업자명을 입력해주세요.");
  }
  if (!phone) {
    throw new Error("연락처를 입력해주세요.");
  }
  if (!depositorName) {
    throw new Error("입금하실 분(예금주) 성함을 입력해주세요.");
  }

  const lines = buildOrderLines(payload.items, state.menus);
  const token = newToken();
  const nextNo = orderNo(++state.counter);
  const orderId = `order-${nextNo}`;
  const createdAt = nowIso();
  const totalAmount = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const sectionsByTeam = new Map<string, OrderSection>();
  const itemRows: Array<{ section: OrderSection; item: OrderItem }> = [];

  for (const line of lines) {
    const existing = sectionsByTeam.get(line.menu.teamId);
    const section =
      existing ||
      ({
        id: `section-${nextNo}-${line.menu.teamCode}`,
        orderId,
        orderNo: nextNo,
        orderToken: token,
        teamId: line.menu.teamId,
        teamCode: line.menu.teamCode,
        teamName: line.menu.teamName,
        status: "PAYMENT_PENDING",
        statusLabel: STATUS_LABELS.PAYMENT_PENDING,
        subtotalAmount: 0,
        pickupName,
        phone,
        depositorName,
        memo,
        adminNote: "",
        createdAt,
        updatedAt: createdAt,
        statusUpdatedAt: createdAt,
        items: []
      } satisfies OrderSection);
    sectionsByTeam.set(line.menu.teamId, section);

    const item: OrderItem = {
      id: `item-${nextNo}-${line.menu.code}`,
      menuId: line.menu.id,
      teamId: line.menu.teamId,
      menuCode: line.menu.code,
      menuName: line.menu.name,
      category: line.menu.category,
      unitPrice: line.menu.price,
      quantity: line.quantity,
      subtotal: line.subtotal
    };
    itemRows.push({ section, item });
  }

  for (const { section, item } of itemRows) {
    section.items.push(item);
    section.subtotalAmount += item.subtotal;
  }

  const order: DemoOrder = {
    id: orderId,
    orderNo: nextNo,
    orderToken: token,
    tokenHash: hashOrderToken(token),
    pickupName,
    phone,
    depositorName,
    customerKey: normalizeCustomerKey(pickupName, phone),
    memo,
    totalAmount,
    paymentMethod: "TRANSFER",
    createdAt,
    updatedAt: createdAt,
    sections: Array.from(sectionsByTeam.values())
  };
  state.orders.unshift(order);
  return publicOrder(order);
}

export async function markPaymentChecking(orderNoValue: string, token: string): Promise<OrderGroup> {
  const order = findOrder(orderNoValue);
  assertToken(order, token);
  const updatedAt = nowIso();
  order.updatedAt = updatedAt;
  order.sections = order.sections.map((section) => {
    if (section.status === "PAYMENT_PENDING") {
      return withLabels({
        ...section,
        status: "PAYMENT_CHECKING",
        updatedAt,
        statusUpdatedAt: updatedAt
      });
    }
    return section;
  });
  return publicOrder(order);
}

export async function getPickupSnapshot(orderNoValue: string, token: string): Promise<PickupSnapshot> {
  const order = findOrder(orderNoValue);
  assertToken(order, token);
  const orders = state.orders
    .filter((item) => item.customerKey === order.customerKey)
    .flatMap((item) => item.sections)
    .filter((section) => section.status !== "CANCELED")
    .map(withLabels);
  return {
    order: publicOrder(order),
    orders: sortSections(orders),
    teams: state.teams,
    updatedAt: nowIso(),
    demoMode: true
  };
}

export async function completePickup(orderNoValue: string, token: string, sectionId: string): Promise<PickupSnapshot> {
  const order = findOrder(orderNoValue);
  assertToken(order, token);
  const updatedAt = nowIso();
  const section = order.sections.find((item) => item.id === sectionId);
  if (!section) {
    throw new Error("주문 섹션을 찾을 수 없습니다.");
  }
  if (section.status !== "READY" && section.status !== "COMPLETE") {
    throw new Error("준비 완료된 주문만 수령 완료 처리할 수 있습니다.");
  }
  section.status = "COMPLETE";
  section.statusLabel = STATUS_LABELS.COMPLETE;
  section.updatedAt = updatedAt;
  section.statusUpdatedAt = updatedAt;
  order.updatedAt = updatedAt;
  return getPickupSnapshot(orderNoValue, token);
}

export async function loginAdmin(pin: string): Promise<AdminSession> {
  const hash = hashAdminPin(normalizeAdminPin(pin), EVENT_CODE);
  const record = state.pinHashes.find((item) => item.hash === hash);
  if (!record) {
    throw new Error("관리자 PIN이 올바르지 않습니다.");
  }
  const team = record.teamId ? state.teams.find((item) => item.id === record.teamId) || null : null;
  return {
    role: record.role,
    teamId: record.teamId,
    teamCode: team?.code ?? null,
    teamName: team?.name ?? null,
    label: record.label,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12
  };
}

export async function getAdminDashboard(session: AdminSession): Promise<AdminDashboard> {
  // master/admin 모두 행사 전체를 본다(단일 행사 콘솔).
  const visibleMenus = state.menus;
  const visibleTeams = state.teams;
  const orders = sortSections(
    state.orders
      .flatMap((order) => order.sections)
      .filter((section) => section.status !== "COMPLETE")
      .map(withLabels)
  );
  const stats = Object.keys(STATUS_LABELS).reduce((acc, key) => {
    acc[key as OrderStatus] = orders.filter((order) => order.status === key).length;
    return acc;
  }, {} as Record<OrderStatus, number>);
  return {
    admin: session,
    teams: visibleTeams,
    menus: visibleMenus,
    orders,
    stats,
    transitions: ADMIN_TRANSITIONS,
    statusLabels: STATUS_LABELS,
    settings: state.settings,
    updatedAt: nowIso(),
    demoMode: true
  };
}

export async function updateOrderStatus(
  session: AdminSession,
  sectionId: string,
  nextStatus: OrderStatus,
  adminNote: string
): Promise<AdminDashboard> {
  const order = state.orders.find((item) => item.sections.some((section) => section.id === sectionId));
  const section = order?.sections.find((item) => item.id === sectionId);
  if (!order || !section) {
    throw new Error("주문을 찾을 수 없습니다.");
  }
  // 입금 관련 처리(입금확인/입금문제/복구)는 master 전용.
  if (["PAID", "PAYMENT_ISSUE", "PAYMENT_CHECKING"].includes(nextStatus) && session.role !== "master") {
    throw new Error("입금 관련 처리는 master 권한만 가능합니다.");
  }
  if (!canTransition(section.status, nextStatus)) {
    throw new Error(`${section.statusLabel}에서 ${statusLabel(nextStatus)}로 변경할 수 없습니다.`);
  }
  const note = sanitizeText(adminNote, 500);
  if (nextStatus === "CANCELED" && note.length < 2) {
    throw new Error("주문 취소 사유를 입력해주세요.");
  }
  const updatedAt = nowIso();
  section.status = nextStatus;
  section.statusLabel = statusLabel(nextStatus);
  section.adminNote = note || section.adminNote;
  section.updatedAt = updatedAt;
  section.statusUpdatedAt = updatedAt;
  order.updatedAt = updatedAt;
  return getAdminDashboard(session);
}

export async function updateMenuAvailability(session: AdminSession, menuId: string, isAvailable: boolean) {
  const menuItem = state.menus.find((item) => item.id === menuId);
  if (!menuItem) {
    throw new Error("메뉴를 찾을 수 없습니다.");
  }
  menuItem.isAvailable = isAvailable;
  return getAdminDashboard(session);
}
