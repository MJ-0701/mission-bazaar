import type { Menu, OrderItemInput, OrderStatus, Team } from "./types";

export const APP_TITLE = "선교 바자회 주문";
export const EVENT_CODE = process.env.EVENT_CODE || "mission-bazaar-2026";
export const MENU_CATEGORY_ORDER = ["디쉬", "음료", "기타"];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PAYMENT_PENDING: "입금 대기",
  PAYMENT_CHECKING: "입금 확인 중",
  PAID: "입금 확인 완료 / 준비 중",
  READY: "준비 완료",
  COMPLETE: "수령 완료",
  PAYMENT_ISSUE: "입금 확인 필요",
  CANCELED: "주문 취소"
};

export const ADMIN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PAYMENT_PENDING: ["PAID", "CANCELED"],
  PAYMENT_CHECKING: ["PAID", "PAYMENT_ISSUE", "CANCELED"],
  PAYMENT_ISSUE: ["PAID", "CANCELED"],
  PAID: ["READY", "CANCELED", "PAYMENT_CHECKING"],
  READY: ["COMPLETE"],
  COMPLETE: [],
  CANCELED: ["PAYMENT_CHECKING"]
};

export const STATUS_PRIORITY: Record<OrderStatus, number> = {
  PAYMENT_CHECKING: 1,
  PAYMENT_ISSUE: 2,
  PAID: 3,
  READY: 4,
  PAYMENT_PENDING: 5,
  COMPLETE: 6,
  CANCELED: 7
};

export function formatWon(amount: number) {
  return `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
}

export function menuCategoryLabel(category: string) {
  const label = String(category || "").trim();
  if (!label) {
    return "기타";
  }
  if (label === "음식" || label.toLowerCase() === "dish") {
    return "디쉬";
  }
  if (label.toLowerCase() === "drink" || label.toLowerCase() === "beverage") {
    return "음료";
  }
  return label;
}

function menuCategoryRank(category: string) {
  const index = MENU_CATEGORY_ORDER.indexOf(menuCategoryLabel(category));
  return index === -1 ? MENU_CATEGORY_ORDER.length : index;
}

export function compareMenuCategories(a: string, b: string) {
  return menuCategoryRank(a) - menuCategoryRank(b) || menuCategoryLabel(a).localeCompare(menuCategoryLabel(b), "ko");
}

export function compareMenus(a: Menu, b: Menu) {
  return (
    compareMenuCategories(a.category, b.category) ||
    a.sortOrder - b.sortOrder ||
    a.teamName.localeCompare(b.teamName, "ko") ||
    a.name.localeCompare(b.name, "ko")
  );
}

export function sanitizeText(value: unknown, maxLength: number) {
  const raw = String(value ?? "").trim().slice(0, maxLength);
  if (/^[=+\-@]/.test(raw)) {
    return `'${raw}`;
  }
  return raw;
}

export function normalizeAdminPin(value: unknown) {
  const raw = sanitizeText(value, 40);
  const compactDigits = raw.replace(/\s+/g, "");
  if (/^\d+$/.test(compactDigits)) {
    return compactDigits;
  }
  const trailingDigits = raw.match(/(\d{4,12})\s*$/);
  return trailingDigits ? trailingDigits[1] : raw;
}

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export function normalizeCustomerKey(pickupName: string, phone: string) {
  return `${pickupName.replace(/\s+/g, "")}:${normalizePhone(phone)}`;
}

export function statusLabel(status: OrderStatus) {
  return STATUS_LABELS[status] || status;
}

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return (ADMIN_TRANSITIONS[from] || []).includes(to);
}

export function groupMenusByTeam(menus: Menu[], teams: Team[]) {
  return teams
    .map((team) => ({
      team,
      categories: Array.from(
        menus
          .filter((menu) => menu.teamId === team.id)
          .reduce((map, menu) => {
            const category = menuCategoryLabel(menu.category);
            const existing = map.get(category) || [];
            existing.push(menu);
            map.set(category, existing);
            return map;
          }, new Map<string, Menu[]>())
      )
        .sort(([a], [b]) => compareMenuCategories(a, b))
        .map(([category, items]) => ({
          category,
          items: items.sort(compareMenus)
        }))
    }))
    .filter((group) => group.categories.length > 0);
}

export function groupMenusByCategory(menus: Menu[]) {
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
    .map(([category, items]) => ({
      category,
      items: items.sort(compareMenus)
    }));
}

export function buildOrderLines(items: OrderItemInput[], menus: Menu[]) {
  const menuMap = new Map(menus.map((menu) => [menu.id, menu]));
  const quantityMap = new Map<string, number>();

  for (const item of items) {
    const menuId = sanitizeText(item.menuId, 120);
    const quantity = Math.trunc(Number(item.quantity || 0));
    if (!menuId || quantity <= 0) {
      continue;
    }
    if (quantity > 99) {
      throw new Error("한 메뉴는 최대 99개까지 주문할 수 있습니다.");
    }
    quantityMap.set(menuId, (quantityMap.get(menuId) || 0) + quantity);
  }

  const lines = Array.from(quantityMap.entries()).map(([menuId, quantity]) => {
    const menu = menuMap.get(menuId);
    if (!menu) {
      throw new Error("존재하지 않는 메뉴가 포함되어 있습니다.");
    }
    if (!menu.isAvailable) {
      throw new Error(`${menu.name}은(는) 현재 품절입니다.`);
    }
    const subtotal = menu.price * quantity;
    return {
      menu,
      quantity,
      subtotal
    };
  });

  if (!lines.length) {
    throw new Error("메뉴를 하나 이상 선택해주세요.");
  }

  return lines;
}
