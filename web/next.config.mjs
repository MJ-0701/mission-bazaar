/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // HTML/페이지/API는 항상 최신 — 캐시된 옛 HTML이 삭제된 청크를 참조해
        // JS가 깨지는(버튼 먹통) 문제 방지. /_next/static 해시 자산은 제외(불변·장기캐시 유지).
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }]
      }
    ];
  }
};

export default nextConfig;
