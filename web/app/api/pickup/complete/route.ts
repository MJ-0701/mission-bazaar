import { fail, ok, readJson } from "@/lib/http";
import { store } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ orderNo: string; token: string; sectionId: string }>(request);
    return ok(await store.completePickup(body.orderNo || "", body.token || "", body.sectionId || ""));
  } catch (error) {
    return fail(error);
  }
}
