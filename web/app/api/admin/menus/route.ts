import { requireAdminSession } from "@/lib/admin-auth";
import { fail, ok, readJson } from "@/lib/http";
import { store } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ menuId: string; isAvailable: boolean }>(request);
    return ok(await store.updateMenuAvailability(await requireAdminSession(), body.menuId || "", Boolean(body.isAvailable)));
  } catch (error) {
    return fail(error);
  }
}
