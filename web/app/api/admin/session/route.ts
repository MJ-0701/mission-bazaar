import { getAdminSession } from "@/lib/admin-auth";
import { ok } from "@/lib/http";

export async function GET() {
  return ok({ session: await getAdminSession() });
}
