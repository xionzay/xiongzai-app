'use client';
import { useEffect, useRef, useState } from 'react';
import { CartoonIcon } from './ui/CartoonIcon';
import { buyerIdentityEntry, type BuyerSellerProfile } from './buyer-mine-model';
import type { Request } from './storefront/model';

export async function identitySwitchTarget(role: 'buyer' | 'seller', preview: boolean, userId: string | undefined, request: Request, signal?: AbortSignal) {
  if (role === 'seller') return 'home';
  if (preview) return 'seller';
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

export function IdentitySwitchScreen({ role, preview, userId, request, onBack, onNavigate }: {
  role: 'buyer' | 'seller'; preview: boolean; userId?: string; request: Request;
  onBack: () => void; onNavigate: (page: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, [userId, role]);
  const changeRole = async () => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError('');
    try {
      const target = await identitySwitchTarget(role, preview, userId, request, controller.signal);
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
      <button type="button" className="identity-switch-action" disabled={busy} aria-busy={busy} onClick={() => void changeRole()}>{busy ? '身份切换中…' : `切换为“${role === 'buyer' ? '卖家' : '买家'}”身份`}</button>
      <p className="identity-switch-note">{preview ? '设计预览 · 切换仅用于查看两端页面' : role === 'buyer' ? '尚未入驻的账号将进入陪玩申请流程' : '同一账号，订单与资料继续保留'}</p>
      {error && <p role="alert" className="identity-switch-error">{error}</p>}
    </section>
  </div>;
}
