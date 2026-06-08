import { clearAdminSession } from "@/lib/admin-auth";
import { ok } from "@/lib/http";

export async function POST() {
  await clearAdminSession();
  return ok({ loggedOut: true });
}
