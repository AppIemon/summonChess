import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ['100', '300', '400', '500', '700', '900'],
  variable: "--font-noto-sans-kr",
});

export const metadata: Metadata = {
  title: "소환 체스",
  description: "전략적 소환을 통한 새로운 체스 게임",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={notoSansKr.className}>
        {children}
      </body>
    </html>
  );
}
