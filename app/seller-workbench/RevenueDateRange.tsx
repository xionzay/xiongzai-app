'use client';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CartoonIcon } from '../ui/CartoonIcon';
import { calendarAllowed, calendarDays, shiftCalendarDate, shiftCalendarMonth } from './revenue-calendar';

type Field = 'start' | 'end';
type Props = { start: string; end: string; today: string; onChange: (field: Field, value: string) => void };
export function RevenueDateRange({ start, end, today, onChange }: Props) {
  const id = useId(), root = useRef<HTMLDivElement>(null);
  const startTrigger = useRef<HTMLButtonElement>(null), endTrigger = useRef<HTMLButtonElement>(null);
  const [field, setField] = useState<Field | null>(null);
  const [draft, setDraft] = useState(start), [month, setMonth] = useState(start.slice(0, 7));
  const [focused, setFocused] = useState(start), [monthsOpen, setMonthsOpen] = useState(false);
  const min = field === 'end' ? start : '1900-01-01', max = field === 'start' ? end : today;
  const days = calendarDays(month), year = Number(month.slice(0, 4));
  const allowed = (date: string) => calendarAllowed(date, min, max);
  const close = (restore = true) => {
    setField(null);
    if (restore) (field === 'start' ? startTrigger : endTrigger).current?.focus();
  };
  useEffect(() => {
    if (!field) return;
    root.current?.querySelector('footer')?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setField(null); };
    const container = root.current;
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); setField(null);
      (field === 'start' ? startTrigger : endTrigger).current?.focus();
    };
    document.addEventListener('pointerdown', dismiss);
    container?.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); container?.removeEventListener('keydown', escape); };
  }, [field]);
  useEffect(() => {
    if (field && !monthsOpen) root.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus({ preventScroll: true });
  }, [field, focused, monthsOpen]);
  const open = (next: Field) => {
    if (field === next) { close(); return; }
    const value = next === 'start' ? start : end;
    setDraft(value); setFocused(value); setMonth(value.slice(0, 7)); setMonthsOpen(false); setField(next);
  };
  const navigate = (delta: number) => {
    const target = shiftCalendarMonth(`${month}-01`, delta).slice(0, 7);
    const value = target === min.slice(0, 7) ? min : `${target}-01`;
    setMonth(target); setFocused(value);
  };
  const onDayKey = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    const shifts: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -day, End: 6 - day };
    let next: string;
    if (event.key in shifts) next = shiftCalendarDate(date, shifts[event.key]);
    else if (event.key === 'PageUp' || event.key === 'PageDown') next = shiftCalendarMonth(date, (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1));
    else return;
    event.preventDefault();
    next = next < min ? min : next > max ? max : next;
    setMonth(next.slice(0, 7)); setFocused(next);
  };
  return <div className="revenue-date-range" role="group" aria-label="自定义收益日期范围" ref={root}>
    <div className="revenue-date-fields">{(['start', 'end'] as const).map(key => <div key={key}><span id={`${id}-${key}`}>{key === 'start' ? '开始日期' : '结束日期'}</span><button type="button" ref={key === 'start' ? startTrigger : endTrigger} className="revenue-date-trigger" aria-labelledby={`${id}-${key} ${id}-${key}-value`} aria-expanded={field === key} aria-controls={field === key ? `${id}-calendar` : undefined} onClick={() => open(key)}><span id={`${id}-${key}-value`}>{(key === 'start' ? start : end).replaceAll('-', '/')}</span><CartoonIcon kind="order" /></button></div>)}</div>
    {field && <section id={`${id}-calendar`} className="revenue-calendar" role="dialog" tabIndex={-1} aria-label={`选择${field === 'start' ? '开始' : '结束'}日期`}>
      <header className="revenue-calendar-title"><CartoonIcon kind="order" /><div><b>选个好日子</b><small>选择{field === 'start' ? '开始' : '结束'}日期 · 确认后更新收益</small></div><button type="button" aria-label="收起日历" onClick={() => close()}><CartoonIcon kind="close" /></button></header>
      <div className="revenue-calendar-nav"><button type="button" aria-label={monthsOpen ? '上一年' : '上个月'} disabled={monthsOpen ? year <= Number(min.slice(0, 4)) : month <= min.slice(0, 7)} onClick={() => navigate(monthsOpen ? -12 : -1)}><CartoonIcon kind="back" /></button><button type="button" className="revenue-calendar-month" aria-expanded={monthsOpen} onClick={() => setMonthsOpen(!monthsOpen)}>{year} 年 {monthsOpen ? '· 选择月份' : `${Number(month.slice(5))} 月`}<CartoonIcon kind="chevron" /></button><button type="button" aria-label={monthsOpen ? '下一年' : '下个月'} disabled={monthsOpen ? year >= Number(max.slice(0, 4)) : month >= max.slice(0, 7)} onClick={() => navigate(monthsOpen ? 12 : 1)}><CartoonIcon kind="back" className="toon-glyph-right" /></button></div>
      {monthsOpen ? <div className="revenue-calendar-months">{Array.from({ length: 12 }, (_, i) => { const value = `${year}-${String(i + 1).padStart(2, '0')}`; return <button type="button" key={value} aria-label={`${i + 1}月`} disabled={value < min.slice(0, 7) || value > max.slice(0, 7)} onClick={() => { const date = value === min.slice(0, 7) ? min : `${value}-01`; setMonth(value); setFocused(date); setMonthsOpen(false); }}>{i + 1}月</button>; })}</div> : <>
        <div className="revenue-calendar-week" aria-hidden="true">{'日一二三四五六'.split('').map(day => <span key={day}>{day}</span>)}</div>
        <div className="revenue-calendar-days" role="group" aria-label={`${year}年${Number(month.slice(5))}月日期，支持方向键切换`}>{days.map(date => <button type="button" key={date} data-date={date} className={date.slice(0, 7) === month ? '' : 'outside-month'} disabled={!allowed(date)} tabIndex={date === focused ? 0 : -1} aria-label={date} aria-pressed={draft === date} aria-current={date === today ? 'date' : undefined} onKeyDown={event => onDayKey(event, date)} onClick={() => { setDraft(date); setFocused(date); setMonth(date.slice(0, 7)); }}>{Number(date.slice(8))}{date === today && <i aria-hidden="true" />}</button>)}</div>
      </>}
      <p className="revenue-calendar-selection" aria-live="polite">已选：{draft.replaceAll('-', '/')}</p>
      <footer><button type="button" onClick={() => close()}>取消</button><button type="button" className="revenue-calendar-today" disabled={!allowed(today)} onClick={() => { setDraft(today); setMonth(today.slice(0, 7)); setFocused(today); setMonthsOpen(false); }}>今天</button><button type="button" className="revenue-calendar-confirm" disabled={!allowed(draft)} onClick={() => { if (allowed(draft)) { onChange(field, draft); close(); } }}>确认日期<CartoonIcon kind="check" /></button></footer>
    </section>}
  </div>;
}
