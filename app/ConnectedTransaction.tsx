'use client';
import { useEffect, useRef, useState } from 'react';
import { ConnectedFiles, OrderEvidence } from './ConnectedFiles';
import { businessError, evidenceError, money, type BusinessFile, type ConnectedOrder, type Product, type Request } from './connected-commerce';

type Policy = { id: string; title: string; version_no: string | number; content: string };
type Preview = { sku_name: string; payable_amount_cent: string; fulfillment_seconds?: number | null; service_starts_at?: string | null; service_ends_at?: string | null };
type Payment = { id: string; order_id: string; status: string; channel: 'WECHAT_APP' | 'ALIPAY_APP'; amount_cent: string };
const mockEnabled = process.env.NODE_ENV !== 'production' || (process.env.NEXT_PUBLIC_APP_ENV === 'test' && process.env.NEXT_PUBLIC_ENABLE_MOCK_PAYMENT === 'true');

export function ConnectedCheckout({ request, product, skuId, quantity, booking, back, created }: { request: Request; product: Product; skuId?: string; quantity: number; booking?: { slot_id: string; service_starts_at: string } | null; back: () => void; created: (order: ConnectedOrder) => void }) {
 const newProduct = Boolean(product.game && product.fulfillment_seconds != null);
 const draft = { product_id: product.id, quantity, ...(product.pricing_mode === 'SINGLE' && newProduct ? {} : { sku_id: skuId }), ...(newProduct ? {} : booking ?? {}) };
 const [preview, setPreview] = useState<Preview | null>(null), [policies, setPolicies] = useState<Policy[]>([]), [accepted, setAccepted] = useState<string[]>([]), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
 const intent = useRef<{ fingerprint: string; key: string } | null>(null), lock = useRef(false);
 const serialized = JSON.stringify(draft);
 useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) setPreview(null); }); void Promise.all([request<Preview>('/orders/preview', { method: 'POST', body: serialized }), request<Policy[]>('/policies/current?scene=ORDER_PAYMENT')]).then(([next, versions]) => { if (active) { setPreview(next); setPolicies(versions); setNotice(''); } }).catch(error => { if (active) setNotice(businessError(error)); }); return () => { active = false; }; }, [request, serialized]);
 const submit = async () => {
  if (lock.current || !preview || !policies.length || !policies.every(policy => accepted.includes(policy.id))) return;
  lock.current = true; setBusy(true);
  try {
   await request('/policies/acceptances', { method: 'POST', body: JSON.stringify({ acceptance_scene: 'ORDER_PAYMENT', confirmation_method: 'ONLINE_CONFIRM', policy_version_ids: accepted }) });
   const latest = await request<Preview>('/orders/preview', { method: 'POST', body: serialized });
   if (JSON.stringify(latest) !== JSON.stringify(preview)) { setPreview(latest); setNotice('价格或规则已变化，请核对最新预览后再次提交'); intent.current = null; return; }
   const body = { ...draft, expected_payable_amount_cent: latest.payable_amount_cent }, fingerprint = JSON.stringify(body);
   if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: `order-${crypto.randomUUID()}` };
   const order = await request<ConnectedOrder>('/orders', { method: 'POST', headers: { 'Idempotency-Key': intent.current.key }, body: fingerprint }); created(order);
  } catch (error) { setNotice(businessError(error)); }
  finally { lock.current = false; setBusy(false); }
 };
 return <div className="app-screen decision-page checkout-screen"><header className="sw-header"><button onClick={back}>返回商品</button><h1>确认订单</h1></header><section className="paper-panel"><h2>{product.title}</h2><p>{preview?.sku_name} ×{quantity}</p><p>商品应付：{preview ? `¥${money(preview.payable_amount_cent)}` : '正在读取服务端预览…'}</p><p>{newProduct ? `付款后 ${product.fulfillment_seconds! / 3600} 小时内完成，不要求预约或卖家接单` : preview?.service_starts_at ? `预约 ${new Date(preview.service_starts_at).toLocaleString('zh-CN')}` : '存量商品需要有效预约，请返回选择'}</p><p>具体需求通过平台文字聊天沟通。优惠券资金规则尚未开放。</p></section>{policies.map(policy => <section className="paper-panel" key={policy.id}><details><summary>《{policy.title}》V{policy.version_no} · 本地测试草案</summary><p>{policy.content}</p></details><label><input type="checkbox" checked={accepted.includes(policy.id)} onChange={event => setAccepted(ids => event.target.checked ? [...ids, policy.id] : ids.filter(id => id !== policy.id))} />我已阅读并同意此版本</label></section>)}<p role="alert">{notice}</p><button className="full-primary" disabled={busy || !preview || !policies.length || !policies.every(policy => accepted.includes(policy.id))} onClick={() => void submit()}>{busy ? '正在提交…' : '提交订单'}</button></div>;
}

export function ConnectedPayment({ request, order, back, paid }: { request: Request; order: Pick<ConnectedOrder, 'id' | 'payable_amount_cent'>; back: () => void; paid: (order: ConnectedOrder, payment: Payment) => void | Promise<void> }) {
 const [channel, setChannel] = useState<Payment['channel'] | ''>(''), [payment, setPayment] = useState<Payment | null>(null), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
 const keys = useRef(new Map<string, string>()), lock = useRef(false);
 const query = async (id: string) => {
  const result = await request<{ payment: Payment }>(`/payments/${id}/query`, { method: 'POST' });
  const current = await request<ConnectedOrder & { payments: Payment[] }>(`/orders/${order.id}`);
  setPayment(result.payment); setNotice(({ CREATED: '待支付', PAYING: '支付处理中', PAID: '支付成功', FAILED: '支付失败，可以重试', CLOSED: '付款已关闭；订单到期时不能重试' } as Record<string, string>)[result.payment.status] ?? result.payment.status);
  if (result.payment.status === 'PAID' && result.payment.order_id === order.id && current.payment_status === 'PAID') await paid(current, result.payment);
 };
 useEffect(() => { let active = true; void request<ConnectedOrder & { payments: Payment[] }>(`/orders/${order.id}`).then(current => { if (!active) return; const existing = current.payments.find(item => ['CREATED', 'PAYING'].includes(item.status)); if (existing) { setPayment(existing); setChannel(existing.channel); } }).catch(error => { if (active) setNotice(businessError(error)); }); return () => { active = false; }; }, [request, order.id]);
 const run = async (action: 'create' | 'query' | 'mock-confirm' | 'mock-fail' | 'mock-cancel') => {
  if (lock.current || !channel || (action.startsWith('mock-') && !mockEnabled)) return;
  lock.current = true; setBusy(true);
  try {
   if (action === 'create') {
    const fingerprint = `${order.id}:${channel}`;
    let key = keys.current.get(fingerprint); if (!key) { key = `payment-${crypto.randomUUID()}`; keys.current.set(fingerprint, key); }
    const result = await request<Payment>('/payments', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ order_id: order.id, payment_channel: channel }) });
    setPayment(result); await query(result.id);
   } else if (payment) { if (action !== 'query') await request(`/payments/${payment.id}/${action}`, { method: 'POST' }); await query(payment.id); }
  } catch (error) { setNotice(businessError(error)); }
  finally { lock.current = false; setBusy(false); }
 };
 const active = payment && ['CREATED', 'PAYING'].includes(payment.status);
 return <div className="app-screen payment-screen"><header className="sw-header"><button onClick={back}>返回订单</button><h1>收银台</h1></header><section className="payment-test-banner"><p>本地模拟，不真实扣款。支付结果以服务端查询为准。</p></section><section className="payment-amount"><b>¥{money(order.payable_amount_cent)}</b></section><section className="payment-methods">{(['WECHAT_APP', 'ALIPAY_APP'] as const).map(value => <button key={value} disabled={busy || Boolean(active)} aria-pressed={channel === value} onClick={() => setChannel(value)}>{value === 'WECHAT_APP' ? '微信 App' : '支付宝 App'} · Mock</button>)}</section><p role="status">{notice}</p>{payment && <p>原付款渠道：{payment.channel==="WECHAT_APP"?"微信支付测试":"支付宝支付测试"} · {({CREATED:"待支付",PAYING:"支付处理中",PAID:"支付成功",FAILED:"支付失败",CLOSED:"已关闭"} as Record<string,string>)[payment.status]??"状态待确认"}</p>}{!active && <button className="pay-button" disabled={busy || !channel} onClick={() => { if (payment && ['FAILED', 'CLOSED'].includes(payment.status) && channel) keys.current.delete(`${order.id}:${channel}`); void run('create'); }}>创建付款 / 安全重试</button>}{payment && <button disabled={busy} onClick={() => void run('query')}>查询服务端付款结果</button>}{mockEnabled && active && <section className="paper-panel"><h3>开发模拟操作（不真实扣款）</h3><button disabled={busy} onClick={() => void run('mock-confirm')}>模拟成功</button><button disabled={busy} onClick={() => void run('mock-fail')}>模拟失败</button><button disabled={busy} onClick={() => void run('mock-cancel')}>模拟关闭</button></section>}</div>;
}

export function ConnectedOrderDetail({ request, initial, seller = false, back, updated, navigate }: { request: Request; initial: ConnectedOrder; seller?: boolean; back: () => void; updated: (order: ConnectedOrder) => void; navigate: (action: string) => void }) {
 const [order, setOrder] = useState(initial), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [files, setFiles] = useState<BusinessFile[]>([]), [now, setNow] = useState(() => Date.now());
 const lock = useRef(false), path = `${seller ? '/seller' : ''}/orders/${initial.id}`;
 const refresh = async () => { const current = await request<ConnectedOrder>(path); setOrder(current); updated(current); return current; };
 useEffect(() => { let active = true; void request<ConnectedOrder>(path).then(current => { if (active) { setOrder(current); updated(current); } }).catch(error => { if (active) setNotice(businessError(error)); }); const timer = setInterval(() => setNow(Date.now()), 1000); return () => { active = false; clearInterval(timer); }; }, [request, path, updated]);
 const actions = seller ? order.seller_available_actions ?? [] : order.available_actions ?? [];
 const frozen = order.after_sale_status === 'IN_PROGRESS' || order.payment_status === 'REFUNDING' || order.evidence_review_pending;
 const run = async (action: string) => {
  if (lock.current || !actions.includes(action)) return;
  const validation = action === 'COMPLETE' ? evidenceError(files, order.paid_amount_cent) : '';
  if (validation) { setNotice(validation); return; }
  if (action === 'CONFIRM_COMPLETE' && !window.confirm('请核对全部交付凭证。确认收货后结束普通售后阶段，是否继续？')) return;
  if (action === 'EXTEND_RECEIPT' && !window.confirm('使用本单唯一一次 24 小时延期？额度与后续补充履约共享。')) return;
  const suffix = ({ START: 'start', COMPLETE: 'complete', CONFIRM_COMPLETE: 'confirm', EXTEND_RECEIPT: 'extend-receipt', REMIND_SELLER: 'remind', CANCEL: 'cancel' } as Record<string, string>)[action];
  if (!suffix) { navigate(action); return; }
  lock.current = true; setBusy(true);
  try { await request(`${path}/${suffix}`, { method: 'POST', body: JSON.stringify({ version: order.version, ...(action === 'COMPLETE' ? { evidence_file_ids: files.map(file => file.id) } : {}), ...(action === 'CANCEL' ? { reason: '买家主动取消订单' } : {}) }) }); await refresh(); setNotice('操作已由服务端确认'); }
  catch (error) { setNotice(businessError(error)); try { await refresh(); } catch { /* Keep error and current snapshot. */ } }
  finally { lock.current = false; setBusy(false); }
 };
 const deadline = order.auto_confirm_at ? Math.max(0, Math.ceil((Date.parse(order.auto_confirm_at) - now) / 1000)) : null;
 const labels: Record<string, string> = { PENDING_PAYMENT: '待付款', PENDING_SERVICE: '待服务', IN_SERVICE: '服务中', PENDING_BUYER_CONFIRM: '待收货', COMPLETED: '已完成', CANCELLED: '已取消', CLOSED: '已关闭' };
 const buttons: Record<string, string> = { START: '开始履约', COMPLETE: '提交履约凭证', CONFIRM_COMPLETE: '确认收货', EXTEND_RECEIPT: '延期 24 小时', REMIND_SELLER: '催促卖家', PAY: '去付款', CANCEL: '取消订单', REQUEST_REFUND: '申请基础退款', VIEW_REFUND: '查看退款', CREATE_COMPLAINT: '联系平台处理', CREATE_REVIEW: '去评价', VIEW_REVIEW: '查看评价', CONTACT_BUYER: '联系买家', VIEW_SERVICE: '查看商品', PROCESS_REFUND: '处理基础退款' };
 return <div className={`app-screen ${seller ? 'seller-order-detail-screen' : 'order-detail-screen'}`}><header className="sw-header"><button onClick={back}>返回订单列表</button><h1>{seller ? '卖家' : '买家'}订单详情</h1></header><section className="order-status-hero"><h2>{labels[order.status] ?? order.status}</h2><p>{order.product_title} · {order.sku_name} ×{order.quantity}</p><p>订单 {order.order_no} · 当前版本 {order.version}</p><p>付款后履约，无预约、无接单</p></section><section className="paper-panel order-facts"><p>订单应付 ¥{money(order.payable_amount_cent)} · 实付 ¥{money(order.paid_amount_cent)} · 已退 ¥{money(order.refunded_amount_cent)}</p><p>承诺完成：{order.fulfillment_due_at ? new Date(order.fulfillment_due_at).toLocaleString('zh-CN') : '付款成功后开始计算'}</p>{order.auto_confirm_at && <p>自动确认时间：{new Date(order.auto_confirm_at).toLocaleString('zh-CN')} · {deadline ? `剩余 ${Math.floor(deadline / 3600)} 小时 ${Math.floor(deadline % 3600 / 60)} 分` : '时限已到，等待后端任务处理'}</p>}<p>延期额度：{order.receipt_extension_used ? '已使用' : '剩余一次 24 小时'}；催促冷却以服务端可用操作为准</p>{frozen && <p role="alert">{order.evidence_review_pending ? '凭证核查中' : '售后冻结中'}，暂不能确认或自动结算</p>}{seller && <p>服务端记录收入 ¥{money(order.seller_income_cent)} · 服务费 ¥{money(order.platform_fee_cent)}（结算到账以账务记录为准）</p>}</section><OrderEvidence request={request} orderId={order.id} files={order.fulfillment_evidence ?? []} />{seller && actions.includes('COMPLETE') && <><ConnectedFiles request={request} purpose="ORDER_FULFILLMENT_IMAGE" label="履约截图：至少 5 张" selected={files.filter(file => file.file_type === 'ORDER_FULFILLMENT_IMAGE')} onChange={next => setFiles(current => [...current.filter(file => file.file_type !== 'ORDER_FULFILLMENT_IMAGE'), ...next])} /><ConnectedFiles request={request} purpose="ORDER_FULFILLMENT_VIDEO" label="连续录屏：实付 200 元起必须提交" selected={files.filter(file => file.file_type === 'ORDER_FULFILLMENT_VIDEO')} onChange={next => setFiles(current => [...current.filter(file => file.file_type !== 'ORDER_FULFILLMENT_VIDEO'), ...next])} /></>}<p role="status">{notice}</p><div className="order-detail-actions">{actions.filter(action => buttons[action]).map(action => <button key={action} disabled={busy || Boolean(frozen && ['CONFIRM_COMPLETE', 'EXTEND_RECEIPT', 'COMPLETE', 'START'].includes(action))} onClick={() => void run(action)}>{buttons[action]}</button>)}<button disabled={busy} onClick={() => void refresh().catch(error => setNotice(businessError(error)))}>刷新最新状态</button></div><p>补充履约、复杂协商与判责尚未开放；基础退款按服务端能力处理。</p></div>;
}
