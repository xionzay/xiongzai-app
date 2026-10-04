'use client';
import { CartoonIcon } from '../ui/CartoonIcon';
import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';

export function SellerSearch({ open, query, onChange, onClose, label, placeholder }: { open: boolean; query: string; onChange: (value: string) => void; onClose: () => void; label: string; placeholder: string }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) input.current?.focus({ preventScroll: true }); }, [open]);
  return <>{open && <div className="seller-search-area" role="search"><input ref={input} aria-label={label} placeholder={placeholder} value={query} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') onClose(); }} /><button type="button" onClick={onClose}>收起</button></div>}{query && <div className="seller-search-summary"><span>搜索“{query}”</span><button type="button" onClick={() => { onChange(''); input.current?.focus({ preventScroll: true }); }}>清除</button></div>}</>;
}

export function SellerSearchIcon() { return <><CartoonIcon kind="search" /><span>搜索</span></>; }

// Keep only the closing visual for 140ms; the business action itself completes immediately.
export function useSellerPresence<T>(value: T | null, enabled = true) {
  const [retained, setRetained] = useState<T | null>(value);
  useLayoutEffect(() => {
    if (value || !enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Synchronizes a retained visual snapshot for exit animation, not business state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRetained(value);
      return;
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const clear = () => setRetained(null);
    const timer = setTimeout(clear, 140);
    media.addEventListener('change', clear);
    return () => { clearTimeout(timer); media.removeEventListener('change', clear); };
  }, [value, enabled]);
  return { shown: enabled ? value ?? retained : value, closing: enabled && !value && !!retained };
}

export function useSellerNotice(message: string, setMessage: Dispatch<SetStateAction<string>>, enabled = true) {
  useEffect(() => { if (!message || !enabled) return; const timer = setTimeout(() => setMessage(''), 3200); return () => clearTimeout(timer); }, [message, setMessage, enabled]);
}

export function useSellerViewMotion(root: RefObject<HTMLElement | null>, view: string, depth: number, enabled = true) {
  const previous = useRef({ view, depth });
  useLayoutEffect(() => {
    const old = previous.current; previous.current = { view, depth };
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!enabled || old.view === view || media.matches) return;
    const x = depth < old.depth ? -10 : 10;
    // Animate the content pieces only: never transform a scrolling screen or its fixed dock.
    const nodes = root.current?.querySelectorAll<HTMLElement>('.sw-content > :not(.sw-sticky-actions), .v31-content > *') ?? [];
    const animations = Array.from(nodes).map(node => node.animate([{ opacity: .7, transform: `translateX(${x}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 180, easing: 'cubic-bezier(.2,.7,.2,1)' }));
    const stop = () => animations.forEach(a => a.cancel());
    media.addEventListener('change', stop);
    return () => { stop(); media.removeEventListener('change', stop); };
  }, [root, view, depth, enabled]);
}
