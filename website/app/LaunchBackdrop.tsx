"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import styles from "./launch-backdrop.module.css";

/** Independent scenic parallax; text and download cards remain stationary. */
export default function LaunchBackdrop() {
  const backgroundRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = backgroundRef.current;
    const section = layer?.parentElement;
    if (!layer || !section) return;
    const bear = section.querySelector<HTMLElement>("[data-launch-bear]");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    let visible = false;
    let frame = 0;
    let x = 0;
    let y = 0;
    let scroll = 0;
    let targetX = 0;
    let targetY = 0;
    let targetScroll = 0;

    const paint = () => {
      layer.style.setProperty("--space-x", `${x.toFixed(2)}px`);
      layer.style.setProperty("--space-y", `${y.toFixed(2)}px`);
      layer.style.setProperty("--space-scroll", `${scroll.toFixed(2)}px`);
      bear?.style.setProperty("--bear-x", `${(x * .3).toFixed(2)}px`);
    };
    const tick = () => {
      frame = 0;
      if (!visible || document.hidden || reduced.matches) return;
      x += (targetX - x) * .12;
      y += (targetY - y) * .12;
      scroll += (targetScroll - scroll) * .12;
      paint();
      if (Math.abs(targetX - x) + Math.abs(targetY - y) + Math.abs(targetScroll - scroll) > .08) frame = requestAnimationFrame(tick);
    };
    const requestPaint = () => {
      if (!frame && visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(tick);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !fine.matches || reduced.matches || !visible) return;
      const box = section.getBoundingClientRect();
      targetX = (event.clientX - box.left - box.width / 2) / box.width * 18;
      targetY = (event.clientY - box.top - box.height / 2) / box.height * 14;
      requestPaint();
    };
    const onLeave = () => { targetX = 0; targetY = 0; requestPaint(); };
    const onScroll = () => {
      if (!visible || reduced.matches) return;
      const box = section.getBoundingClientRect();
      targetScroll = Math.max(-28, Math.min(28, -box.top * (fine.matches ? .035 : .016)));
      requestPaint();
    };
    const stop = () => { cancelAnimationFrame(frame); frame = 0; };
    const onMotion = () => {
      stop();
      x = y = scroll = targetX = targetY = targetScroll = 0;
      paint();
      if (!reduced.matches) onScroll();
    };
    const onVisibility = () => { if (document.hidden) stop(); else onScroll(); };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) onScroll(); else stop();
    }, { rootMargin: "80px" });
    observer.observe(section);
    section.addEventListener("pointermove", onPointerMove, { passive: true });
    section.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", onMotion);
    fine.addEventListener("change", onMotion);
    return () => {
      stop();
      observer.disconnect();
      section.removeEventListener("pointermove", onPointerMove);
      section.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onMotion);
      fine.removeEventListener("change", onMotion);
    };
  }, []);

  return <div ref={backgroundRef} className={styles.backdrop} aria-hidden="true" data-cloud-station>
    <div className={styles.planetLayer}><Image className={styles.planet} src="/assets/launch-blue-planet-v2.webp" width={1100} height={1100} sizes="(max-width: 700px) 500px, 900px" alt="" loading="eager" unoptimized /></div>
    <div className={styles.sunrise} />
    <div className={styles.stardust}>{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ left: `${4 + (i * 37 % 91)}%`, top: `${13 + (i * 19 % 63)}%`, animationDelay: `${-i * .73}s`, animationDuration: `${4 + i % 5}s` }} />)}</div>
    <div className={styles.starA}><Image src="/assets/launch-star-gold-small-v1.webp" width={128} height={128} sizes="46px" alt="" unoptimized /></div>
    <div className={styles.starB}><Image src="/assets/launch-star-gold-small-v1.webp" width={128} height={128} sizes="30px" alt="" unoptimized /></div>
    <div className={styles.horizon}>
      <Image className={styles.cloudSea} src="/assets/launch-cloud-sea-v1.webp" width={2172} height={724} sizes="100vw" alt="" loading="eager" />
    </div>
    <div className={styles.midLayer}><Image className={styles.midCloud} src="/assets/launch-cloud-bank-v1.webp" width={1536} height={512} sizes="(max-width: 700px) 80vw, 48vw" alt="" loading="eager" /></div>
    <div className={styles.nearLayer}><Image className={styles.nearCloud} src="/assets/launch-cloud-bank-v1.webp" width={1536} height={512} sizes="(max-width: 700px) 90vw, 58vw" alt="" loading="eager" /></div>
    <div className={styles.readingShade} />
  </div>;
}
