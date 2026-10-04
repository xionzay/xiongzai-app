'use client';
import { useEffect, useState } from 'react';
import { CartoonIcon } from './ui/CartoonIcon';
import { buyerIdentityEntry, type BuyerSellerProfile } from './buyer-mine-model';
import { fieldLabels, type Request } from './storefront/model';

type Props = { request: Request; userId?: string; onOpen?: () => void; onBack?: () => void; onNavigate: (page: string) => void; detail?: boolean };
export function BuyerIdentity({ request, userId, onOpen, onBack, onNavigate, detail = false }: Props) {
  const [result, setResult] = useState<{ userId: string; profile: BuyerSellerProfile | null; error?: string }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    setResult(undefined);
    void request<BuyerSellerProfile>('/seller/profile').then(profile => { if (active) setResult({ userId, profile }); }).catch(error => {
      if (active) setResult({ userId, profile: null, ...(error?.code === 'SELLER_NOT_FOUND' ? {} : { error: '身份状态加载失败，请重试' }) });
    });
    return () => { active = false; };
  }, [request, userId, retry]);
  const current = result?.userId === userId ? result : undefined;
  const entry = buyerIdentityEntry(current?.profile ?? null);
  const ready = Boolean(userId && current && !current.error);
  const title = !userId ? '登录后查看陪玩身份' : !ready ? '陪玩身份' : entry.title;
  const note = !userId ? '申请入驻或查看已有资格' : current?.error ?? (!current ? '正在读取身份状态…' : entry.note);
  const open = () => { if (!userId) onNavigate('auth'); else if (current?.error) setRetry(n => n + 1); else if (ready && entry.target === 'seller') onNavigate('seller'); else if (ready) onOpen?.(); };
  if (!detail) return <button type="button" className="buyer-identity-entry" disabled={Boolean(userId && !current)} onClick={open}><i className="app-cartoon-icon menu-symbol" aria-hidden="true"><CartoonIcon kind="product" /></i><span><b>{title}</b><small>{note}</small></span><em aria-hidden="true">›</em></button>;
  return <div className="app-screen buyer-identity-screen"><header className="buyer-identity-header"><button type="button" aria-label="返回" onClick={onBack}><CartoonIcon kind="back" /></button><h1>陪玩身份</h1><span /></header><section className="buyer-identity-content"><h2>{title}</h2><p role={current?.error ? 'alert' : undefined}>{note}</p>
    {current?.profile?.suspended_reason && <p>原因：{current.profile.suspended_reason}</p>}
    {current?.profile?.latest_application?.rejection_reason && <p>审核意见：{current.profile.latest_application.rejection_reason}</p>}
    {current?.profile?.latest_application?.required_fields?.length ? <p>需补充：{current.profile.latest_application.required_fields.map(key => fieldLabels[key as keyof typeof fieldLabels] ?? key).join('、')}</p> : null}
    {current?.profile?.latest_application?.submitted_at && <p>提交时间：{new Date(current.profile.latest_application.submitted_at).toLocaleString('zh-CN')}</p>}
    {!userId ? <button type="button" onClick={() => onNavigate('auth')}>登录账号</button> : <>
      {ready && entry.action && entry.target && <button type="button" onClick={() => onNavigate(entry.target!)}>{entry.action}</button>}
      <button type="button" disabled={!current} onClick={() => setRetry(n => n + 1)}>{current?.error ? '重新加载' : '刷新状态'}</button>
    </>}
  </section></div>;
}
