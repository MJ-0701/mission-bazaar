import { fail, ok } from "@/lib/http";
import { store } from "@/lib/store";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return ok(
      await store.getPickupSnapshot(
        url.searchParams.get("orderNo") || url.searchParams.get("orderId") || "",
        url.searchParams.get("token") || ""
      )
    );
  } catch (error) {
    return fail(error);
  }
}
