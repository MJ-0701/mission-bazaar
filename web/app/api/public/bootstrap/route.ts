import { fail, ok } from "@/lib/http";
import { store } from "@/lib/store";

export async function GET() {
  try {
    return ok(await store.getPublicBootstrap());
  } catch (error) {
    return fail(error, 500);
  }
}
