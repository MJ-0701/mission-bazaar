import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "mission-bazaar-kiosk-web",
    time: new Date().toISOString()
  });
}
