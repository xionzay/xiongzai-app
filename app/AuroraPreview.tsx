"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Visual-only shell. Switching themes never remounts the page or clears a draft. */
export function AuroraPreview({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"aurora" | "classic">("aurora");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = root.current;
    if (!host || theme !== "aurora") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    let screen: Element | null = null;
    let mode = "";
    let frame = 0;
    const syncVisibility = () => {
      host.dataset.motion = document.hidden || reduced.matches ? "paused" : "running";
      if (document.hidden || reduced.matches) {
        animations.forEach((animation) => animation.cancel());
        animations.clear();
      }
    };
    const revealScreen = () => {
      const next = host.querySelector(".phone-shell > .app-screen");
      const nextMode = next?.querySelector('.home-mode-tabs [aria-current="page"]')?.textContent ?? "";
      if (next === screen && mode === nextMode) return;
      animations.forEach((animation) => animation.cancel());
      animations.clear();
      screen = next;
      mode = nextMode;
      host.style.setProperty("--aurora-scroll", "0px");
      if (!next || reduced.matches || document.hidden) return;
      // Only animate content; transformed screen wrappers would trap fixed docks.
      const targets = Array.from(next.children).filter((element) =>
        !element.matches(".status-bar, .bottom-nav, .sticky-actions, .checkout-bar, .chat-compose-dock, .chat-topbar"),
      ).slice(0, 9);
      const tokens = getComputedStyle(host);
      const duration = Number.parseFloat(tokens.getPropertyValue("--aurora-enter-ms")) || 460;
      const stagger = Number.parseFloat(tokens.getPropertyValue("--aurora-stagger-ms")) || 48;
      targets.forEach((element, index) => {
        const animation = element.animate(
          [{ opacity: 0, transform: "translateY(20px) scale(.97)" }, { opacity: 1, transform: "translateY(0) scale(1)" }],
          { duration, delay: Math.min(index, 6) * stagger, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" },
        );
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      });
    };
    const onScroll = (event: Event) => {
      if (reduced.matches || document.hidden || !(event.target instanceof Element) || !event.target.matches(".app-screen")) return;
      const offset = Math.min(event.target.scrollTop * .035, 24);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => host.style.setProperty("--aurora-scroll", `${offset}px`));
    };
    const observer = new MutationObserver(revealScreen);
    const phone = host.querySelector(".phone-shell");
    if (phone) observer.observe(phone, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current"] });
    syncVisibility();
    revealScreen();
    host.addEventListener("scroll", onScroll, true);
    document.addEventListener("visibilitychange", syncVisibility);
    reduced.addEventListener("change", syncVisibility);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      animations.forEach((animation) => animation.cancel());
      host.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("visibilitychange", syncVisibility);
      reduced.removeEventListener("change", syncVisibility);
      host.style.removeProperty("--aurora-scroll");
    };
  }, [theme]);

  return <div ref={root} className={`aurora-preview ${theme === "aurora" ? "aurora-ui" : ""}`}>
    <div className="aurora-theme-switch" role="group" aria-label="用户端视觉对比">
      <span>视觉预览</span>
      <button type="button" aria-pressed={theme === "classic"} onClick={() => setTheme("classic")}>原版</button>
      <button type="button" aria-pressed={theme === "aurora"} onClick={() => setTheme("aurora")}>极光玻璃</button>
    </div>
    {children}
  </div>;
}

type Shortcut = "companion" | "service" | "favorite" | "coupon";
function GlassIcon({ kind }: { kind: Shortcut }) {
  return <span className={`aurora-glass-icon glass-${kind}`} aria-hidden="true">
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {kind === "companion" ? <><path d="M10 10h12c4 0 7 14 3 14-2 0-4-4-6-4h-6c-2 0-4 4-6 4-4 0-1-14 3-14Z" /><path d="M10 15v5m-2.5-2.5h5" /><circle cx="21" cy="15" r="1" fill="currentColor" /><circle cx="24" cy="18" r="1" fill="currentColor" /></> : null}
      {kind === "service" ? <><path d="m16 4 12 7-12 7L4 11 16 4Z" /><path d="m4 17 12 7 12-7M4 23l12 7 12-7" /></> : null}
      {kind === "favorite" ? <path d="m16 4 3.6 7.3 8 1.2-5.8 5.7 1.4 8L16 22.4l-7.2 3.8 1.4-8-5.8-5.7 8-1.2L16 4Z" /> : null}
      {kind === "coupon" ? <><path d="M5 7h22v6a3 3 0 0 0 0 6v6H5v-6a3 3 0 0 0 0-6V7Z" /><path d="M20 8v3m0 4v2m0 4v3M10 16h5" /></> : null}
    </svg>
  </span>;
}

export function AuroraHomeIntro({ onSearch, onCompanions, onServices, onFavorites, onCoupons }: {
  onSearch: () => void; onCompanions: () => void; onServices: () => void; onFavorites: () => void; onCoupons: () => void;
}) {
  const shortcuts: Array<{ kind: Shortcut; label: string; action: () => void }> = [
    { kind: "companion", label: "找陪玩", action: onCompanions },
    { kind: "service", label: "选服务", action: onServices },
    { kind: "favorite", label: "我的收藏", action: onFavorites },
    { kind: "coupon", label: "优惠券", action: onCoupons },
  ];
  return <div className="aurora-home-intro">
    <button type="button" className="aurora-search" onClick={onSearch}><span aria-hidden="true">⌕</span>搜索陪玩 / 服务<span className="aurora-search-hint">和平精英</span></button>
    <section className="aurora-brand-banner" aria-label="熊崽电竞品牌推荐">
      <div className="aurora-banner-copy"><span>熊崽电竞 · 陪你尽兴</span><h2>一起开黑<br />快乐加倍</h2><p>找到你的默契队友</p><button type="button" onClick={onCompanions}>查看陪玩 <span aria-hidden="true">↗</span></button></div>
      <img src="/assets/xiongzai-icon.png" alt="蓝色帽衫熊崽" width="160" height="160" />
      <i className="aurora-orbit orbit-one" aria-hidden="true" /><i className="aurora-orbit orbit-two" aria-hidden="true" />
    </section>
    <nav className="aurora-shortcuts" aria-label="常用功能">{shortcuts.map(({ kind, label, action }) => <button type="button" key={kind} onClick={action}><GlassIcon kind={kind} /><span>{label}</span></button>)}</nav>
  </div>;
}
