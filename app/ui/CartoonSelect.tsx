'use client';
import { Children, isValidElement, useId, useRef, useState, useEffect, type ReactNode, type SelectHTMLAttributes } from 'react';
import { CartoonIcon } from './CartoonIcon';

/** Keep the original select as the form/data source; the dialog is only its accessible picker. */
export function CartoonSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const select = useRef<HTMLSelectElement>(null), dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [options, setOptions] = useState<{ value: string; text: string; disabled: boolean }[]>([]);
  const [draft, setDraft] = useState('');
  const id = useId();
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const title = props['aria-label'] || '请选择';
  const labels = (children: ReactNode): { value: string; text: ReactNode }[] => Children.toArray(children).flatMap(child => {
    if (!isValidElement<{value?: string; children?: ReactNode}>(child)) return [];
    return child.type === 'option' ? [{ value: String(child.props.value ?? child.props.children ?? ''), text: child.props.children }] : labels(child.props.children);
  });
  const choices = labels(props.children);
  const selected = choices.find(o => o.value === String(props.value ?? props.defaultValue ?? '')) ?? choices[0];
  const show = () => {
    if (!select.current) return;
    setOptions(Array.from(select.current.options).map(o => ({ value:o.value, text:o.text, disabled:o.disabled })));
    setDraft(select.current.value);
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setClosing(false);
    if (!dialog.current?.open) dialog.current?.showModal();
  };
  const close = () => {
    if (timer.current) return;
    const finish = () => { timer.current = null; dialog.current?.close(); setClosing(false); trigger.current?.focus({ preventScroll:true }); };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    setClosing(true); timer.current = setTimeout(finish, 140);
  };
  const confirm = () => {
    const el = select.current;
    if (!el) return;
    el.value = draft;
    el.dispatchEvent(new Event('change', { bubbles:true }));
    close();
  };
  return <span className="toon-select">
    <select {...props} ref={select} tabIndex={-1} aria-hidden="true" onInvalid={() => trigger.current?.focus()} />
    <button ref={trigger} type="button" className="toon-select-trigger" disabled={props.disabled} aria-label={title} aria-haspopup="dialog" onClick={show}>
      <span>{selected?.text ?? title}</span><CartoonIcon kind="chevron" />
    </button>
    <dialog className={`toon-picker${closing ? " is-closing" : ""}`} ref={dialog} aria-labelledby={id} onCancel={e => { e.preventDefault(); close(); }} onPointerDown={e => { if (e.target === dialog.current) close(); }}>
      <header><CartoonIcon kind="service" /><h2 id={id}>{title}</h2><button type="button" aria-label="关闭选择" onClick={close}><CartoonIcon kind="close" /></button></header>
      <div className="toon-picker-options" role="radiogroup" aria-label={title}>{options.map((o,i) => <label key={`${o.value}-${i}`}><input type="radio" name={id} value={o.value} checked={draft === o.value} disabled={o.disabled} onChange={() => setDraft(o.value)} /><span>{o.text}</span>{draft === o.value && <CartoonIcon kind="check" />}</label>)}</div>
      <footer><button type="button" onClick={close}>取消</button><button type="button" className="toon-confirm" disabled={closing} onClick={confirm}>确认选择</button></footer>
    </dialog>
  </span>;
}
