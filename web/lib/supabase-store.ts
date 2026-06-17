import {
  ADMIN_TRANSITIONS,
  APP_TITLE,
  EVENT_CODE,
  STATUS_LABELS,
  STATUS_PRIORITY,
  buildOrderLines,
  canTransition,
  normalizeAdminPin,
  normalizeCustomerKey,
  normalizePhone,
  sanitizeText,
  statusLabel
} from "./domain";
import { hashAdminPin, hashOrderToken, newToken, secureEqual } from "./crypto";
import { eq, inList, supabaseRequest } from "./supabase-rest";
import { publishOrderChange } from "./realtime-server";
import type {
  AdminDashboard,
  AdminRole,
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

type EventRow = {
  id: string;
  code: string;
  title: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  qr_image_url: string;
};

type TeamRow = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

type MenuRow = {
  id: string;
  team_id: string;
  code: string;
  name: string;
  price: number;
  category: string;
  is_available: boolean;
  sort_order: number;
  teams?: TeamRow;
};

type OrderRow = {
  id: string;
  event_id: string;
  order_no: string;
  order_token_hash: string;
  pickup_name: string;
  phone: string;
  depositor_name: string;
  customer_key: string;
  memo: string;
  total_amount: number;
  payment_method: string;
  created_at: string;
  updated_at: string;
};

type SectionRow = {
  id: string;
  order_id: string;
  team_id: string;
  status: OrderStatus;
  subtotal_amount: number;
  admin_note: string;
  status_updated_at: string;
  created_at: string;
  updated_at: string;
  teams?: TeamRow;
  orders?: OrderRow;
};

type ItemRow = {
  id: string;
  order_id: string;
  order_section_id: string;
  menu_id: string;
  team_id: string;
  menu_code: string;
  menu_name: string;
  category: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
};

async function getEvent() {
  const rows = await supabaseRequest<EventRow[]>(
    `/rest/v1/events?code=${eq(EVENT_CODE)}&is_active=eq.true&select=*&limit=1`
  );
  if (!rows[0]) {
    throw new Error(`활성 이벤트를 찾을 수 없습니다: ${EVENT_CODE}`);
  }
  return rows[0];
}

function mapTeam(row: TeamRow): Team {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: row.is_active
  };
}

function mapMenu(row: MenuRow, team?: TeamRow): Menu {
  const teamRow = team || row.teams;
  return {
    id: row.id,
    teamId: row.team_id,
    teamCode: teamRow?.code || "",
    teamName: teamRow?.name || "",
    code: row.code,
    name: row.name,
    price: row.price,
    category: row.category,
    isAvailable: row.is_available,
    sortOrder: row.sort_order
  };
}

function mapItem(row: ItemRow): OrderItem {
  return {
    id: row.id,
    menuId: row.menu_id,
    teamId: row.team_id,
    menuCode: row.menu_code,
    menuName: row.menu_name,
    category: row.category,
    unitPrice: row.unit_price,
    quantity: row.quantity,
    subtotal: row.subtotal
  };
}

function mapSection(row: SectionRow, order: OrderRow, items: ItemRow[]): OrderSection {
  const team = row.teams;
  return {
    id: row.id,
    orderId: row.order_id,
    orderNo: order.order_no,
    teamId: row.team_id,
    teamCode: team?.code || "",
    teamName: team?.name || "",
    status: row.status,
    statusLabel: statusLabel(row.status),
    subtotalAmount: row.subtotal_amount,
    pickupName: order.pickup_name,
    phone: order.phone,
    depositorName: order.depositor_name || "",
    memo: order.memo || "",
    adminNote: row.admin_note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    statusUpdatedAt: row.status_updated_at,
    items: items.filter((item) => item.order_section_id === row.id).map(mapItem)
  };
}

function mapOrder(order: OrderRow, sections: SectionRow[], items: ItemRow[], token?: string): OrderGroup {
  return {
    id: order.id,
    orderNo: order.order_no,
    orderToken: token,
    pickupName: order.pickup_name,
    phone: order.phone,
    depositorName: order.depositor_name || "",
    memo: order.memo || "",
    totalAmount: order.total_amount,
    paymentMethod: order.payment_method,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    sections: sections.map((section) => mapSection(section, order, items))
  };
}

async function getTeams(eventId: string) {
  const rows = await supabaseRequest<TeamRow[]>(
    `/rest/v1/teams?event_id=${eq(eventId)}&is_active=eq.true&select=*&order=sort_order.asc`
  );
  return rows.map(mapTeam);
}

async function getMenus(eventId: string) {
  const rows = await supabaseRequest<MenuRow[]>(
    `/rest/v1/menus?event_id=${eq(eventId)}&select=*,teams(*)&order=sort_order.asc`
  );
  return rows.map((row) => mapMenu(row));
}

async function getOrderByNo(eventId: string, orderNo: string) {
  const rows = await supabaseRequest<OrderRow[]>(
    `/rest/v1/orders?event_id=${eq(eventId)}&order_no=${eq(orderNo.toUpperCase())}&select=*&limit=1`
  );
  if (!rows[0]) {
    throw new Error("주문을 찾을 수 없습니다.");
  }
  return rows[0];
}

async function getSections(orderIds: string[]) {
  if (!orderIds.length) {
    return [];
  }
  return supabaseRequest<SectionRow[]>(
    `/rest/v1/order_sections?order_id=${inList(orderIds)}&select=*,teams(*)&order=status_updated_at.desc`
  );
}

async function getItems(orderIds: string[]) {
  if (!orderIds.length) {
    return [];
  }
  return supabaseRequest<ItemRow[]>(
    `/rest/v1/order_items?order_id=${inList(orderIds)}&select=*&order=created_at.asc`
  );
}

async function assertOrderAccess(eventId: string, orderNo: string, token: string) {
  const order = await getOrderByNo(eventId, orderNo);
  if (!secureEqual(order.order_token_hash, hashOrderToken(token))) {
    throw new Error("주문 접근 권한이 없습니다.");
  }
  return order;
}

export async function getPublicBootstrap(): Promise<PublicBootstrap> {
  const event = await getEvent();
  return {
    appTitle: APP_TITLE,
    eventCode: event.code,
    menus: await getMenus(event.id),
    teams: await getTeams(event.id),
    settings: {
      bankName: event.bank_name,
      accountNumber: event.account_number,
      accountHolder: event.account_holder,
      qrImageUrl: event.qr_image_url
    },
    statusLabels: STATUS_LABELS,
    demoMode: false
  };
}

function extractPgMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "";
  }
  try {
    const body = JSON.parse(error.message);
    if (body && typeof body.message === "string") {
      return body.message;
    }
  } catch {
    // PostgREST 형식이 아니면 원문 노출하지 않음
  }
  return "";
}

function isMissingRpc(error: unknown): boolean {
  // create_order RPC 미적용(마이그레이션 전): PostgREST는 PGRST202(함수 없음)로 응답
  const message = error instanceof Error ? error.message : "";
  return message.includes("PGRST202");
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

  const items = (payload.items || [])
    .map((item) => ({ menu_id: item.menuId, quantity: Math.floor(Number(item.quantity) || 0) }))
    .filter((item) => item.menu_id && item.quantity > 0);
  if (!items.length) {
    throw new Error("메뉴를 선택해주세요.");
  }

  const token = newToken();
  try {
    // 빠른 경로: 단일 RPC = 카운터+order+sections+items 한 트랜잭션/한 왕복
    const result = await supabaseRequest<{ order: OrderRow; sections: SectionRow[]; items: ItemRow[] }>(
      `/rest/v1/rpc/create_order`,
      {
        method: "POST",
        body: JSON.stringify({
          p_event_code: EVENT_CODE,
          p_pickup_name: pickupName,
          p_phone: phone,
          p_depositor_name: depositorName,
          p_customer_key: normalizeCustomerKey(pickupName, phone),
          p_memo: memo,
          p_token_hash: hashOrderToken(token),
          p_items: items
        })
      }
    );
    void publishOrderChange();
    return mapOrder(result.order, result.sections, result.items, token);
  } catch (error) {
    // RPC 미적용(마이그레이션 전)이면 기존 4-왕복 경로로 폴백 — 무중단 롤아웃
    if (isMissingRpc(error)) {
      return createOrderLegacy(payload, token);
    }
    throw new Error(extractPgMessage(error) || "주문 생성에 실패했습니다.");
  }
}

async function createOrderLegacy(payload: CreateOrderPayload, token: string): Promise<OrderGroup> {
  const event = await getEvent();
  const pickupName = sanitizeText(payload.pickupName, 40);
  const phone = normalizePhone(String(payload.phone ?? "")).slice(0, 20);
  const depositorName = sanitizeText(payload.depositorName, 40);
  const memo = sanitizeText(payload.memo, 300);

  const menus = await getMenus(event.id);
  const lines = buildOrderLines(payload.items, menus);
  const orderNo = await supabaseRequest<string>(`/rest/v1/rpc/next_order_no`, {
    method: "POST",
    body: JSON.stringify({ target_event_code: EVENT_CODE })
  });
  const totalAmount = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const [order] = await supabaseRequest<OrderRow[]>(`/rest/v1/orders?select=*`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      event_id: event.id,
      order_no: orderNo,
      order_token_hash: hashOrderToken(token),
      pickup_name: pickupName,
      phone,
      depositor_name: depositorName,
      customer_key: normalizeCustomerKey(pickupName, phone),
      memo,
      total_amount: totalAmount,
      payment_method: "TRANSFER"
    })
  });

  const groups = new Map<string, { menu: Menu; subtotal: number }[]>();
  for (const line of lines) {
    const list = groups.get(line.menu.teamId) || [];
    list.push({ menu: line.menu, subtotal: line.subtotal });
    groups.set(line.menu.teamId, list);
  }

  const sectionRows = Array.from(groups.entries()).map(([teamId, group]) => ({
    order_id: order.id,
    team_id: teamId,
    status: "PAYMENT_PENDING",
    subtotal_amount: group.reduce((sum, item) => sum + item.subtotal, 0)
  }));
  const sections = await supabaseRequest<SectionRow[]>(`/rest/v1/order_sections?select=*,teams(*)`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(sectionRows)
  });

  const sectionByTeam = new Map(sections.map((section) => [section.team_id, section]));
  const itemRows = lines.map((line) => {
    const section = sectionByTeam.get(line.menu.teamId);
    if (!section) {
      throw new Error("주문 섹션 생성에 실패했습니다.");
    }
    return {
      order_id: order.id,
      order_section_id: section.id,
      menu_id: line.menu.id,
      team_id: line.menu.teamId,
      menu_code: line.menu.code,
      menu_name: line.menu.name,
      category: line.menu.category,
      unit_price: line.menu.price,
      quantity: line.quantity,
      subtotal: line.subtotal
    };
  });
  const items = await supabaseRequest<ItemRow[]>(`/rest/v1/order_items?select=*`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(itemRows)
  });

  void publishOrderChange();
  return mapOrder(order, sections, items, token);
}

export async function markPaymentChecking(orderNo: string, token: string): Promise<OrderGroup> {
  const event = await getEvent();
  const order = await assertOrderAccess(event.id, orderNo, token);
  await supabaseRequest(`/rest/v1/order_sections?order_id=${eq(order.id)}&status=eq.PAYMENT_PENDING`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "PAYMENT_CHECKING",
      status_updated_at: new Date().toISOString(),
      status_updated_by: "customer"
    })
  });
  const sections = await getSections([order.id]);
  const items = await getItems([order.id]);
  void publishOrderChange();
  return mapOrder(order, sections, items, token);
}

export async function getPickupSnapshot(orderNo: string, token: string): Promise<PickupSnapshot> {
  const event = await getEvent();
  const order = await assertOrderAccess(event.id, orderNo, token);
  const orderRows = await supabaseRequest<OrderRow[]>(
    `/rest/v1/orders?event_id=${eq(event.id)}&customer_key=${eq(order.customer_key)}&select=*&order=created_at.desc&limit=50`
  );
  const orderIds = orderRows.map((row) => row.id);
  const sections = await getSections(orderIds);
  const items = await getItems(orderIds);
  const orderMap = new Map(orderRows.map((row) => [row.id, row]));
  const sectionDtos = sections
    .map((section) => mapSection(section, orderMap.get(section.order_id) || order, items))
    .sort((a, b) => {
      const statusDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
      return statusDiff || b.createdAt.localeCompare(a.createdAt);
    });
  return {
    order: mapOrder(order, sections.filter((section) => section.order_id === order.id), items, token),
    orders: sectionDtos,
    teams: await getTeams(event.id),
    updatedAt: new Date().toISOString(),
    demoMode: false
  };
}

export async function completePickup(orderNo: string, token: string, sectionId: string): Promise<PickupSnapshot> {
  const event = await getEvent();
  const order = await assertOrderAccess(event.id, orderNo, token);
  // 픽업 화면은 같은 손님(customer_key)의 여러 주문을 함께 보여줌 → URL 주문이 아닌
  // 섹션도 수령완료 가능해야 함. 섹션의 소속 주문이 같은 손님인지 검증.
  const sectionRows = await supabaseRequest<SectionRow[]>(
    `/rest/v1/order_sections?id=${eq(sectionId)}&select=*,teams(*),orders(*)&limit=1`
  );
  const section = sectionRows[0];
  const sectionOrder = section?.orders as OrderRow | undefined;
  if (!section || !sectionOrder || sectionOrder.event_id !== event.id || sectionOrder.customer_key !== order.customer_key) {
    throw new Error("주문 섹션을 찾을 수 없습니다.");
  }
  if (section.status !== "READY" && section.status !== "COMPLETE") {
    throw new Error("준비 완료된 주문만 수령 완료 처리할 수 있습니다.");
  }
  await supabaseRequest(`/rest/v1/order_sections?id=${eq(sectionId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "COMPLETE",
      status_updated_at: new Date().toISOString(),
      status_updated_by: "customer"
    })
  });
  void publishOrderChange();
  return getPickupSnapshot(orderNo, token);
}

export async function loginAdmin(pin: string): Promise<AdminSession> {
  const event = await getEvent();
  const rows = await supabaseRequest<
    Array<{ role: AdminRole; team_id: string | null; label: string; pin_hash: string; teams?: TeamRow }>
  >(
    `/rest/v1/admin_pins?event_id=${eq(event.id)}&is_active=eq.true&select=role,team_id,label,pin_hash,teams(*)&limit=20`
  );
  const hash = hashAdminPin(normalizeAdminPin(pin), EVENT_CODE);
  const found = rows.find((row) => secureEqual(row.pin_hash, hash));
  if (!found) {
    throw new Error("관리자 PIN이 올바르지 않습니다.");
  }
  return {
    role: found.role,
    teamId: found.team_id,
    teamCode: found.teams?.code ?? null,
    teamName: found.teams?.name ?? null,
    label: found.label || found.teams?.name || found.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12
  };
}

export async function getAdminDashboard(session: AdminSession): Promise<AdminDashboard> {
  const event = await getEvent();
  const teams = await getTeams(event.id);
  // master/admin 모두 행사 전체를 본다(단일 행사 콘솔). 역할 차이는 입금확인 권한뿐.
  const menus = await getMenus(event.id);
  const statuses = ["PAYMENT_PENDING", "PAYMENT_CHECKING", "PAYMENT_ISSUE", "PAID", "READY", "CANCELED"];
  const sections = await supabaseRequest<SectionRow[]>(
    `/rest/v1/order_sections?status=${inList(statuses)}&select=*,teams(*),orders!inner(*)&orders.event_id=${eq(event.id)}&order=created_at.asc&limit=200`
  );
  const orderIds = Array.from(new Set(sections.map((section) => section.order_id)));
  const items = await getItems(orderIds);
  const orders = sections
    .map((section) => mapSection(section, section.orders as OrderRow, items))
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) ||
        a.orderNo.localeCompare(b.orderNo, "ko", { numeric: true }) ||
        a.teamName.localeCompare(b.teamName, "ko")
    );
  const stats = Object.keys(STATUS_LABELS).reduce((acc, key) => {
    acc[key as OrderStatus] = orders.filter((order) => order.status === key).length;
    return acc;
  }, {} as Record<OrderStatus, number>);
  return {
    admin: session,
    teams,
    menus,
    orders,
    stats,
    transitions: ADMIN_TRANSITIONS,
    statusLabels: STATUS_LABELS,
    settings: {
      bankName: event.bank_name,
      accountNumber: event.account_number,
      accountHolder: event.account_holder,
      qrImageUrl: event.qr_image_url
    },
    updatedAt: new Date().toISOString(),
    demoMode: false
  };
}

export async function updateOrderStatus(
  session: AdminSession,
  sectionId: string,
  nextStatus: OrderStatus,
  adminNote: string
): Promise<AdminDashboard> {
  const event = await getEvent();
  const rows = await supabaseRequest<SectionRow[]>(
    `/rest/v1/order_sections?id=${eq(sectionId)}&select=*,teams(*),orders(*)&limit=1`
  );
  const section = rows[0];
  if (!section) {
    throw new Error("주문을 찾을 수 없습니다.");
  }
  // 다른 행사 섹션을 ID로 조작하지 못하도록 현재 행사 소속 검증(team 스코프 제거에 따른 가드).
  if ((section.orders as OrderRow | undefined)?.event_id !== event.id) {
    throw new Error("해당 주문에 접근할 수 없습니다.");
  }
  // 입금 관련 처리(입금확인 PAID / 입금문제 / 복구 →확인중)는 master 전용. admin은 준비완료 이후만.
  if (["PAID", "PAYMENT_ISSUE", "PAYMENT_CHECKING"].includes(nextStatus) && session.role !== "master") {
    throw new Error("입금 관련 처리는 master 권한만 가능합니다.");
  }
  // 손님이 '입금했어요'(→입금 확인 중) 누르기 전(PENDING)에는 입금확인 불가.
  if (nextStatus === "PAID" && section.status === "PAYMENT_PENDING") {
    throw new Error("손님이 '입금했어요'를 누른 뒤(입금 확인 중) 입금확인할 수 있습니다.");
  }
  if (!canTransition(section.status, nextStatus)) {
    throw new Error(`${statusLabel(section.status)}에서 ${statusLabel(nextStatus)}로 변경할 수 없습니다.`);
  }
  const note = sanitizeText(adminNote, 500);
  if (nextStatus === "CANCELED" && note.length < 2) {
    throw new Error("주문 취소 사유를 입력해주세요.");
  }
  await supabaseRequest(`/rest/v1/order_sections?id=${eq(sectionId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: nextStatus,
      admin_note: note || section.admin_note,
      status_updated_at: new Date().toISOString(),
      status_updated_by: session.label
    })
  });
  void publishOrderChange();
  return getAdminDashboard(session);
}

export async function updateMenuAvailability(session: AdminSession, menuId: string, isAvailable: boolean) {
  const event = await getEvent();
  const menus = await getMenus(event.id);
  const menu = menus.find((item) => item.id === menuId);
  if (!menu) {
    throw new Error("메뉴를 찾을 수 없습니다.");
  }
  await supabaseRequest(`/rest/v1/menus?id=${eq(menuId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ is_available: isAvailable })
  });
  void publishOrderChange();
  return getAdminDashboard(session);
}
