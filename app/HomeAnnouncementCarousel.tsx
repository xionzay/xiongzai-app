"use client";
import { CartoonIcon } from "./ui/CartoonIcon";

import { useEffect, useRef, useState } from "react";

type Announcement = { id: string; src: string; alt: string };
type Drag = { id: number; x: number; y: number; start: number; time: number; moved: boolean };

export function HomeAnnouncementCarousel({ items, active, onOpen, onImageError }: { items: readonly Announcement[]; active: boolean; onOpen?: (id: Announcement["id"]) => void; onImageError?: () => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const blockedUntil = useRef(0);
  const resumeAt = useRef(0);
  const indexRef = useRef(0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const show = (next: number, manual = true) => {
    const node = viewport.current;
    if (!node) return;
    if (manual) resumeAt.current = Date.now() + 7000;
    node.scrollTo({ left: Math.max(0, Math.min(items.length - 1, next)) * node.clientWidth, behavior: reduced() ? "instant" : "smooth" });
  };

  useEffect(() => {
    const node = viewport.current;
    if (!node || !active) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const schedule = () => {
      clearInterval(timer);
      if (document.hidden || media.matches || paused || items.length < 2) return;
      resumeAt.current = Date.now() + 5200;
      timer = setInterval(() => {
        if (drag.current || Date.now() < resumeAt.current || node.parentElement?.matches(":focus-within") || (window.matchMedia("(hover: hover)").matches && node.parentElement?.matches(":hover"))) return;
        node.scrollTo({ left: ((indexRef.current + 1) % items.length) * node.clientWidth, behavior: "smooth" });
        resumeAt.current = Date.now() + 5200;
      }, 300);
    };
    const resize = new ResizeObserver(() => { node.scrollTo({ left: indexRef.current * node.clientWidth, behavior: "instant" }); });
    resize.observe(node);
    schedule();
    document.addEventListener("visibilitychange", schedule);
    media.addEventListener("change", schedule);
    return () => { clearInterval(timer); resize.disconnect(); document.removeEventListener("visibilitychange", schedule); media.removeEventListener("change", schedule); drag.current = null; delete node.dataset.dragging; };
  }, [active, paused, items.length]);

  const finish = (cancelled: boolean) => {
    const node = viewport.current, current = drag.current;
    drag.current = null;
    if (!node || !current) return;
    delete node.dataset.dragging;
    if (current.moved) {
      blockedUntil.current = Date.now() + 450;
      const distance = node.scrollLeft - current.start;
      const velocity = Math.abs(distance) / Math.max(1, performance.now() - current.time);
      const startIndex = Math.round(current.start / node.clientWidth);
      const advance = Math.abs(distance) > node.clientWidth * .2 || (Math.abs(distance) > 18 && velocity > .35);
      show(cancelled ? startIndex : advance ? startIndex + Math.sign(distance) : startIndex);
    }
    if (node.hasPointerCapture(current.id)) node.releasePointerCapture(current.id);
  };

  return <section className="home-announcement-carousel" aria-roledescription="轮播" aria-label="平台安全公告，可左右滑动">
    <div className="home-announcement-viewport" ref={viewport} role="group" aria-label="公告图片"
      onScroll={(event) => { const node = event.currentTarget; if (!node.clientWidth) return; const next = Math.max(0, Math.min(items.length - 1, Math.round(node.scrollLeft / node.clientWidth))); indexRef.current = next; setIndex(next); }}
      onPointerDown={(event) => { if (!event.isPrimary || event.button !== 0) return; blockedUntil.current = 0; resumeAt.current = Date.now() + 7000; drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: event.currentTarget.scrollLeft, time: performance.now(), moved: false }; }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || event.pointerId !== current.id) return;
        const dx = event.clientX - current.x, dy = event.clientY - current.y;
        if (!current.moved && Math.abs(dy) > Math.max(8, Math.abs(dx))) { drag.current = null; blockedUntil.current = Date.now() + 450; return; }
        if (!current.moved && Math.abs(dx) > 6) { current.moved = true; event.currentTarget.dataset.dragging = "true"; event.currentTarget.setPointerCapture(event.pointerId); }
        if (current.moved) event.currentTarget.scrollLeft = current.start - dx;
      }}
      onPointerUp={() => finish(false)} onPointerCancel={() => finish(true)} onLostPointerCapture={(event) => { if (event.target === event.currentTarget && drag.current) finish(true); }}
>
      <div className="home-announcement-track" style={{ width: `${items.length * 100}%` }}>
        {items.map((item, position) => <button type="button" className="home-announcement-slide" style={{ flexBasis: `${100 / items.length}%` }} tabIndex={position === index ? 0 : -1} aria-hidden={position !== index} aria-label={`打开公告详情：${item.alt}`} key={item.id}
      onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); show(index + (event.key === "ArrowRight" ? 1 : -1)); } }}
          onClick={(event) => { if (event.detail > 0 && Date.now() < blockedUntil.current) { event.preventDefault(); return; } onOpen?.(item.id); }}>
          <img src={item.src} alt="" width={1126} height={250} draggable={false} referrerPolicy="no-referrer" onError={onImageError} />
        </button>)}
      </div>
    </div>
    {items.length > 1 ? <div className="home-announcement-dots" aria-label={`第 ${index + 1} 张，共 ${items.length} 张`}>
      {items.map((item, position) => <button type="button" className={index === position ? "active" : ""} aria-label={`查看第 ${position + 1} 条公告：${item.alt}`} aria-current={index === position ? "true" : undefined} onClick={() => show(position)} key={item.id} />)}
      <button type="button" className="carousel-pause" aria-label={paused ? "继续自动轮播" : "暂停自动轮播"} aria-pressed={paused} onClick={() => setPaused(value => !value)}><CartoonIcon kind={paused ? "play" : "pause"} className="carousel-playback-icon" /></button>
    </div> : null}
  </section>;
}
