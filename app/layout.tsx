import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./chat-redesign.css";
import "./chat-stickers/stickers.css";
import "./user-theme.css";
import "./commerce-layout.css";
import "./trade-v31/trade.css";
import "./purchase-spec-sheet.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fff9ee",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  const title = "熊崽电竞 · 和平精英陪玩交易";
  const description = "熊崽电竞是面向和平精英玩家的买家端与陪玩中心一体化 C2C 游戏服务交易平台。";
  return {
    title,
    description,
    icons: { icon: "/assets/xiongzai-icon.png", shortcut: "/assets/xiongzai-icon.png" },
    openGraph: { title, description, images: [{ url: imageUrl, width: 1536, height: 1024, alt: "熊崽电竞和平精英陪玩交易" }] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
