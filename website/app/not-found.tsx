import Image from "next/image";
import Link from "next/link";

export default function NotFoundPage() {
  return <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24, color: "white", textAlign: "center", background: "radial-gradient(circle at 50% 42%, #315ef2, #121292 48%, #08075d)" }}>
    <div><Image src="/assets/xiongzai-icon.png" width={120} height={120} alt="熊崽" style={{ borderRadius: 34, boxShadow: "0 0 60px rgba(103,211,255,.45)" }} /><p style={{ margin: "25px 0 4px", color: "#80e6ff", fontWeight: 900, letterSpacing: ".18em" }}>404</p><h1 style={{ margin: 0, fontSize: "clamp(36px,7vw,68px)" }}>熊崽暂时找不到这里</h1><p style={{ color: "rgba(255,255,255,.68)" }}>这个页面可能已经移动，返回官网继续探索吧。</p><Link href="/" style={{ display: "inline-block", marginTop: 18, padding: "14px 20px", border: "1px solid rgba(255,255,255,.3)", borderRadius: 15, color: "white", background: "rgba(255,255,255,.1)", textDecoration: "none", fontWeight: 800 }}>返回熊崽电竞官网</Link></div>
  </main>;
}


