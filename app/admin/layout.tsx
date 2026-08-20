import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "管理后台 · 熊崽电竞",
  description: "熊崽电竞和平精英 C2C 游戏陪玩交易平台管理后台。",
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
