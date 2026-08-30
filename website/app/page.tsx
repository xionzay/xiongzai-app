"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./website.module.css";

type Preview = { screen: "home" | "companion" | "service" | "orders"; title: string };

const journey: Preview[] = [
  { screen: "home", title: "发现服务" },
  { screen: "companion", title: "了解陪玩" },
  { screen: "service", title: "选择服务" },
  { screen: "orders", title: "完成记录" },
];

const protections = [
  { icon: "/assets/icon-shield.png", title: "安全保障", copy: "平台内沟通与交易，关键状态完整记录。", tone: "mint" },
  { icon: "/assets/icon-message.png", title: "专属支持", copy: "客服、投诉与售后入口集中呈现。", tone: "blue" },
  { icon: "/assets/icon-service.png", title: "规则透明", copy: "服务规格、预约流程与平台规则清晰可见。", tone: "violet" },
  { icon: "/assets/icon-favorite.png", title: "用心陪伴", copy: "从发现服务到完成记录，每一步都有回应。", tone: "coral" },
];

const chapterNames = ["使命", "产品体验", "支持与保障", "产品下载"];

export default function OfficialWebsitePage() {
  const heroRef = useRef<HTMLElement>(null);
  const [mascotAction, setMascotAction] = useState(0);
  const [chapter, setChapter] = useState(1);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const move = (event: PointerEvent) => {
      const bounds = hero.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;
      hero.style.setProperty("--pointer-x", x.toFixed(3));
      hero.style.setProperty("--pointer-y", y.toFixed(3));
    };
    hero.addEventListener("pointermove", move, { passive: true });
    return () => hero.removeEventListener("pointermove", move);
  }, []);

  useEffect(() => {
    const readyTimer = window.setTimeout(() => setReady(true), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650);
    const onScroll = () => {
      setScrolled(window.scrollY > 28);
      document.documentElement.style.setProperty("--site-scroll", `${window.scrollY}px`);
    };
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) (entry.target as HTMLElement).dataset.visible = "true";
      });
    }, { threshold: 0.14 });
    const chapterObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setChapter(Number((entry.target as HTMLElement).dataset.chapter ?? 1));
      });
    }, { rootMargin: "-34% 0px -52% 0px", threshold: 0 });
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => revealObserver.observe(element));
    document.querySelectorAll<HTMLElement>("[data-chapter]").forEach((element) => chapterObserver.observe(element));
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.clearTimeout(readyTimer);
      window.removeEventListener("scroll", onScroll);
      revealObserver.disconnect();
      chapterObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreview(null);
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const goDownload = () => {
    setMenuOpen(false);
    document.querySelector("#download")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className={styles.site}>
      <div className={`${styles.loader} ${ready ? styles.loaderHidden : ""}`} aria-hidden="true">
        <Image src="/assets/xiongzai-icon.png" width={86} height={86} alt="" priority />
        <span><i /></span>
        <small>正在进入熊崽宇宙</small>
      </div>

      <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ""}`}>
        <Link className={styles.brand} href="#top" aria-label="返回熊崽电竞官网首页">
          <Image src="/assets/xiongzai-icon.png" width={52} height={52} alt="" priority />
          <span><b>熊崽电竞</b><small>XIONGZAI ESPORTS</small></span>
        </Link>
        <nav className={menuOpen ? styles.navOpen : ""} aria-label="官网主导航">
          <Link href="#top" onClick={() => setMenuOpen(false)}>首页</Link>
          <Link href="#experience" onClick={() => setMenuOpen(false)}>产品体验</Link>
          <Link href="#protection" onClick={() => setMenuOpen(false)}>平台保障</Link>
          <button type="button" onClick={goDownload}>下载 App</button>
        </nav>
        <button className={styles.navDownload} type="button" onClick={goDownload}>下载 App</button>
        <button className={`${styles.menuButton} ${menuOpen ? styles.menuButtonOpen : ""}`} type="button" aria-label={menuOpen ? "关闭导航菜单" : "打开导航菜单"} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><i /><i /></button>
      </header>

      <aside className={styles.storyRail} aria-label={`当前章节：${chapterNames[chapter - 1]}`}>
        <b>{String(chapter).padStart(2, "0")}</b>
        <span><i style={{ height: `${chapter * 25}%` }} /></span>
        <small>{chapterNames[chapter - 1]}</small>
      </aside>

      <section className={styles.hero} id="top" ref={heroRef} data-chapter="1">
        <div className={styles.aurora} aria-hidden="true" />
        <div className={styles.starField} aria-hidden="true">{Array.from({ length: 22 }, (_, index) => <i key={index} />)}</div>
        <span className={styles.shootingStar} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}><span>★</span> 我们的使命</p>
            <h1><span>让每个人</span><span>都能创造价值</span></h1>
            <p className={styles.description}>在熊崽电竞，每一次交流与陪伴<br />都能被看见、被尊重、被回报。</p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href="#experience">了解产品 <span>→</span></Link>
              <button className={styles.secondaryButton} type="button" onClick={goDownload}>下载 App</button>
            </div>
          </div>
          <div className={styles.mascotUniverse}>
            <span className={styles.planet} aria-hidden="true" /><span className={styles.orbitBack} aria-hidden="true" /><span className={styles.orbitFront} aria-hidden="true" />
            <span className={styles.chatBubble} aria-hidden="true">•••</span><span className={styles.gameBubble} aria-hidden="true">✦</span>
            <button className={`${styles.mascotButton} ${mascotAction ? styles.mascotReact : ""}`} type="button" aria-label="和熊崽打招呼" onClick={() => setMascotAction((value) => value + 1)} onAnimationEnd={() => setMascotAction(0)}>
              <span className={styles.mascotGlow} aria-hidden="true" />
              <Image src="/assets/xiongzai-logo.png" width={760} height={570} alt="挥手欢迎的熊崽" priority />
            </button>
            <span className={styles.portal} aria-hidden="true" />
          </div>
        </div>
        <Link className={styles.scrollHint} href="#experience" aria-label="继续浏览产品体验"><span>⌄</span></Link>
        <div className={styles.heroCurve} aria-hidden="true" />
      </section>

      <section className={styles.experience} id="experience" data-chapter="2">
        <div className={styles.colorOrbOne} aria-hidden="true" /><div className={styles.colorOrbTwo} aria-hidden="true" />
        <div className={styles.sectionHeading} data-reveal>
          <p><span>▣</span> 真实产品体验</p>
          <h2>从发现服务，到完成记录</h2>
          <small>使用熊崽电竞真实用户端组件，清晰呈现完整体验路径。</small>
        </div>

        <div className={styles.phoneStage} data-reveal>
          {journey.filter((_, index) => index !== 2).map((item, index) => (
            <article className={`${styles.phoneStory} ${styles[`phone${index + 1}`]}`} key={item.screen}>
              <div className={styles.phoneLabel}><b>0{index + 1}</b><span>{item.title}</span></div>
              <button className={styles.phoneFrame} type="button" onClick={() => setPreview(item)} aria-label={`放大查看${item.title}`}>
                <span className={styles.phoneSpeaker} aria-hidden="true" />
                <span className={styles.phoneGlass} aria-hidden="true" />
                <iframe src={`/website-ui-preview?screen=${item.screen}`} title={`${item.title}用户端界面`} loading="lazy" tabIndex={-1} />
              </button>
            </article>
          ))}
          <Image className={styles.walkingMascot} src="/assets/xiongzai-icon.png" width={90} height={90} alt="引导体验流程的熊崽" />
        </div>

        <div className={styles.journeyTrack} data-reveal aria-label="产品使用流程">
          {journey.map((item, index) => (
            <button type="button" key={item.screen} onClick={() => setPreview(item)}>
              <b>0{index + 1}</b><span>{item.title}</span><i>查看界面 ↗</i>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.protection} id="protection" data-chapter="3">
        <div className={styles.protectionWave} aria-hidden="true" />
        <div className={styles.assistant} data-reveal>
          <button type="button" onClick={() => setNotice("熊崽小助手将在正式上线后提供客服与问题反馈入口") } aria-label="打开熊崽小助手">
            <Image src="/assets/xiongzai-icon.png" width={104} height={104} alt="熊崽小助手" />
            <span><b>熊崽小助手</b><small>有问题？点我看看</small></span>
          </button>
        </div>
        <div className={styles.sectionHeading} data-reveal>
          <p className={styles.greenKicker}><span>◇</span> 用户支持</p>
          <h2>贴心守护每一次体验</h2>
          <small>产品流程、平台规则与支持入口清晰呈现，陪你安心前行。</small>
        </div>
        <div className={styles.protectionGrid} data-reveal>
          {protections.map((item) => (
            <article key={item.title} className={styles[item.tone]}>
              <span><Image src={item.icon} width={72} height={72} alt="" /></span>
              <h3>{item.title}</h3><p>{item.copy}</p>
            </article>
          ))}
        </div>
        <div className={styles.companyStrip} data-reveal>
          <div><Image src="/assets/xiongzai-icon.png" width={70} height={70} alt="" /><span><b>重庆熊崽网络科技有限公司</b><small>熊崽电竞产品与品牌主体</small></span></div>
          <p>我们只展示已经确认的真实信息；备案、资质与联系信息将在取得并核实后正式公示。</p>
        </div>
      </section>

      <section className={styles.download} id="download" data-chapter="4">
        <div className={styles.downloadStars} aria-hidden="true" />
        <div className={styles.downloadInner}>
          <div className={styles.downloadCopy} data-reveal>
            <p>DOWNLOAD</p><h2>准备好，和熊崽一起出发</h2>
            <span>产品目前处于测试与上线准备阶段，苹果和安卓版本暂不提供下载地址。</span>
            <button type="button" onClick={() => setNotice("用户端是独立产品项目，官网不会嵌入或替换用户端入口")}>用户端独立开发中 <i>↗</i></button>
          </div>
          <div className={styles.platformGrid} data-reveal>
            <article>
              <div className={styles.appleMark} aria-hidden="true">●</div>
              <span><small>iPhone / iPad</small><b>Apple 版</b></span>
              <dl><div><dt>当前状态</dt><dd>暂未开放下载</dd></div><div><dt>系统要求</dt><dd>正式发布前公布</dd></div></dl>
              <button type="button" onClick={() => setNotice("Apple 版暂未开放下载，正式上线后将替换为真实商店地址")}>暂未开放下载</button>
            </article>
            <article>
              <div className={styles.androidMark} aria-hidden="true">◆</div>
              <span><small>Android</small><b>Android 版</b></span>
              <dl><div><dt>当前版本</dt><dd>测试版 0.1.0</dd></div><div><dt>更新说明</dt><dd>产品与渠道准备中</dd></div></dl>
              <button type="button" onClick={() => setNotice("Android 版暂未开放下载，当前不提供安装包地址")}>暂未开放下载</button>
            </article>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerMain}>
          <Link className={styles.brand} href="#top"><Image src="/assets/xiongzai-icon.png" width={50} height={50} alt="" /><span><b>熊崽电竞</b><small>XIONGZAI ESPORTS</small></span></Link>
          <p>让每个人都能创造价值。</p>
          <nav aria-label="公司与政策入口">
            {[{ label: "公司介绍", href: "/info/about" }, { label: "服务协议", href: "/info/terms" }, { label: "隐私政策", href: "/info/privacy" }, { label: "用户规则", href: "/info/rules" }, { label: "未成年人保护", href: "/info/minors" }, { label: "投诉与举报", href: "/info/complaints" }, { label: "客服支持", href: "/info/support" }].map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
          </nav>
        </div>
        <div className={styles.footerBottom}><span>© 2026 重庆熊崽网络科技有限公司</span><span>ICP备案及 App 备案信息：取得后公示</span></div>
      </footer>

      {preview ? <div className={styles.previewModal} role="dialog" aria-modal="true" aria-label={`${preview.title}界面预览`} onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}>
        <div className={styles.previewDialog}>
          <header><span><small>真实用户端 UI</small><b>{preview.title}</b></span><button type="button" aria-label="关闭预览" onClick={() => setPreview(null)}>×</button></header>
          <div className={styles.modalPhone}><iframe src={`/website-ui-preview?screen=${preview.screen}`} title={`${preview.title}放大预览`} /></div>
          <p>按 Esc 或点击空白区域关闭</p>
        </div>
      </div> : null}

      <div className={`${styles.toast} ${notice ? styles.toastVisible : ""}`} role="status" aria-live="polite">
        <Image src="/assets/xiongzai-icon.png" width={46} height={46} alt="" /><span><b>熊崽电竞</b><small>{notice}</small></span><button type="button" aria-label="关闭提示" onClick={() => setNotice("")}>×</button>
      </div>
    </main>
  );
}

