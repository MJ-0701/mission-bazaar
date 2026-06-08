import { requireAdminSession } from "@/lib/admin-auth";
import { fail, ok } from "@/lib/http";
import { store } from "@/lib/store";

export async function GET() {
  try {
    return ok(await store.getAdminDashboard(await requireAdminSession()));
  } catch (error) {
    return fail(error, 401);
  }
}
