import { createHmac, createHash, randomUUID, timingSafeEqual } from "crypto";

const COOKIE_SECRET = process.env.COOKIE_SECRET || "local-demo-cookie-secret";

export function newToken() {
  return randomUUID();
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashOrderToken(token: string) {
  return sha256(`order:${token}:${COOKIE_SECRET}`);
}

export function hashAdminPin(pin: string, eventCode: string) {
  return sha256(`admin:${eventCode}:${pin}:${COOKIE_SECRET}`);
}

export function secureEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signPayload(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", COOKIE_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyPayload<T>(value: string): T | null {
  const [body, sig] = value.split(".");
  if (!body || !sig) {
    return null;
  }
  const expected = createHmac("sha256", COOKIE_SECRET).update(body).digest("base64url");
  if (!secureEqual(sig, expected)) {
    return null;
  }
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
}
