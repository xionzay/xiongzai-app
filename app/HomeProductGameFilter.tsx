'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PRODUCT_GAMES } from './product-decisions';
import { CartoonIcon } from './ui/CartoonIcon';

/** Homepage-only scroller. Selecting a game never moves the vertical page. */
export function HomeProductGameFilter({ value, onChange }: { value: string; onChange: (game: string) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const update = () => {
    const el = list.current;
    setMore(!!el && el.scrollWidth - el.clientWidth - el.scrollLeft > 2);
  };
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = list.current, selected = el?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!el || !selected) return;
    const left = selected.offsetLeft, right = left + selected.offsetWidth;
    if (left < el.scrollLeft) el.scrollLeft = Math.max(0, left - 8);
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth + 8;
    update();
  }, [value]);
  return <div className="home-product-games" data-more={more}>
    <div className="decision-games" ref={list} aria-label="游戏筛选" onScroll={update}>
      {['全部', ...PRODUCT_GAMES].map(game => <button type="button" key={game} aria-pressed={value === game} onClick={() => onChange(game)}>{game}</button>)}
    </div>
    {more && <button type="button" className="home-game-more" aria-label="向右查看更多游戏" onClick={() => list.current?.scrollBy({ left: 180, behavior: 'auto' })}><CartoonIcon kind="back" /></button>}
  </div>;
}
