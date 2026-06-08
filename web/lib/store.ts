import * as demo from "./demo-store";
import * as supabase from "./supabase-store";
import { hasSupabaseConfig } from "./supabase-rest";

const active = () => (hasSupabaseConfig() ? supabase : demo);

export const store = {
  getPublicBootstrap: (...args: Parameters<typeof demo.getPublicBootstrap>) =>
    active().getPublicBootstrap(...args),
  createOrder: (...args: Parameters<typeof demo.createOrder>) => active().createOrder(...args),
  markPaymentChecking: (...args: Parameters<typeof demo.markPaymentChecking>) =>
    active().markPaymentChecking(...args),
  getPickupSnapshot: (...args: Parameters<typeof demo.getPickupSnapshot>) =>
    active().getPickupSnapshot(...args),
  completePickup: (...args: Parameters<typeof demo.completePickup>) => active().completePickup(...args),
  loginAdmin: (...args: Parameters<typeof demo.loginAdmin>) => active().loginAdmin(...args),
  getAdminDashboard: (...args: Parameters<typeof demo.getAdminDashboard>) =>
    active().getAdminDashboard(...args),
  updateOrderStatus: (...args: Parameters<typeof demo.updateOrderStatus>) =>
    active().updateOrderStatus(...args),
  updateMenuAvailability: (...args: Parameters<typeof demo.updateMenuAvailability>) =>
    active().updateMenuAvailability(...args)
};
