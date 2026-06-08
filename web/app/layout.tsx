import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "선교 바자회 주문",
  description: "선교 바자회 주문, 픽업, 운영 관리 시스템"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
