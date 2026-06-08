import { fail, ok, readJson } from "@/lib/http";
import { store } from "@/lib/store";

export async function POST(request: Request, context: { params: Promise<{ orderNo: string }> }) {
  try {
    const { orderNo } = await context.params;
    const body = await readJson<{ token: string }>(request);
    return ok(await store.markPaymentChecking(orderNo, body.token || ""));
  } catch (error) {
    return fail(error);
  }
}
