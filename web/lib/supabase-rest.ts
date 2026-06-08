const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && !SUPABASE_URL.includes("your-project"));
}

export async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return null as T;
  }
  return response.json() as Promise<T>;
}

export function eq(value: string) {
  return `eq.${encodeURIComponent(value)}`;
}

export function inList(values: string[]) {
  return `in.(${values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(",")})`;
}
