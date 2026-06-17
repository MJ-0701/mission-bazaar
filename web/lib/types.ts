export type OrderStatus =
  | "PAYMENT_PENDING"
  | "PAYMENT_CHECKING"
  | "PAID"
  | "READY"
  | "COMPLETE"
  | "PAYMENT_ISSUE"
  | "CANCELED";

export type AdminRole = "master" | "admin";

export type Team = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type Menu = {
  id: string;
  teamId: string;
  teamCode: string;
  teamName: string;
  code: string;
  name: string;
  price: number;
  category: string;
  isAvailable: boolean;
  sortOrder: number;
};

export type OrderItemInput = {
  menuId: string;
  quantity: number;
};

export type OrderItem = {
  id: string;
  menuId: string;
  teamId: string;
  menuCode: string;
  menuName: string;
  category: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
};

export type OrderSection = {
  id: string;
  orderId: string;
  orderNo: string;
  orderToken?: string;
  teamId: string;
  teamCode: string;
  teamName: string;
  status: OrderStatus;
  statusLabel: string;
  subtotalAmount: number;
  pickupName: string;
  phone: string;
  depositorName: string;
  memo: string;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
  statusUpdatedAt: string;
  items: OrderItem[];
};

export type OrderGroup = {
  id: string;
  orderNo: string;
  orderToken?: string;
  pickupName: string;
  phone: string;
  depositorName: string;
  memo: string;
  totalAmount: number;
  paymentMethod: string;
  createdAt: string;
  updatedAt: string;
  sections: OrderSection[];
};

export type Settings = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  qrImageUrl: string;
};

export type PublicBootstrap = {
  appTitle: string;
  eventCode: string;
  menus: Menu[];
  teams: Team[];
  settings: Settings;
  statusLabels: Record<OrderStatus, string>;
  demoMode: boolean;
};

export type AdminSession = {
  role: AdminRole;
  teamId: string | null;
  teamCode: string | null;
  teamName: string | null;
  label: string;
  exp: number;
};

export type AdminDashboard = {
  admin: AdminSession;
  teams: Team[];
  menus: Menu[];
  orders: OrderSection[];
  stats: Record<OrderStatus, number>;
  transitions: Record<OrderStatus, OrderStatus[]>;
  statusLabels: Record<OrderStatus, string>;
  settings: Settings;
  updatedAt: string;
  demoMode: boolean;
};

export type CreateOrderPayload = {
  pickupName: string;
  phone: string;
  depositorName: string;
  memo?: string;
  items: OrderItemInput[];
};

export type PickupSnapshot = {
  order: OrderGroup;
  orders: OrderSection[];
  teams: Team[];
  updatedAt: string;
  demoMode: boolean;
};
