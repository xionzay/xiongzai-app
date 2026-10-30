'use client';
import { useState, type ReactNode } from 'react';
import { CartoonIcon } from '../ui/CartoonIcon';
import { RevenueDateRange } from './RevenueDateRange';
import { merchantPeriods } from '../merchant-model';
import { chinaDate, revenueBounds, revenueMetrics, revenueMoney, type RevenueRange, type RevenueRow } from './revenue-model';

export function RevenueDashboard({ rows, preview = false, identity, actions, account }: { rows: RevenueRow[]; preview?: boolean; identity?: ReactNode; actions?: ReactNode; account?: ReactNode }) {
  const [range, setRange] = useState<RevenueRange>('本月');
  const now = new Date(), today = chinaDate(now.getTime());
  const [start, setStart] = useState(today.slice(0, 8) + '01'), [end, setEnd] = useState(today);
  const [shown, setShown] = useState(3), [selectedBucket, setSelectedBucket] = useState('');
  const bounds = revenueBounds(range, start, end, now), metrics = revenueMetrics(rows, bounds);
  const peak = metrics.buckets.reduce((max, b) => { const abs = b.value < 0n ? -b.value : b.value; return abs > max ? abs : max; }, 1n);
  const active = metrics.buckets.find(b => b.key === selectedBucket);
  const [showTrend, setShowTrend] = useState(false);
  const reset = () => { setShown(3); setSelectedBucket(''); };
  return <div className="revenue-dashboard">
    {identity && <section className="revenue-identity">{identity}</section>}
    {preview && <p className="revenue-note">本地示例 · 由预览订单计算，不代表真实收益</p>}
    <section className="revenue-overview" aria-label="收益概览">
      <div className="revenue-periods" role="group" aria-label="收益统计时段">{[...merchantPeriods, '自定义'].map(p => <button type="button" key={p} aria-label={p} aria-pressed={range === p} onClick={() => { setRange(p as RevenueRange); reset(); }}>{p === '累计' ? '全部' : p === '自定义' ? '范围' : p}</button>)}</div>
      {range === '自定义' && <section className="revenue-dates"><RevenueDateRange start={start} end={end} today={today} onChange={(field, value) => { if (field === 'start') setStart(value); else setEnd(value); reset(); }} />{!bounds && <p role="alert">请选择有效日期，开始日期不能晚于结束日期，结束日期不能晚于今天。</p>}</section>}
      <section className="revenue-hero" aria-label="所选时段净收益"><strong>{bounds ? revenueMoney(metrics.net) : '—'}</strong><span>{range === '累计' ? '累计' : range}净收益 <small>（元）</small></span><p>按所选时段入账订单统计 · 已扣费用及退款扣减</p></section>
      <section className="revenue-summary" aria-label="收益统计">
        <div><strong>{bounds && metrics.gross !== null ? revenueMoney(metrics.gross) : '—'}</strong><span>订单收入</span><small>{metrics.gross === null ? '收入数据暂缺' : '扣平台费用前 · 元'}</small></div>
        <div><strong>{bounds && metrics.fees !== null ? revenueMoney(metrics.fees) : '—'}</strong><span>平台服务费</span><small>{metrics.fees === null ? '费用数据暂缺' : '账单当前费用 · 元'}</small></div>
        <div><strong>{bounds ? revenueMoney(metrics.reversed) : '—'}</strong><span>退款扣减</span><small>已记账收益扣减 · 元</small></div>
        <div><strong>{bounds ? metrics.orders : '—'}</strong><span>收益订单</span><small>按订单去重 · 笔</small></div>
        <div><strong>{bounds && metrics.buyers !== null ? metrics.buyers : '—'}</strong><span>服务买家</span><small>{metrics.buyers === null ? '买家身份数据暂缺' : '按买家去重 · 人'}</small></div>
        <div><strong>{bounds ? revenueMoney(metrics.average) : '—'}</strong><span>平均单笔收益</span><small>净收益 / 收益订单 · 元</small></div>
      </section>
      <button type="button" className="revenue-expand" aria-expanded={showTrend} onClick={() => setShowTrend(value => !value)}><span>{showTrend ? '收起收益趋势' : '展开收益趋势'}</span><CartoonIcon kind="chevron" className={showTrend ? 'toon-glyph-up' : ''} /></button>
    </section>
    {actions && <nav className="revenue-quick-actions" aria-label="收益常用功能">{actions}</nav>}
    {account}
    {showTrend && <section className="revenue-panel"><div className="revenue-section-title"><h2>收益趋势</h2><span>{range} · 元</span></div><p className="revenue-chart-value" aria-live="polite">{active ? `${active.key} · ¥${revenueMoney(active.value)}` : '点击柱形查看对应日期金额'}</p>{!bounds || !metrics.buckets.length ? <p className="revenue-empty">{bounds ? '该时段暂无收益记录' : '请先选择有效日期'}</p> : <div className="revenue-chart" role="group" aria-label="按日期查看净收益">{metrics.buckets.map(b => { const abs = b.value < 0n ? -b.value : b.value; const height = Number(abs * 100n / peak); return <button type="button" key={b.key} className={b.value < 0n ? 'negative' : ''} aria-pressed={selectedBucket === b.key} aria-label={`${b.key} 净收益 ${revenueMoney(b.value)} 元`} onClick={() => setSelectedBucket(b.key)}><span className="revenue-bar-track"><i style={{ height: `${height}%` }} /></span><span>{b.key.length === 7 ? b.key.slice(2) : b.key.slice(5)}</span></button>; })}</div>}<p className="revenue-note">按入账记录归属日期汇总；后续退款冲正会更新对应记录的净额。</p></section>}
    <section className="revenue-panel"><div className="revenue-section-title"><h2>收益明细</h2><span>{metrics.selected.length} 条</span></div>{metrics.selected.slice(0, shown).map(row => <article className="revenue-record" key={row.id}><div><b>{row.service_title || `订单 ${row.order_no || row.order_id}`}</b><small>{chinaDate(Date.parse(row.created_at))} · {row.order_no || row.order_id}</small></div><strong>¥{revenueMoney(BigInt(row.seller_amount_cent) - BigInt(row.reversed_amount_cent))}</strong></article>)}{!metrics.selected.length && <p className="revenue-empty">{bounds ? '暂无收益明细' : '请先选择有效日期'}</p>}{metrics.selected.length > shown && <button type="button" className="revenue-more" onClick={() => setShown(n => n + 10)}>查看更多明细</button>}</section>
  </div>;
}
