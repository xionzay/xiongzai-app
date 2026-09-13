import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "熊崽电竞官网 · 让每个人都能创造价值";
const description = "熊崽电竞是重庆熊崽网络科技有限公司旗下的游戏陪伴服务产品，致力于连接玩家与陪玩服务，让每个人都能创造价值。";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#101dc5",
};

export const metadata: Metadata = {
  title,
  description,
  keywords: ["熊崽电竞", "重庆熊崽网络科技有限公司", "游戏服务", "陪玩服务", "和平精英陪玩"],
  icons: { icon: "/assets/xiongzai-icon.png", shortcut: "/assets/xiongzai-icon.png", apple: "/assets/xiongzai-icon.png" },
  openGraph: { title, description, type: "website", locale: "zh_CN", siteName: "熊崽电竞", images: [{ url: "/og.png", width: 1536, height: 1024, alt: "熊崽电竞，让每个人都能创造价值" }] },
  twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "重庆熊崽网络科技有限公司", brand: { "@type": "Brand", name: "熊崽电竞" } },
      { "@type": "SoftwareApplication", name: "熊崽电竞", applicationCategory: "GameApplication", operatingSystem: "iOS, Android", description },
    ],
  };
  return <html lang="zh-CN"><body>{children}<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} /></body></html>;
}

