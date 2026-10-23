"use client";
/* User-uploaded voice introductions have no supplied caption track; never invent a transcript. */
/* eslint-disable jsx-a11y/media-has-caption */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CartoonIcon } from '../ui/CartoonIcon';
import { CatalogImage } from '../CatalogImage';
import { initialListState, priceLabel, errorMessage, type ListState, type Profile, type Product, type Request, type Review } from './model';

export function PublicStorefront({ sellerId, viewerId, request, state, onBack, onEdit, onProduct, onContact, onLogin, onRules, notify }: {
  sellerId: string; viewerId?: string; request: Request; state: { read: (id:string)=>ListState|undefined; write:(id:string,value:ListState)=>void };
  onBack: () => void; onEdit: () => void; onProduct: (product: Product) => void; onContact: (sellerId: string) => Promise<void>; onLogin: () => void; onRules: () => void; notify: (message: string) => void;
}) {
  const [seller, setSeller] = useState<(Profile & { services: Product[] }) | null>(null);
  const [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [list, setList] = useState<ListState>(() => state.read(sellerId) ?? initialListState());
  const [favorite, setFavorite] = useState<boolean | null>(null), [busy, setBusy] = useState(false), [reviewBusy, setReviewBusy] = useState(false), [reviewError, setReviewError] = useState('');
  const lock = useRef(false), screen = useRef<HTMLDivElement>(null);
  const [voice, setVoice] = useState('');
  const owner = Boolean(viewerId && seller?.user_id === viewerId);
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(()=>{if(!controller.signal.aborted){setError('');setVoice('');}}); request<Profile & { services: Product[] }>(`/companions/${encodeURIComponent(sellerId)}`, { signal: controller.signal }).then(setSeller).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); }); return () => controller.abort(); }, [sellerId, request, retry]);
  useEffect(() => { if (!viewerId || owner) return; let active = true; request<{ favorited: boolean }>(`/favorites/SELLER/${sellerId}`).then(r => { if (active) setFavorite(r.favorited); }).catch(() => { if (active) setFavorite(null); }); return () => { active = false; }; }, [sellerId, viewerId, owner, request]);
  useEffect(() => { state.write(sellerId,list); }, [list, sellerId, state]);
  useLayoutEffect(() => { if (seller && screen.current) screen.current.scrollTop = state.read(sellerId)?.scroll ?? 0; }, [seller, sellerId, state]);
  const remember = () => state.write(sellerId,{...list,scroll:screen.current?.scrollTop??0});
  const loadReviews = async (reset = false) => {
    if (reviewBusy) return; setReviewBusy(true); setReviewError('');
    try { const data = await request<{ items: Review[]; next_cursor: string | null }>(`/companions/${sellerId}/reviews?limit=20${!reset && list.cursor ? `&cursor=${encodeURIComponent(list.cursor)}` : ''}`); setList(s => ({ ...s, reviews: reset ? data.items : [...s.reviews, ...data.items.filter(r => !s.reviews.some(old => old.id === r.id))], cursor: data.next_cursor, reviewsLoaded: true })); }
    catch (e) { setReviewError(errorMessage(e)); } finally { setReviewBusy(false); }
  };
  useEffect(() => { if (list.tab === '评价' && !list.reviewsLoaded) void Promise.resolve().then(()=>loadReviews(true)); }, [list.tab]); // Loaded pages stay with the storefront's navigation state.
  const action = async (callback: () => Promise<void>) => { if (lock.current) return; lock.current = true; setBusy(true); try { await callback(); } catch (e) { notify(errorMessage(e)); } finally { setBusy(false); lock.current = false; } };
  const toggleFavorite = () => { if (!viewerId) return onLogin(); void action(async () => { const current = favorite === null ? (await request<{ favorited: boolean }>(`/favorites/SELLER/${sellerId}`)).favorited : favorite; const result = await request<{ favorited: boolean }>(`/favorites/SELLER/${sellerId}`, { method: current ? 'DELETE' : 'PUT' }); setFavorite(result.favorited); notify(result.favorited ? '已收藏，可在我的收藏查看' : '已取消收藏'); }); };
  const share = () => void action(async () => { const url = new URL('/', window.location.origin); url.searchParams.set('seller', sellerId); if (navigator.share) { try { await navigator.share({ title: seller?.seller_nickname ?? '熊崽电竞卖家主页', url: url.href }); } catch (e) { if ((e as Error).name !== 'AbortError') throw e; } } else { await navigator.clipboard.writeText(url.href); notify('主页链接已复制'); } });
  const products = (seller?.services ?? []).filter(p => p.status === 'ON_SALE');
  return <div className="app-screen sf-screen" ref={screen} onScroll={remember}>
    <header className="sf-header"><button aria-label="返回" onClick={() => { remember(); onBack(); }}><CartoonIcon kind="back" /></button><h1>店铺主页</h1><button disabled={busy || !seller} onClick={share} aria-label="分享主页"><CartoonIcon kind="share" /></button></header>
    {error ? <div className="sf-empty" role="alert"><b>主页暂不可用</b><p>{error}</p><button onClick={() => setRetry(n => n + 1)}>重新加载</button></div> : !seller ? <p className="sf-empty" role="status">正在读取主页…</p> : <>
      <section className="sf-identity"><CatalogImage fileId={seller.seller_avatar_file_id} kind="avatar" alt="卖家头像" /><div><h2>{seller.seller_nickname}</h2><span className="sf-status"><i className={seller.accepting_orders ? 'open' : ''} />{seller.accepting_orders ? '接待中' : '暂停接待'}</span></div><button className="sf-outline" disabled={busy} onClick={owner ? () => { remember(); onEdit(); } : toggleFavorite}>{owner ? '编辑主页' : favorite ? '已收藏' : '收藏'}</button></section>
      <div className="sf-metrics"><button onClick={() => setList(s => ({ ...s, tab: '评价' }))}><b>{seller.review_count ? Number(seller.rating_avg).toFixed(1) : '暂无'}</b>{seller.review_count ? '评分' : '评价'}</button><button onClick={() => setList(s => ({ ...s, tab: '评价' }))}><b>{seller.review_count}</b>条评价</button><span><b>{seller.completed_order_count}</b>完成订单</span><button className="sf-link" onClick={() => { remember(); onRules(); }}>交易保障 <CartoonIcon kind="back" className="toon-glyph toon-glyph-right" /></button></div>
      <section className="sf-about"><p className={list.expanded ? '' : 'sf-clamp'}>{seller.introduction || '卖家还没有填写介绍'}</p>{(seller.introduction?.length ?? 0) > 50 && <button className="sf-link" onClick={() => setList(s => ({ ...s, expanded: !s.expanded }))}>{list.expanded ? '收起' : '展开介绍'}</button>}<div className="sf-tags">{[seller.preferred_mode, seller.play_style].filter(Boolean).map(text => <span key={text}>{text}</span>)}</div>{seller.voice_file_id && <><button className="sf-link" disabled={busy} onClick={() => void action(async () => { const result = await request<{ access: { url: string } }>(`/companions/${seller.id}/voice`); setVoice(result.access.url); })}><CartoonIcon kind="service" /> 试听声音</button>{voice && <audio src={voice} controls autoPlay onError={() => notify('语音加载失败，请重新试听')} />}</>}</section>
      <div className="sf-public-tabs" role="tablist" aria-label="店铺栏目">{(['服务','评价','资料'] as const).map(tab=><button key={tab} role="tab" aria-selected={list.tab===tab} onClick={()=>setList(s=>({...s,tab}))}>{({服务:'商品',评价:'评价',资料:'介绍'})[tab]}</button>)}</div>
      {list.tab === '资料' && <section className="sf-about"><h2>店铺介绍</h2><p>{seller.introduction || '卖家还没有填写介绍'}</p><h3>主营游戏</h3><p>{seller.preferred_mode || '暂未填写'}</p><p>{seller.play_style}</p></section>}
      {list.tab === '服务' && <section className="sf-services" aria-label="在售商品">{!products.length ? <div className="sf-empty">暂无在售商品</div> : <div className="sf-grid">{products.map(p => { const price = priceLabel(p); return <button className="sf-product" key={p.id} onClick={() => { remember(); onProduct(p); }}><CatalogImage fileId={p.cover_file_id} alt={p.title} /><h3>{p.title}</h3><small>{price.unit}</small><strong>¥{price.amount}<em>{price.suffix}</em></strong></button>; })}</div>}</section>}
      {list.tab === '评价' && <section className="sf-reviews">{list.reviews.map(r => <article key={r.id}><header><b>{r.display_nickname}</b><time>{new Date(r.created_at).toLocaleDateString('zh-CN')}</time></header><span className="sf-rating">{r.rating} 分</span><p>{r.content || '买家未填写文字评价'}</p><small>{r.service_title}</small></article>)}{reviewError && <p role="alert">{reviewError}<button onClick={() => void loadReviews(!list.reviewsLoaded)}>重试</button></p>}{reviewBusy && <p role="status">正在加载评价…</p>}{list.reviewsLoaded && !list.reviews.length && <p className="sf-empty">暂无评价，完成交易后会展示买家的真实反馈。</p>}{list.cursor && <button className="sf-outline" disabled={reviewBusy} onClick={() => void loadReviews()}>加载更多评价</button>}</section>}
      {!owner && <footer className="sf-footer"><span>了解服务后再下单</span><button className="sf-primary" disabled={busy} onClick={() => { if (!viewerId) return onLogin(); remember(); void action(() => onContact(seller.id)); }}>{busy ? '处理中…' : '联系卖家'}</button></footer>}
    </>}
  </div>;
}
