import { cookies } from "next/headers";
import { signPayload, verifyPayload } from "./crypto";
import type { AdminSession } from "./types";

const COOKIE_NAME = "mission_bazaar_admin";

export async function setAdminSession(session: AdminSession) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, signPayload(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(0, session.exp - Math.floor(Date.now() / 1000))
  });
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  if (!value) {
    return null;
  }
  const session = verifyPayload<AdminSession>(value);
  if (!session || session.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return session;
}

export async function requireAdminSession() {
  const session = await getAdminSession();
  if (!session) {
    throw new Error("관리자 로그인이 필요합니다.");
  }
  return session;
}
