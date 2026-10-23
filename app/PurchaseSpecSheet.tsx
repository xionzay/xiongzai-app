"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { CartoonIcon } from "./ui/CartoonIcon";
import { usePanelDismiss } from "./ui/usePanelDismiss";
import { createPortal } from "react-dom";

type Spec = { id: string; name: string; priceCent: string | number };
type Props = {
  anchor: RefObject<HTMLDivElement | null>;
  title: string; cover: string; seller: string;
  specs: Spec[]; selected: number; onSelect: (index: number) => void;
  quantity?: number; onQuantity?: (quantity: number) => void;
  onClose: () => void; onConfirm: () => void;
};
const money = (cent: number | string) => { const n=BigInt(cent);return (n/100n).toString()+"."+(n%100n).toString().padStart(2,"0"); };

export function PurchaseSpecSheet({ anchor, title, cover, seller, specs, selected, onSelect, quantity = 1, onQuantity, onClose, onConfirm }: Props) {
  const { closing, dismiss } = usePanelDismiss(onClose);
  const headingId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = dismiss; }, [dismiss]);
  const [host,setHost] = useState<Element|null>(null);
  useEffect(() => { const element=anchor.current?.closest(".phone-shell")??null;void Promise.resolve().then(()=>setHost(element)); },[anchor]);
  const spec = specs[selected] ?? specs[0];
  useEffect(() => {
    const screen = document.querySelector<HTMLElement>(".service-screen.product-page");
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
      const element = document.querySelector<HTMLElement>(".service-screen.product-page");
      if (element) { element.style.overflowY = overflow; element.inert = wasInert; }
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [anchor]);
  if (!host || !spec) return null;
  return createPortal(<div ref={dialog} className={`purchase-spec-overlay${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-labelledby={headingId}>
    <button type="button" className="purchase-spec-scrim" tabIndex={-1} aria-label="关闭规格弹窗遮罩" onClick={dismiss} />
    <section className="purchase-spec-sheet">
      <header className="purchase-spec-header"><h2 id={headingId}>确认购买</h2><button type="button" className="purchase-spec-close" aria-label="关闭规格弹窗" onClick={dismiss}><CartoonIcon kind="close" /></button></header>
      <div className="purchase-spec-summary"><img src={cover} alt={title} /><div><strong aria-live="polite">¥{money(spec.priceCent)}</strong><h3>{title}</h3><p>{seller}</p><small>已选：{spec.name} · {quantity} 份</small></div></div>
      <div className="purchase-spec-body">
        {specs.length > 1 && <h3>商品规格</h3>}
        {specs.length > 1 && <div className="purchase-spec-options" role="group" aria-label="服务规格">{specs.map((item, index) => <button key={item.id} type="button" aria-pressed={selected === index} onClick={() => onSelect(index)}><span>{item.name}</span><strong>¥{money(item.priceCent)}</strong>{selected === index ? <i aria-hidden="true"><CartoonIcon kind="check" /></i> : null}</button>)}</div>}
        <div className="purchase-spec-quantity"><b>购买数量</b>{onQuantity ? <div><button type="button" aria-label="减少数量" disabled={quantity <= 1} onClick={() => onQuantity(quantity - 1)}><CartoonIcon kind="minus" /></button><output aria-live="polite">{quantity}</output><button type="button" aria-label="增加数量" disabled={quantity >= 20} onClick={() => onQuantity(quantity + 1)}><CartoonIcon kind="plus" /></button></div> : <span>1 份</span>}</div>
        <p className="purchase-spec-note">商品内容与价格以所选规格为准</p>
      </div>
      <footer className="purchase-spec-footer"><button type="button" onClick={onConfirm}>确认订单 <strong aria-live="polite">¥{money((BigInt(spec.priceCent) * BigInt(quantity)).toString())}</strong></button></footer>
    </section>
  </div>, host);
}
