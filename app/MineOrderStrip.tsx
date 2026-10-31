'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** Five shortcuts per viewport, with a persistent, keyboard-operable scroll bar. */
export function MineOrderStrip({ children }: { children: ReactNode }) {
  const id = useId();
  const strip = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0);
  const [maximum, setMaximum] = useState(1);
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const measure = () => {
      setMaximum(Math.max(0, element.scrollWidth - element.clientWidth));
      setPosition(element.scrollLeft);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div className="mine-order-strip">
    <div ref={strip} id={id} className="commerce-order-entries" onScroll={event => setPosition(event.currentTarget.scrollLeft)}>{children}</div>
    <input className="mine-order-scrollbar" type="range" min="0" max={maximum || 1} step="1"
      value={Math.min(position, maximum)} disabled={!maximum} aria-label="滑动查看全部订单入口" aria-controls={id}
      aria-valuetext={position < 1 ? '显示前五个订单入口' : position >= maximum - 1 ? '已滑动到最后的订单入口' : '正在查看中间的订单入口'}
      onChange={event => { const left = Number(event.target.value); setPosition(left); strip.current?.scrollTo({ left, behavior: 'instant' }); }} />
  </div>;
}
