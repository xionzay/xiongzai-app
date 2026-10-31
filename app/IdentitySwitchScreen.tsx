'use client';
import { useEffect, useRef, useState } from 'react';
import { CartoonIcon } from './ui/CartoonIcon';
import { buyerIdentityEntry, type BuyerSellerProfile } from './buyer-mine-model';
import type { Request } from './storefront/model';

export async function identitySwitchTarget(role: 'buyer' | 'seller', _preview: boolean, userId: string | undefined, request: Request, signal?: AbortSignal) {
  if (role === 'seller') return 'home';
  if (!userId) return 'auth';
  let profile: BuyerSellerProfile | null;
  try { profile = await request<BuyerSellerProfile>('/seller/profile', { signal }); }
  catch (error) {
    if ((error as { code?: string }).code !== 'SELLER_NOT_FOUND') throw error;
    profile = null;
  }
  // Suspended or pending sellers see their actual qualification status, not the workbench.
  return buyerIdentityEntry(profile).target ?? 'buyerSellerIdentity';
}

export function identitySwitchPresentation(profile: BuyerSellerProfile | null) {
  const entry = buyerIdentityEntry(profile);
  if (entry.target === 'seller') return { label: '切换为“卖家”身份', note: '入驻审核已通过，可以切换卖家身份' };
  if (!profile) return { label: '申请入驻成为卖家', note: '完成入驻并通过平台审核后，才可以切换卖家身份' };
  if (profile.status === 'SUSPENDED' || profile.status === 'BANNED') return { label: '查看资格状态', note: '卖家资格已暂停或封禁，当前不能切换卖家身份' };
  if (entry.target === 'sellerApplyForm') return { label: entry.action === '继续填写申请' ? '继续入驻申请' : entry.action ?? '继续入驻申请', note: '请完成入驻资料，通过平台审核后才可以切换卖家身份' };
  return { label: '查看审核进度', note: '入驻审核通过前，不能切换卖家身份' };
}

export function IdentitySwitchScreen({ role, userId, request, onBack, onNavigate }: {
  role: 'buyer' | 'seller'; userId?: string; request: Request;
  onBack: () => void; onNavigate: (page: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ userId: string; profile: BuyerSellerProfile | null; error?: string }>();
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (userId && role === 'buyer') {
      void request<BuyerSellerProfile>('/seller/profile', { signal: controller.signal }).then(profile => {
        if (!controller.signal.aborted) setResult({ userId, profile });
      }).catch(cause => {
        if (!controller.signal.aborted) setResult({ userId, profile: null, ...((cause as { code?: string }).code === 'SELLER_NOT_FOUND' ? {} : { error: '身份状态加载失败，请重试' }) });
      });
    }
    return () => { controller.abort(); pending.current?.abort(); pending.current = null; };
  }, [userId, role, request]);
  const current = result?.userId === userId ? result : undefined;
  const loading = Boolean(userId) && role === 'buyer' && !current;
  const presentation = identitySwitchPresentation(current?.profile ?? null);
  const label = role === 'seller' ? '切换为“买家”身份' : !userId ? '登录后申请入驻或切换身份' : loading ? '正在读取入驻状态…' : current?.error ? '重新读取入驻状态' : presentation.label;
  const changeRole = async () => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError('');
    try {
      const target = await identitySwitchTarget(role, false, userId, request, controller.signal);
      if (!controller.signal.aborted) onNavigate(target);
    } catch {
      if (!controller.signal.aborted) setError('暂时无法读取身份状态，请重试。');
    } finally {
      if (!controller.signal.aborted) { pending.current = null; setBusy(false); }
    }
  };
  return <div className="app-screen identity-switch-screen">
    <header className="buyer-identity-header"><button type="button" aria-label="返回设置" onClick={onBack}><CartoonIcon kind="back" /></button><h1>切换身份</h1><span /></header>
    <section className="identity-switch-content">
      <div className="identity-switch-art"><img src="/assets/xiongzai-icon.png" alt="熊崽电竞" /><span><CartoonIcon kind={role === 'buyer' ? 'home' : 'product'} /></span></div>
      <h2>你当前的身份是“{role === 'buyer' ? '买家' : '卖家'}”</h2>
      <p>{role === 'buyer' ? '找陪玩、下单，管理你的购买订单' : '管理服务、处理订单，查看经营收益'}</p>
      <button type="button" className="identity-switch-action" disabled={busy || loading} aria-busy={busy || loading} onClick={() => void changeRole()}>{busy ? '正在确认身份…' : label}</button>
      <p className="identity-switch-note">{role === 'seller' ? '同一账号，订单与资料继续保留' : !userId ? '请先登录；入驻审核通过后才能切换卖家身份' : loading ? '正在核实平台审核结果' : current?.error ?? presentation.note}</p>
      {error && <p role="alert" className="identity-switch-error">{error}</p>}
    </section>
  </div>;
}
