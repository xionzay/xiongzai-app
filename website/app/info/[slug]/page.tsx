import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "../info.module.css";

const pages = {
  about: { title: "公司介绍", label: "ABOUT", body: ["重庆熊崽网络科技有限公司是熊崽电竞产品与品牌主体。", "熊崽电竞围绕游戏服务发现、陪玩主页、服务选择、订单记录和平台支持构建产品体验。当前产品处于测试与上线准备阶段。"] },
  terms: { title: "服务协议", label: "TERMS", body: ["熊崽电竞正式服务协议尚未发布。", "本页面当前仅用于官网结构和信息公示准备，不构成已经生效的用户协议。正式版本将在完成审核后于本页面公示。"] },
  privacy: { title: "隐私政策", label: "PRIVACY", body: ["熊崽电竞正式隐私政策尚未发布。", "正式版本将根据产品实际收集、使用、存储和保护的信息范围编制，并在完成审核后于本页面公示；当前不展示虚构的数据处理说明。"] },
  rules: { title: "用户规则", label: "RULES", body: ["熊崽电竞用户规则正在结合真实产品流程整理。", "规则将覆盖平台内沟通、服务发布、交易履约、评价、售后与违规处置等实际场景，完成审核后正式公示。"] },
  minors: { title: "未成年人保护", label: "MINORS", body: ["熊崽电竞未成年人保护说明尚未正式发布。", "正式内容将结合产品开放范围、身份核验、消费限制和内容治理措施编制，审核完成前不使用未经确认的承诺或资质表述。"] },
  complaints: { title: "投诉与举报", label: "REPORT", body: ["投诉与举报渠道正在准备中。", "正式上线前将公示经过确认的受理方式、处理范围和必要说明。当前没有已核实的电话、邮箱或外部地址，因此不提供虚构联系方式。"] },
  support: { title: "客服支持", label: "SUPPORT", body: ["熊崽电竞客服支持渠道尚未正式开放。", "正式上线前将公示经过确认的客服入口和服务说明。产品测试期间，本页面仅说明真实状态。"] },
} as const;

type PageKey = keyof typeof pages;

export function generateStaticParams() { return Object.keys(pages).map((slug) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = pages[slug as PageKey];
  if (!page) return {};
  return { title: `${page.title} · 熊崽电竞`, description: page.body[0] };
}

export default async function InformationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pages[slug as PageKey];
  if (!page) notFound();
  return <main className={styles.page}>
    <div className={styles.stars} aria-hidden="true" />
    <header><Link href="/"><Image src="/assets/xiongzai-icon.png" width={54} height={54} alt="" /><span><b>熊崽电竞</b><small>XIONGZAI ESPORTS</small></span></Link><Link href="/">返回官网</Link></header>
    <article>
      <p>{page.label}</p><h1>{page.title}</h1>
      <div>{page.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
      <aside><b>信息原则</b><span>只公示已经确认的真实信息；备案、资质、联系方式和正式文本将在取得或审核完成后更新。</span></aside>
    </article>
    <footer>© 2026 重庆熊崽网络科技有限公司</footer>
  </main>;
}


