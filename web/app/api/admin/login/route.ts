import { setAdminSession } from "@/lib/admin-auth";
import { fail, ok, readJson } from "@/lib/http";
import { store } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ pin: string }>(request);
    const session = await store.loginAdmin(body.pin || "");
    await setAdminSession(session);
    return ok(session);
  } catch (error) {
    return fail(error, 401);
  }
}
