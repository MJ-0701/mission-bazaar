import { createHash } from "crypto";

const eventCode = process.env.EVENT_CODE || "mission-bazaar-2026";
const secret = process.env.COOKIE_SECRET || "";
const pins = process.argv.slice(2);

if (!secret || pins.length === 0) {
  console.error("Usage: COOKIE_SECRET=... EVENT_CODE=mission-bazaar-2026 node scripts/hash-admin-pin.mjs <PIN> [PIN...]");
  process.exit(1);
}

for (const pin of pins) {
  const hash = createHash("sha256").update(`admin:${eventCode}:${pin}:${secret}`).digest("hex");
  console.log(`${pin}: ${hash}`);
}
