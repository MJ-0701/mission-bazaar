import { fail, ok, readJson } from "@/lib/http";
import { store } from "@/lib/store";
import type { CreateOrderPayload } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const payload = await readJson<CreateOrderPayload>(request);
    return ok(await store.createOrder(payload));
  } catch (error) {
    return fail(error);
  }
}
