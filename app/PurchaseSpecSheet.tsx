"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";

type Spec = { id: string; name: string; priceCent: string | number };
type Props = {
  anchor: RefObject<HTMLDivElement | null>;
  title: string; cover: string; seller: string;
  specs: Spec[]; selected: number; onSelect: (index: number) => void;
  quantity?: number; onQuantity?: (quantity: number) => void;
  onClose: () => void; onConfirm: () => void;
};
const money = (cent: number | string) => (Number(cent) / 100).toFixed(2);

export function PurchaseSpecSheet({ anchor, title, cover, seller, specs, selected, onSelect, quantity = 1, onQuantity, onClose, onConfirm }: Props) {
  const headingId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const host = anchor.current?.closest(".phone-shell");
  const spec = specs[selected] ?? specs[0];
  useEffect(() => {
    const screen = anchor.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = screen?.style.overflowY ?? "";
    const wasInert = screen?.inert ?? false;
    if (screen) { screen.style.overflowY = "hidden"; screen.inert = true; }
    dialog.current?.querySelector<HTMLButtonElement>(".purchase-spec-close")?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"])') ?? []);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (screen) { screen.style.overflowY = overflow; screen.inert = wasInert; }
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [anchor]);
  if (!host || !spec) return null;
  return createPortal(<div ref={dialog} className="purchase-spec-overlay" role="dialog" aria-modal="true" aria-labelledby={headingId}>
    <button type="button" className="purchase-spec-scrim" tabIndex={-1} aria-label="关闭规格弹窗遮罩" onClick={onClose} />
    <section className="purchase-spec-sheet">
      <header className="purchase-spec-header"><h2 id={headingId}>选择服务规格</h2><button type="button" className="purchase-spec-close" aria-label="关闭规格弹窗" onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></header>
      <div className="purchase-spec-summary"><img src={cover} alt={title} /><div><strong aria-live="polite">¥{money(spec.priceCent)}</strong><h3>{title}</h3><p>{seller}</p><small>已选：{spec.name} · {quantity} 份</small></div></div>
      <div className="purchase-spec-body">
        <h3>服务规格</h3>
        <div className="purchase-spec-options" role="group" aria-label="服务规格">{specs.map((item, index) => <button key={item.id} type="button" aria-pressed={selected === index} onClick={() => onSelect(index)}><span>{item.name}</span><strong>¥{money(item.priceCent)}</strong>{selected === index ? <i aria-hidden="true">✓</i> : null}</button>)}</div>
        <div className="purchase-spec-quantity"><b>购买数量</b>{onQuantity ? <div><button type="button" aria-label="减少数量" disabled={quantity <= 1} onClick={() => onQuantity(quantity - 1)}>−</button><output aria-live="polite">{quantity}</output><button type="button" aria-label="增加数量" disabled={quantity >= 9} onClick={() => onQuantity(quantity + 1)}>＋</button></div> : <span>1 份</span>}</div>
        <p className="purchase-spec-note">服务内容与价格以所选规格为准</p>
      </div>
      <footer className="purchase-spec-footer"><span>合计 <strong aria-live="polite">¥{money(Number(spec.priceCent) * quantity)}</strong></span><button type="button" onClick={onConfirm}>确认规格，下一步</button></footer>
    </section>
  </div>, host);
}
