'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PRODUCT_GAMES } from '../product-decisions';
import { CartoonSelect } from '../ui/CartoonSelect';
import { CartoonIcon } from '../ui/CartoonIcon';
import type { Dimension, MerchantProduct } from './model';
import { editorId, replaceDimensions, specErrors, specSummary, validPrice, validStock, coverFileError } from './product-editor-model';

export function focusProductError(root: HTMLElement | null) {
  const field = root?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? root?.querySelector<HTMLElement>('[role="alert"]');
  field?.focus({ preventScroll: true }); field?.scrollIntoView({ block: 'center', behavior: 'instant' });
}
function FieldError({ name, errors }: { name: string; errors: Record<string, string> }) {
  return errors[name] ? <small tabIndex={-1} className="seller-field-error" id={`product-error-${name}`} role="alert">{errors[name]}</small> : null;
}
export function ProductConfirm({ title, description, confirmLabel = '确认', onConfirm, onCancel }: { title: string; description: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { const focus = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => { if (timer.current) clearTimeout(timer.current); if (focus?.isConnected) focus.focus({ preventScroll: true }); }; }, []);
  const finish = (action: () => void) => {
    if (timer.current || closing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { action(); return; }
    setClosing(true); timer.current = setTimeout(action, 140);
  };
  return <dialog ref={dialog} className={`sw-product-confirm${closing ? ' is-closing' : ''}`} aria-labelledby="product-confirm-title" onCancel={e => { e.preventDefault(); finish(onCancel); }}><h2 id="product-confirm-title">{title}</h2><p>{description}</p><footer><button disabled={closing} onClick={() => finish(onCancel)}>取消</button><button disabled={closing} className="sw-primary" onClick={() => finish(onConfirm)}>{confirmLabel}</button></footer></dialog>;
}
export function ProductForm({ draft, patch, errors, openSpecs, busy, setBusy }: { draft: MerchantProduct; patch: (change: Partial<MerchantProduct>) => void; errors: Record<string, string>; openSpecs: () => void; busy: boolean; setBusy: (value: boolean) => void }) {
  const [uploadError, setUploadError] = useState('');
  const uploading = useRef(false), retryFiles = useRef<{files:File[];detail:boolean}|null>(null);
  const readImages = async (files:File[], detail=false) => {
    if(uploading.current)return;retryFiles.current={files,detail};
    const invalid=files.map(coverFileError).find(Boolean);if(invalid){setUploadError(invalid);return;}
    uploading.current=true;setBusy(true);setUploadError('');
    try { const images=await Promise.all(files.map(file=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('图片读取失败，填写内容已保留。'));reader.readAsDataURL(file)})));
      if(detail)patch({detailImages:[...(draft.detailImages??[]),...images]});
      else {const all=[...(draft.images??(draft.cover?[draft.cover]:[])),...images];patch({images:all,cover:all[0]??''})}
    }catch(e){setUploadError(e instanceof Error?e.message:'读取失败，请重试')}finally{uploading.current=false;setBusy(false)}
  };
  const images=draft.images??(draft.cover?[draft.cover]:[]);
  const field = (name: string) => ({ 'aria-invalid': !!errors[name], 'aria-describedby': errors[name] ? `product-error-${name}` : undefined });
  return <>
    <section className="sw-panel sw-product-form">
      <div className="sw-section-title"><h2>商品信息</h2><span>标注“必填”的项目需完成</span></div>
      <div className="sw-compact-field"><span>游戏分类</span><CartoonSelect aria-label="商品分类" value={draft.category} onChange={e => patch({ category: e.target.value })}>{PRODUCT_GAMES.map(v => <option key={v}>{v}</option>)}</CartoonSelect></div>

      <label className="sw-upload">{busy?'正在读取图片…':'添加商品图片'}<input disabled={busy} multiple aria-label="添加商品图片" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const files=Array.from(e.target.files??[]);if(files.length)void readImages(files);e.target.value=''}}/></label>
      <p className="sw-hint">第一张作为封面。JPG、PNG、WebP，每张最大 5MB；当前为本地预览。</p>
      <div className="sw-image-list">{images.map((src,i)=><div key={i}><img src={src} alt={i===0?'商品封面':`商品图片 ${i+1}`}/><button type="button" disabled={busy} onClick={()=>{const next=images.filter((_,j)=>i!==j);patch({images:next,cover:next[0]??''})}}>移除第 {i+1} 张</button></div>)}</div>
      {uploadError&&<p className="seller-field-error" role="alert">{uploadError}<button onClick={()=>{if(retryFiles.current)void readImages(retryFiles.current.files,retryFiles.current.detail)}}>重试</button></p>}
      <label className="sw-field"><span className="sw-field-heading"><span>商品标题 <small>必填</small></span><small>{draft.title.length}/60</small></span><textarea {...field('title')} aria-label="商品标题" className="sw-title-input" maxLength={60} value={draft.title} onChange={e => patch({ title: e.target.value })} placeholder="例如：和平精英 · 经典组队陪玩" /><FieldError name="title" errors={errors} /></label>
      <label className="sw-field">商品描述 <small>必填</small><textarea {...field('description')} aria-label="服务介绍" value={draft.description} maxLength={2000} onChange={e => patch({ description: e.target.value })} placeholder="说明提供的服务内容和适用玩家" /><FieldError name="description" errors={errors} /></label>
      <label className="sw-upload">添加详情图片（选填）<input disabled={busy} multiple aria-label="添加详情图片" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const files=Array.from(e.target.files??[]);if(files.length)void readImages(files,true);e.target.value=''}}/></label><div className="sw-image-list">{draft.detailImages?.map((src,i)=><div key={i}><img src={src} alt={`详情图片 ${i+1}`}/><button disabled={busy} onClick={()=>patch({detailImages:draft.detailImages?.filter((_,j)=>j!==i)})}>移除第 {i+1} 张</button></div>)}</div>
      {!draft.dimensions.length && <label className="sw-field">价格（元）<input aria-label="单价商品价格" inputMode="decimal" value={draft.variants[0]?.price ?? ''} onChange={e=>patch({variants:[{...draft.variants[0],key:'单价商品',price:e.target.value,stock:draft.variants[0]?.stock ?? '1'}]})}/></label>}
      <button className="sw-setting-row sw-spec-summary" {...field('specs')} onClick={openSpecs} disabled={busy}><span><b>{draft.dimensions.length ? "规格与价格" : "添加多规格 / 管理名额"}</b><small>{specSummary(draft)}</small></span><span>设置 ›</span></button><FieldError name="specs" errors={errors} />
    </section>
    <section className="sw-panel sw-product-form"><h2>服务约定</h2>
      <label className="sw-field">承诺完成时限 <small>必填 · 小时</small><input {...field('hours')} aria-label="承诺完成时限（小时）" inputMode="numeric" value={draft.hours} onChange={e => patch({ hours: e.target.value })} /><FieldError name="hours" errors={errors} /><small>自付款成功起计算，1–168 小时。</small></label>

      <label className="sw-field">购买须知 <small>选填</small><textarea value={draft.notice} maxLength={2000} onChange={e => patch({ notice: e.target.value })} /></label>
    </section>
  </>;
}
export function SpecEditor({ draft, patch, confirm }: { draft: MerchantProduct; patch: (change: Partial<MerchantProduct>) => void; confirm: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [bulkPrice, setBulkPrice] = useState(''), [bulkStock, setBulkStock] = useState('');
  const [pending, setPending] = useState<{ title: string; description: string; action: () => void } | null>(null);
  const [note, setNote] = useState('');
  useLayoutEffect(() => { if (Object.keys(errors).length) focusProductError(root.current); }, [errors]);
  useEffect(() => { if (note) { const timer = setTimeout(() => setNote(''), 3000); return () => clearTimeout(timer); } }, [note]);
  const attrs = (name: string) => ({ 'aria-invalid': !!errors[name], 'aria-describedby': errors[name] ? `product-error-${name}` : undefined });
  const changeDimensions = (dimensions: Dimension[], destructive = false) => {
    const next = replaceDimensions(draft, dimensions);
    const lost = draft.variants.filter(v => !next.variants.some(row => row.id === v.id) && (v.price || v.stock));
    const action = () => { patch(next); setErrors({}); };
    if (destructive && lost.length) setPending({ title: '移除规格及组合？', description: `将移除 ${lost.length} 个已填写价格或名额的组合。尚未保存到商品；返回时可以放弃本次规格修改。`, action }); else action();
  };
  const updateDimension = (index: number, change: Partial<Dimension>) => changeDimensions(draft.dimensions.map((d,i) => i === index ? { ...d, ...change } : d));
  const applyBulk = () => {
    const invalid: Record<string,string> = {};
    if (bulkPrice && !validPrice(bulkPrice)) invalid.bulkPrice = '价格须大于 0，最多两位小数。';
    if (bulkStock && !validStock(bulkStock)) invalid.bulkStock = '名额须为非负整数。';
    setErrors(invalid); if (Object.keys(invalid).length || (!bulkPrice && !bulkStock)) return;
    setPending({ title: '应用到全部组合？', description: `将覆盖全部 ${draft.variants.length} 个组合的${[bulkPrice ? '价格' : '', bulkStock ? '名额' : ''].filter(Boolean).join('和')}；未填写的字段保持原值。`, action: () => { patch({ variants: draft.variants.map(v => ({ ...v, price: bulkPrice || v.price, stock: bulkStock || v.stock })) }); setNote('已应用到规格表，确认规格后返回商品。'); } });
  };
  return <div ref={root} className="sw-spec-editor">
    <section className="sw-panel"><div className="sw-section-title"><h2>规格选项</h2><span>最多 3 个维度</span></div>
      {draft.dimensions.map((d,i) => <div className="sw-spec-dimension" key={d.id}>
        <div className="sw-dimension-heading"><label className="sw-field">规格名称<input {...attrs(`dimension-${i}`)} aria-label={`规格名称 ${i+1}`} maxLength={20} value={d.name} onChange={e => updateDimension(i, { name:e.target.value })} /><FieldError name={`dimension-${i}`} errors={errors} /></label><button aria-label={`删除规格 ${d.name}`} onClick={() => changeDimensions(draft.dimensions.filter((_,j) => i!==j), true)}>删除</button></div>
        <div className="sw-spec-options">{d.options?.map((o,j) => <div className="sw-spec-option" key={o.id}><input {...attrs(`option-${i}-${j}`)} aria-label={`${d.name || `规格${i+1}`}选项 ${j+1}`} placeholder="选项名称" maxLength={100} value={o.label} onChange={e => updateDimension(i, { options: d.options!.map((r,k) => k===j ? { ...r,label:e.target.value } : r) })} /><button aria-label={`删除选项 ${o.label || j+1}`} onClick={() => changeDimensions(draft.dimensions.map((r,k) => k===i ? {...r,options:r.options!.filter((_,k) => k!==j)} : r), true)}><CartoonIcon kind="close" /></button><FieldError name={`option-${i}-${j}`} errors={errors} /></div>)}</div>
        <button className="sw-text-button" onClick={() => updateDimension(i,{options:[...d.options!,{id:editorId(),label:''}]})}>＋ 添加选项</button>
      </div>)}
      <button className="sw-text-button" disabled={draft.dimensions.length>=3} onClick={() => changeDimensions([...draft.dimensions,{id:editorId(),name:'',values:'',options:[{id:editorId(),label:''}]}])}>＋ 添加规格维度</button>
    </section>
    <section className="sw-panel"><details className="sw-batch-details"><summary>批量设置价格与名额 <small>全部 {draft.variants.length} 个组合</small></summary><p className="sw-hint">填写的字段将覆盖全部组合，留空的字段保持原值。</p><div className="sw-bulk"><label className="sw-field">价格（元）<input {...attrs('bulkPrice')} inputMode="decimal" aria-label="批量价格" value={bulkPrice} onChange={e=>setBulkPrice(e.target.value)} placeholder="不填则保留" /><FieldError name="bulkPrice" errors={errors} /></label><label className="sw-field">可售名额<input {...attrs('bulkStock')} inputMode="numeric" aria-label="批量名额" value={bulkStock} onChange={e=>setBulkStock(e.target.value)} placeholder="不填则保留" /><FieldError name="bulkStock" errors={errors} /></label></div><button className="sw-text-button" disabled={!draft.variants.length || (!bulkPrice && !bulkStock)} onClick={applyBulk}>应用到全部组合</button></details></section>
    <section className="sw-panel"><h2>组合定价 · {draft.variants.length} 个组合</h2><p className="sw-hint">每个组合独立设置价格与可售名额。{draft.variants.some(v => !v.unit) && '计价单位未单独设置，请在规格名称中说明。'}</p><FieldError name="specs" errors={errors} />
      {draft.variants.length<=100 && draft.variants.map((v,i)=><div className="sw-variant" key={v.id}><b>{v.key || '请先填写规格选项'}</b>{v.unit && <small className="sw-unit-note">计价单位：{v.unit}</small>}<div className="sw-bulk">{(['price','stock'] as const).map(field=><label className="sw-field" key={field}>{field==='price'?'价格（元）':'可售名额'}<input {...attrs(`${field}-${i}`)} inputMode={field==='price'?'decimal':'numeric'} aria-label={`${v.key}${field==='price'?'价格':'名额'}`} value={v[field]} onChange={e=>patch({variants:draft.variants.map((row,j)=>i===j?{...row,[field]:e.target.value}:row)})} /><FieldError name={`${field}-${i}`} errors={errors} /></label>)}</div></div>)}
    </section>
    <div className="sw-sticky-actions"><button className="sw-primary" onClick={()=>{const issues=specErrors(draft);setErrors(issues);if(!Object.keys(issues).length)confirm();}}>确认规格</button></div>
    {note && <div role="status" className="seller-feedback">{note}</div>}
    {pending && <ProductConfirm title={pending.title} description={pending.description} onCancel={()=>setPending(null)} onConfirm={()=>{pending.action();setPending(null);}} />}
  </div>;
}
