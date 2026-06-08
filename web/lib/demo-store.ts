import {
  ADMIN_TRANSITIONS,
  APP_TITLE,
  EVENT_CODE,
  STATUS_LABELS,
  buildOrderLines,
  canTransition,
  normalizeAdminPin,
  normalizeCustomerKey,
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
    role: "master" | "team";
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
      id: "team-yeongju",
      code: "yeongju",
      name: "영주팀",
      sortOrder: 10,
      isActive: true
    },
    {
      id: "team-jeju",
      code: "jeju",
      name: "제주팀",
      sortOrder: 20,
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
      menu("team-yeongju", "yeongju", "영주팀", "yeongju-morning-sand", "모닝샌드", 8000, "음식", 10),
      menu("team-yeongju", "yeongju", "영주팀", "yeongju-blueberry-ade", "블루베리 에이드", 4500, "음료", 20),
      menu("team-yeongju", "yeongju", "영주팀", "yeongju-americano", "아메리카노", 3000, "음료", 30),
      menu("team-yeongju", "yeongju", "영주팀", "yeongju-honey-black-tea", "자몽허니 블랙티", 4500, "음료", 40),
      menu("team-jeju", "jeju", "제주팀", "jeju-main-dish", "Main-Dish", 7000, "음식", 10),
      menu("team-jeju", "jeju", "제주팀", "jeju-drink", "Drink", 4500, "음료", 20)
    ];

state.pinHashes = state.pinHashes.length
  ? state.pinHashes
  : [
      { role: "master", teamId: null, label: "master demo", hash: hashAdminPin("0000", EVENT_CODE) },
      { role: "team", teamId: "team-yeongju", label: "영주팀 demo", hash: hashAdminPin("1111", EVENT_CODE) },
      { role: "team", teamId: "team-jeju", label: "제주팀 demo", hash: hashAdminPin("2222", EVENT_CODE) }
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
  const phone = sanitizeText(payload.phone, 30);
  const memo = sanitizeText(payload.memo, 300);
  if (!pickupName) {
    throw new Error("픽업자명을 입력해주세요.");
  }
  if (!phone) {
    throw new Error("연락처를 입력해주세요.");
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
    teamCode: team?.code || null,
    teamName: team?.name || null,
    label: record.label,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12
  };
}

export async function getAdminDashboard(session: AdminSession): Promise<AdminDashboard> {
  const visibleMenus = state.menus.filter((menuItem) => session.role === "master" || menuItem.teamId === session.teamId);
  const visibleTeams = state.teams.filter((team) => session.role === "master" || team.id === session.teamId);
  const orders = sortSections(
    state.orders
      .flatMap((order) => order.sections)
      .filter((section) => session.role === "master" || section.teamId === session.teamId)
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
  if (session.role !== "master" && section.teamId !== session.teamId) {
    throw new Error("해당 팀 주문에 접근할 수 없습니다.");
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
  if (session.role !== "master" && menuItem.teamId !== session.teamId) {
    throw new Error("해당 팀 메뉴에 접근할 수 없습니다.");
  }
  menuItem.isAvailable = isAvailable;
  return getAdminDashboard(session);
}
