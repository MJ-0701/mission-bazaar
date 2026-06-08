import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error || "요청을 처리할 수 없습니다.");
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}
