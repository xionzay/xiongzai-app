"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

/** A deliberate bottom pull; native scrolling remains available everywhere else. */
export function HomeFeedFooter({ root, active, hasMore, blocked, onLoadMore }: {
  root: RefObject<HTMLDivElement | null>; active: boolean; hasMore: boolean;
  blocked: boolean; onLoadMore: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pull, setPull] = useState(0);
  const locked = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = useCallback(async () => {
    if (!active || !hasMore || blocked || locked.current) return;
    locked.current = true; setBusy(true); setError(""); setPull(0);
    // A short, stable feedback beat avoids a flashing loader; it never blocks scrolling.
    const beat = new Promise(resolve => setTimeout(resolve, 320));
    try { await Promise.all([onLoadMore(), beat]); }
    catch (cause) { await beat; if (mounted.current) setError(cause instanceof Error ? cause.message : "加载失败，请重试"); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }, [active, hasMore, blocked, onLoadMore]);

  useEffect(() => {
    const node = root.current;
    if (!node || !active) return;
    let anchor: number | null = null, startX = 0, amount = 0, wheel = 0, lastWheel = 0;
    const bottom = () => node.scrollHeight - node.clientHeight - node.scrollTop <= 4;
    const eligible = () => hasMore && !blocked && !locked.current && !error;
    const clear = () => { anchor = null; amount = 0; wheel = 0; setPull(0); };
    const start = (event: TouchEvent) => {
      clear(); if (event.touches.length !== 1 || !eligible()) return;
      startX = event.touches[0].clientX;
      anchor = bottom() ? event.touches[0].clientY : null;
    };
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 1 || !eligible() || !bottom()) { clear(); return; }
      const touch = event.touches[0];
      if (Math.abs(touch.clientX - startX) > 40) { clear(); return; }
      if (anchor === null) anchor = touch.clientY;
      amount = Math.min(72, Math.max(0, (anchor - touch.clientY) * .45));
      setPull(amount);
    };
    const end = () => { const ready = amount >= 32; clear(); if (ready) void load(); };
    const onWheel = (event: WheelEvent) => {
      if (!eligible() || !bottom() || event.deltaY <= 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) { wheel = 0; return; }
      const now = Date.now(); if (now - lastWheel > 240) wheel = 0;
      lastWheel = now; wheel += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      if (wheel >= 64) { wheel = 0; void load(); }
    };
    node.addEventListener("touchstart", start, { passive: true });
    node.addEventListener("touchmove", move, { passive: true });
    node.addEventListener("touchend", end); node.addEventListener("touchcancel", clear);
    node.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      node.removeEventListener("touchstart", start); node.removeEventListener("touchmove", move);
      node.removeEventListener("touchend", end); node.removeEventListener("touchcancel", clear);
      node.removeEventListener("wheel", onWheel);
      setPull(0);
    };
  }, [root, active, hasMore, blocked, error, load]);
  return <div className="home-feed-footer" aria-busy={busy}>
    <div className="home-feed-feedback" style={{ "--home-pull": `${-Math.min(pull * .25, 16)}px` } as CSSProperties}>
      {busy ? <span role="status"><i className="home-feed-spinner" aria-hidden="true" />正在加载…</span>
        : error ? <><span role="alert">{error}</span><button type="button" onClick={() => void load()} disabled={blocked}>重试加载</button></>
        : hasMore ? <button type="button" disabled={blocked} onClick={() => void load()}>{pull >= 32 ? "松开加载更多" : "继续上拉或点击加载更多"}</button>
        : <span role="status">已经到底了</span>}
    </div>
  </div>;
}
