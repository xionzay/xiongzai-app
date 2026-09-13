"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CosmicCanvas from "./CosmicCanvas";
import LaunchBackdrop from "./LaunchBackdrop";
import styles from "./official-redesign.module.css";

type IconName = "chat" | "game" | "paw" | "heart" | "search" | "spark" | "shield" | "record" | "support" | "rules" | "apple" | "android";

const services: Array<{ icon: IconName; number: string; title: string; copy: string; tone: string }> = [
  { icon: "search", number: "01", title: "发现合适的陪玩", copy: "从喜欢的游戏和服务需求出发，找到更适合自己的陪玩选择。", tone: "sky" },
  { icon: "chat", number: "02", title: "把需求说清楚", copy: "围绕游戏、时间和服务内容进行沟通，让选择更简单。", tone: "violet" },
  { icon: "spark", number: "03", title: "让认真创造价值", copy: "让服务者的时间、技能和每一次用心陪伴都能被看见。", tone: "coral" },
];

const journey: Array<{ icon: IconName; number: string; title: string; copy: string }> = [
  { icon: "search", number: "01", title: "发现", copy: "找到喜欢的游戏与陪玩服务" },
  { icon: "chat", number: "02", title: "沟通", copy: "确认时间、方式和服务内容" },
  { icon: "game", number: "03", title: "体验", copy: "在清楚约定中开始游戏陪伴" },
  { icon: "record", number: "04", title: "完成", copy: "保留记录并获得后续支持" },
];

const safeguards: Array<{ icon: IconName; title: string; copy: string; tone: string }> = [
  { icon: "shield", title: "安全保障", copy: "重要流程和信息清楚呈现，减少不必要的误解。", tone: "mint" },
  { icon: "record", title: "过程留痕", copy: "围绕服务形成明确记录，让每个阶段都更容易核对。", tone: "blue" },
  { icon: "rules", title: "规则透明", copy: "服务规则、用户规则和隐私政策提供独立可读入口。", tone: "purple" },
  { icon: "support", title: "支持入口", copy: "投诉、举报与客服支持入口集中展示，问题有处可反馈。", tone: "orange" },
];

const sectionIds = ["top", "about", "journey", "safeguards", "launch"];

// Preserve the complete 3D bears; the about badge uses the user's cutout artwork.
const bearArtwork = {
  hero: { src: "/assets/mascot-sapphire-hero-v2.webp", width: 952, height: 952 },
  about: { src: "/assets/about-shark-bear-user-v2.png", width: 256, height: 256 },
  launch: { src: "/assets/launch-bear-controller-wave-v1.webp", width: 1100, height: 1100 },
} as const;

const heroDecorIcons = [
  { name: "chat", src: "/assets/hero-icon-chat-q3d-v3.webp" },
  { name: "game", src: "/assets/hero-icon-game-q3d-v3.webp" },
  { name: "paw", src: "/assets/hero-icon-paw-q3d-v3.webp" },
  { name: "heart", src: "/assets/hero-icon-heart-q3d-v3.webp" },
  { name: "spark", src: "/assets/hero-icon-spark-q3d-v3.webp" },
] as const;

function BrandIcon({ name }: { name: IconName }) {
  if (name === "chat") return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 9h32v23H23L12 40v-8H8V9Z"/><circle cx="17" cy="21" r="2"/><circle cx="24" cy="21" r="2"/><circle cx="31" cy="21" r="2"/></svg>;
  if (name === "game") return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 17h20c6 0 10 6 8 12l-2 7c-1 4-6 5-9 2l-4-4h-6l-4 4c-3 3-8 2-9-2l-2-7c-2-6 2-12 8-12Z"/><path d="M15 25h8M19 21v8"/><circle cx="32" cy="24" r="2"/><circle cx="36" cy="29" r="2"/></svg>;
  if (name === "paw") return <svg viewBox="0 0 48 48" aria-hidden="true"><ellipse cx="24" cy="31" rx="10" ry="8"/><circle cx="11" cy="24" r="4"/><circle cx="18" cy="15" r="4"/><circle cx="30" cy="15" r="4"/><circle cx="37" cy="24" r="4"/></svg>;
  if (name === "heart") return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 40S8 31 8 19c0-8 10-11 16-3 6-8 16-5 16 3 0 12-16 21-16 21Z"/></svg>;
  if (name === "search") return <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="21" cy="21" r="12"/><path d="m30 30 10 10M21 15v12M15 21h12"/></svg>;
  if (name === "spark") return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5c2 11 8 17 19 19-11 2-17 8-19 19-2-11-8-17-19-19 11-2 17-8 19-19Z"/><path d="M39 6v8M35 10h8"/></svg>;
  if (name === "shield") return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5 40 12v12c0 10-6 17-16 21C14 41 8 34 8 24V12l16-7Z"/><path d="m16 24 6 6 11-12"/></svg>;
  if (name === "record") return <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="10" y="7" width="28" height="34" rx="8"/><path d="M17 18h14M17 25h14M17 32h9"/></svg>;
  if (name === "support") return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 25a15 15 0 0 1 30 0M9 25v9h6V23H9m30 2v9h-6V23h6M33 38c-2 3-5 4-9 4"/></svg>;
  if (name === "rules") return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M15 7h18l7 7v27H15V7Z"/><path d="M33 7v8h7M21 23h13M21 30h13M21 37h8"/></svg>;
  if (name === "apple") return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M30 11c0-4 3-7 7-8 0 4-2 7-7 8Z"/><path d="M38 27c0-6 5-8 5-8-3-5-8-5-10-5-4 0-7 3-9 3s-5-3-9-3C8 14 4 21 6 29c2 8 7 16 12 16 3 0 4-2 7-2s4 2 7 2c5 0 10-8 12-15-4-1-6-4-6-3Z"/></svg>;
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M15 10c-4 3-6 8-6 13v17h30V23c0-5-2-10-6-13H15Z"/><path d="m16 4 4 7m12-7-4 7M8 22v13m32-13v13M17 40v5m14-5v5"/><circle cx="18" cy="20" r="2"/><circle cx="30" cy="20" r="2"/></svg>;
}

function AmbientDots({ count = 9 }: { count?: number }) {
  return <div className={styles.ambientDots} aria-hidden="true">{Array.from({ length: count }, (_, index) => <i key={index} />)}</div>;
}

export default function OfficialWebsitePage() {
  const siteRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const [activeSection, setActiveSection] = useState(0);
  const [headerGlass, setHeaderGlass] = useState(false);

  useEffect(() => {
    const site = siteRef.current;
    if (!site) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const surfaces = Array.from(site.querySelectorAll<HTMLElement>("[data-section], footer"));
    const visible = new Set<Element>();
    const syncMotion = () => surfaces.forEach((surface) => {
      surface.dataset.motion = visible.has(surface) && !document.hidden && !motion.matches ? "running" : "paused";
    });
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
      syncMotion();
    }, { rootMargin: "80px" });
    surfaces.forEach((surface) => observer.observe(surface));
    syncMotion();
    document.addEventListener("visibilitychange", syncMotion);
    motion.addEventListener("change", syncMotion);

    // Proximity works even for decorations behind content or pointer-transparent layers.
    // Only the visible chapter is measured, at most once per animation frame.
    const selector = [
      `.${styles.heroToken}`, `.${styles.decorStar}`, `.${styles.planetPrimary}`, `.${styles.planetDistant}`,
      `.${styles.ambientDots} i`, `.${styles.mascotOrbit} i`, `.${styles.aboutTag} svg`,
      `.${styles.serviceGrid} header span`, `.${styles.serviceGrid} article > i`,
      `.${styles.journeyTrack} article > div > span`, `.${styles.journeyStatement} > i`,
      `.${styles.safeguardGrid} article > span`, `.${styles.downloadCards} button > i`,
      `.${styles.downloadCards} > p > span`, `.${styles.brand} img`, `.${styles.footerBrand} img`,
      `.${styles.eyebrow} > span`, `.${styles.heroActions} button > b`, `.${styles.heroActions} > span i`,
      `.${styles.headerStatus} i`, `.${styles.dotNav} button span`, `.${styles.scrollCue} i`,
      "[data-launch-decoration]",
    ].join(",");
    const decorations = Array.from(site.querySelectorAll<HTMLElement>(selector)).map((node) => {
      node.dataset.reactive = "true";
      return { node, surface: node.closest("[data-section], footer") };
    });
    let pointer: { x: number; y: number; surface: Element | null } | null = null;
    let frame = 0;
    const clearHover = () => decorations.forEach(({ node }) => { delete node.dataset.hovered; });
    const updateHover = () => {
      frame = 0;
      if (!pointer || motion.matches || document.hidden) { clearHover(); return; }
      // Complete all layout reads before writes to avoid forced layout per icon.
      const hits = decorations.map(({ node, surface }) => {
        if (surface && surface !== pointer!.surface) return false;
        const bounds = node.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return false;
        const halo = Math.max(bounds.width, bounds.height) < 14 ? 12 : 0;
        return pointer!.x >= bounds.left - halo && pointer!.x <= bounds.right + halo
          && pointer!.y >= bounds.top - halo && pointer!.y <= bounds.bottom + halo;
      });
      decorations.forEach(({ node }, index) => {
        if (hits[index]) node.dataset.hovered = "true";
        else delete node.dataset.hovered;
      });
    };
    const queueHover = () => { if (!frame) frame = requestAnimationFrame(updateHover); };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer = { x: event.clientX, y: event.clientY, surface: (event.target as Element).closest("[data-section], footer") };
      queueHover();
    };
    const onLeave = () => { pointer = null; clearHover(); };
    const onMotionChange = () => { if (motion.matches) onLeave(); };
    site.addEventListener("pointermove", onPointerMove, { passive: true });
    site.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onLeave, { passive: true });
    window.addEventListener("blur", onLeave);
    motion.addEventListener("change", onMotionChange);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      site.removeEventListener("pointermove", onPointerMove);
      site.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onLeave);
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("visibilitychange", syncMotion);
      motion.removeEventListener("change", syncMotion);
      motion.removeEventListener("change", onMotionChange);
    };
  }, []);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const resetPointer = () => {
      hero.style.setProperty("--pointer-x", "0");
      hero.style.setProperty("--pointer-y", "0");
    };
    const onPointerMove = (event: PointerEvent) => {
      if (motion.matches || event.pointerType === "touch") return;
      const bounds = hero.getBoundingClientRect();
      hero.style.setProperty("--pointer-x", (((event.clientX - bounds.left) / bounds.width) - 0.5).toFixed(3));
      hero.style.setProperty("--pointer-y", (((event.clientY - bounds.top) / bounds.height) - 0.5).toFixed(3));
    };
    hero.addEventListener("pointermove", onPointerMove, { passive: true });
    hero.addEventListener("pointerleave", resetPointer);
    motion.addEventListener("change", resetPointer);
    return () => {
      hero.removeEventListener("pointermove", onPointerMove);
      hero.removeEventListener("pointerleave", resetPointer);
      motion.removeEventListener("change", resetPointer);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setHeaderGlass(window.scrollY > 20);
      heroRef.current?.style.setProperty("--hero-scroll", `${Math.min(window.scrollY, window.innerHeight)}px`);
    };
    const sectionObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) setActiveSection(Number((entry.target as HTMLElement).dataset.section));
    }), { rootMargin: "-38% 0px -46%", threshold: 0 });
    const revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) (entry.target as HTMLElement).dataset.visible = "true";
    }), { threshold: 0.12 });
    document.querySelectorAll<HTMLElement>("[data-section]").forEach((section) => sectionObserver.observe(section));
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => revealObserver.observe(element));
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); sectionObserver.disconnect(); revealObserver.disconnect(); };
  }, []);

  const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });

  return (
    <main className={styles.site} ref={siteRef}>
      <header className={`${styles.header} ${headerGlass ? styles.headerGlass : ""}`}>
        <button className={styles.brand} type="button" onClick={() => goTo("top")} aria-label="返回熊崽电竞官网首页"><Image src="/assets/brand-app-icon-user-v1.webp" width={256} height={256} sizes="54px" alt="熊崽电竞软件图标" priority unoptimized /><span><strong>熊崽电竞</strong><small>XIONGZAI ESPORTS</small></span></button>
        <nav aria-label="官网主导航"><button type="button" onClick={() => goTo("top")}>首页</button><button type="button" onClick={() => goTo("about")}>关于产品</button><button type="button" onClick={() => goTo("journey")}>服务体验</button><button type="button" onClick={() => goTo("safeguards")}>平台保障</button></nav>
        <button className={styles.headerStatus} type="button" disabled aria-disabled="true"><i /> 即将上线</button>
      </header>

      <aside className={styles.dotNav} aria-label="页面章节导航">{sectionIds.map((id, index) => <button className={activeSection === index ? styles.dotActive : ""} type="button" aria-label={`前往第 ${index + 1} 个章节`} onClick={() => goTo(id)} key={id}><span /></button>)}</aside>

      <section className={styles.hero} id="top" data-section="0" ref={heroRef}>
        <CosmicCanvas className={styles.heroCanvas} variant="hero" density={0.72} transparent /><div className={styles.heroAurora} aria-hidden="true" /><div className={styles.cosmicBackdrop} aria-hidden="true"><i className={styles.nebulaCyan} /><i className={styles.nebulaViolet} /><Image className={styles.planetPrimary} src="/assets/hero-planet-3d-v1.png" width={900} height={757} sizes="(max-width: 700px) 150px, 19vw" alt="" priority /><Image className={styles.planetDistant} src="/assets/hero-planet-3d-v1.png" width={900} height={757} sizes="90px" alt="" /></div><AmbientDots count={12} />
        <div className={styles.heroInner}>
          <div className={styles.heroCopy} data-reveal><p className={styles.eyebrow}><span>✦</span> 熊崽电竞 · 品牌使命</p><h1><span>让每个人</span><em>都能创造价值</em></h1><p className={styles.heroLead}>用游戏连接热爱，用认真回应每一次陪伴。<br />让玩家更容易找到合适的陪玩服务，也让每一份时间与技能被看见。</p><div className={styles.heroActions}><button type="button" onClick={() => goTo("about")}>探索熊崽电竞 <b>↗</b></button><span><i /> Apple 与 Android 即将上线</span></div></div>
          <div className={styles.mascotScene} aria-hidden="true"><div className={styles.mascotOrbit}><i /><i /><i /></div><div className={styles.portal} /><Image className={styles.mascot} {...bearArtwork.hero} sizes="(max-width: 700px) 82vw, (max-width: 1100px) 45.3vw, 525px" quality={92} alt="" priority />{heroDecorIcons.map(({ name, src }) => <span className={`${styles.heroToken} ${styles[`token${name[0].toUpperCase()}${name.slice(1)}`]}`} key={name}><Image src={src} width={1024} height={1024} sizes="(max-width: 700px) 59px, 82px" quality={92} alt="" /></span>)}<Image className={`${styles.decorStar} ${styles.starOne}`} src="/assets/hero-star-gold-q3d-v3.webp" width={1024} height={1024} sizes="52px" quality={92} alt="" /><Image className={`${styles.decorStar} ${styles.starTwo}`} src="/assets/hero-star-pink-q3d-v3.webp" width={1024} height={1024} sizes="62px" quality={92} alt="" /><Image className={`${styles.decorStar} ${styles.starThree}`} src="/assets/hero-star-cyan-q3d-v3.webp" width={1024} height={1024} sizes="44px" quality={92} alt="" /></div>
        </div>
        <button className={styles.scrollCue} type="button" aria-label="继续浏览" onClick={() => goTo("about")}><span>向下探索</span><i>↓</i></button>
      </section>

      <section className={styles.about} id="about" data-section="1"><CosmicCanvas className={styles.chapterCanvas} variant="violet" density={0.44} transparent /><div className={styles.chapterAtmosphere} aria-hidden="true" /><AmbientDots count={8} /><div className={styles.aboutGlow} aria-hidden="true" /><div className={styles.sectionInner}>
        <header className={`${styles.sectionHeading} ${styles.aboutHeading}`} data-reveal><p>WHAT IS XIONGZAI</p><h2>陪玩，不只是一起游戏</h2><span>熊崽电竞是一个以游戏陪伴服务为核心的平台，帮助用户发现、沟通并完成服务，也让服务者通过时间、技能与认真陪伴创造价值。</span></header>
        <div className={styles.aboutStage} data-reveal><div className={styles.aboutBrand}><span className={styles.aboutHalo} aria-hidden="true" /><Image {...bearArtwork.about} sizes="92px" alt="戴着鲨鱼帽和蓝色护目镜的卡通熊崽" /><strong>连接热爱</strong><small>让每一次陪伴都有回应</small></div><div className={styles.aboutOrbit} aria-hidden="true"><i /><i /></div><span className={`${styles.aboutTag} ${styles.tagA}`}><BrandIcon name="game" />游戏陪伴</span><span className={`${styles.aboutTag} ${styles.tagB}`}><BrandIcon name="chat" />清楚沟通</span><span className={`${styles.aboutTag} ${styles.tagC}`}><BrandIcon name="heart" />认真回应</span><span className={`${styles.aboutTag} ${styles.tagD}`}><BrandIcon name="spark" />创造价值</span></div>
        <div className={styles.serviceGrid}>{services.map((item) => <article className={styles[item.tone]} data-reveal key={item.number}><header><b>{item.number}</b><span><BrandIcon name={item.icon} /></span></header><h3>{item.title}</h3><p>{item.copy}</p><i aria-hidden="true">↗</i></article>)}</div>
      </div></section>

      <section className={styles.journey} id="journey" data-section="2"><CosmicCanvas className={styles.chapterCanvas} variant="journey" density={0.44} transparent /><div className={styles.chapterAtmosphere} aria-hidden="true" /><AmbientDots count={10} /><div className={styles.journeyRibbon} aria-hidden="true" /><div className={styles.sectionInner}>
        <header className={`${styles.sectionHeading} ${styles.journeyHeading}`} data-reveal><p>HOW IT WORKS</p><h2>从发现，到完成</h2><span>用四个清楚的阶段，完成一次自然、安心的游戏陪伴体验。</span></header>
        <div className={styles.journeyTrack} data-reveal>{journey.map((item) => <article key={item.number}><div><span><BrandIcon name={item.icon} /></span><b>{item.number}</b></div><h3>{item.title}</h3><p>{item.copy}</p></article>)}</div>
        <div className={styles.journeyStatement} data-reveal><span>PLAY</span><strong>找到同频的人，<br />让游戏更有温度。</strong><i><BrandIcon name="game" /></i></div>
      </div></section>

      <section className={styles.safeguards} id="safeguards" data-section="3"><CosmicCanvas className={styles.chapterCanvas} variant="light" density={0.44} transparent /><div className={styles.chapterAtmosphere} aria-hidden="true" /><AmbientDots count={8} /><div className={styles.safeguardWave} aria-hidden="true" /><div className={styles.sectionInner}>
        <header className={`${styles.sectionHeading} ${styles.safeHeading}`} data-reveal><p>PLATFORM SUPPORT</p><h2>每一次体验，都认真守护</h2><span>不夸大承诺，只把流程、规则和支持入口做得更清楚。</span></header>
        <div className={styles.safeguardGrid}>{safeguards.map((item) => <article className={styles[item.tone]} data-reveal key={item.title}><span><BrandIcon name={item.icon} /></span><h3>{item.title}</h3><p>{item.copy}</p></article>)}</div>
        <div className={styles.companyNote} data-reveal><Image src="/assets/xiongzai-logo.png" width={1519} height={1164} alt="熊崽电竞" /><div><small>品牌与产品主体</small><strong>重庆熊崽网络科技有限公司</strong><p>官网仅展示已确认的公司与产品信息；备案、资质和应用商店信息将在取得并核实后公示。</p></div></div>
      </div></section>

      <section className={styles.launch} id="launch" data-section="4"><LaunchBackdrop /><div className={styles.launchInner}>
        <div className={styles.launchCopy} data-reveal><p>COMING SOON</p><h2>准备好，<br />和熊崽一起出发</h2><span>Apple 与 Android 版本正在准备中。当前不提供下载地址、商店链接或安装包。</span></div>
        <div className={styles.downloadCards} data-reveal><button type="button" disabled aria-disabled="true"><i><BrandIcon name="apple" /></i><span><small>iPhone / iPad</small><b>Apple 版</b></span><em>即将上线</em></button><button type="button" disabled aria-disabled="true"><i><BrandIcon name="android" /></i><span><small>Android</small><b>Android 版</b></span><em>即将上线</em></button><p><span /> 正式开放后再替换为真实下载地址</p></div>
        <div className={styles.launchScene} data-launch-bear><Image className={styles.launchMascot} {...bearArtwork.launch} sizes="(max-width: 700px) 268px, 415px" alt="穿浅蓝鲨鱼卫衣、向前展示蓝色掌垫、另一只手拿手柄的眨眼熊崽" unoptimized /></div>
      </div></section>

      <footer className={styles.footer}><div className={styles.footerBrand}><Image {...bearArtwork.hero} sizes="54px" alt="" /><span><strong>熊崽电竞</strong><small>让每个人都能创造价值</small></span></div><nav aria-label="公司与政策入口"><Link href="/info/about">公司介绍</Link><Link href="/info/terms">服务协议</Link><Link href="/info/privacy">隐私政策</Link><Link href="/info/rules">用户规则</Link><Link href="/info/minors">未成年人保护</Link><Link href="/info/complaints">投诉与举报</Link><Link href="/info/support">客服支持</Link></nav><div className={styles.footerMeta}><span>© 2026 重庆熊崽网络科技有限公司</span><span>ICP 备案及 App 备案信息：取得后公示</span></div></footer>
    </main>
  );
}
