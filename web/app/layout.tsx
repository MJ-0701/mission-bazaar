import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "선교 바자회 주문",
  description: "선교 바자회 주문, 픽업, 운영 관리 시스템"
};

// 모바일 최적화 핵심: 이 export 없으면 모바일 브라우저가 데스크탑(980px)로 렌더 → 좌우 스크롤("PC화면처럼").
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
