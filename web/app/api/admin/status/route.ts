import { requireAdminSession } from "@/lib/admin-auth";
import { fail, ok, readJson } from "@/lib/http";
import { store } from "@/lib/store";
import type { OrderStatus } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ sectionId: string; status: OrderStatus; adminNote?: string }>(request);
    return ok(
      await store.updateOrderStatus(
        await requireAdminSession(),
        body.sectionId || "",
        body.status,
        body.adminNote || ""
      )
    );
  } catch (error) {
    return fail(error);
  }
}
