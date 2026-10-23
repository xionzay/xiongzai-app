'use client';
import { useRef, useState } from 'react';
import { ConnectedFiles } from '../ConnectedFiles';
import { businessError, gameNames, hoursToSeconds, money, yuanInputToCent, type BusinessFile, type Game, type Product, type Request } from '../connected-commerce';

export function ConnectedProductForm({ initial, back, request }: { initial?: Product; back: () => void; request: Request }) {
 const [product, setProduct] = useState(initial), record = useRef(initial);
 const remember = (value: Product) => { record.current = value; setProduct(value); };
 const [title, setTitle] = useState(initial?.title ?? ''), [description, setDescription] = useState(initial?.description ?? '');
 const [game, setGame] = useState<Game | ''>(initial?.game ?? ''), [hours, setHours] = useState(initial?.fulfillment_seconds ? String(initial.fulfillment_seconds / 3600) : '');
 const [mode, setMode] = useState<'SINGLE' | 'MULTI'>(initial?.pricing_mode ?? 'SINGLE'), [price, setPrice] = useState(initial?.skus?.[0] ? money(initial.skus[0].price_cent) : '');
 const [specs, setSpecs] = useState<{ id?: string; name: string; price: string; version?: number }[]>(() => initial?.pricing_mode === 'MULTI' ? (initial.skus ?? []).filter(sku => sku.status !== 'DELETED').map(sku => ({ id: sku.id, name: sku.sku_name, price: money(sku.price_cent), version: sku.version })) : []);
 const [images, setImages] = useState(() => initial?.images ?? []), [gallery, setGallery] = useState<BusinessFile[]>([]), [details, setDetails] = useState<BusinessFile[]>([]);
 const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [conflict, setConflict] = useState(false); const lock = useRef(false);
 const legacy = Boolean(initial && !initial.game), editable = !product || ['DRAFT', 'OFF_SALE', 'REVIEW_REJECTED'].includes(product.status);
 const save = async (submit: boolean) => {
  if (lock.current || !editable || conflict) return;
  let seconds: number | undefined, cents: string | undefined;
  try { if (!legacy) { if (!game) { setNotice('请选择游戏'); return; } seconds = hoursToSeconds(hours); if (mode === 'SINGLE') cents = yuanInputToCent(price); else { if (!specs.length || specs.some(sku => !sku.name.trim())) { setNotice('多规格须填写名称与价格'); return; } specs.forEach(sku => yuanInputToCent(sku.price)); } } } catch (error) { setNotice(error instanceof Error ? error.message : '请检查填写内容'); return; }
  if (title.trim().length < 4 || description.trim().length < 10) { setNotice('标题至少 4 字，说明至少 10 字'); return; }
  lock.current = true; setBusy(true); setNotice('');
  try {
   const body = { title, description, ...(legacy ? {} : { game, fulfillment_seconds: seconds, pricing_mode: mode, ...(cents ? { price_cent: cents } : {}) }) };
   const previous = record.current;
   let current = await request<Product>(previous ? `/seller/services/${previous.id}` : '/seller/services', { method: previous ? 'PATCH' : 'POST', body: JSON.stringify({ ...body, ...(previous ? { version: previous.version } : {}) }) });
   remember(current);
   if (!legacy && mode === 'MULTI') {
    for (const sku of specs) {
     const saved = await request<{ id: string; version: number }>(`/seller/services/${current.id}/skus${sku.id ? `/${sku.id}` : ''}`, { method: sku.id ? 'PATCH' : 'POST', body: JSON.stringify({ sku_name: sku.name, price_cent: yuanInputToCent(sku.price), ...(sku.id ? { version: sku.version } : {}) }) });
     setSpecs(rows => rows.map(row => row === sku ? { ...row, id: saved.id, version: saved.version } : row));
    }
    current = await request<Product>(`/seller/services/${current.id}`); remember(current);
   }
   const next = [...images, ...gallery.filter(file => !images.some(image => image.file_id === file.id)).map(file => ({ file_id: file.id, image_kind: 'GALLERY' as const, sort_order: 0, is_cover: false })), ...details.filter(file => !images.some(image => image.file_id === file.id) && !gallery.some(other => other.id === file.id)).map(file => ({ file_id: file.id, image_kind: 'DETAIL' as const, sort_order: 0, is_cover: false }))];
   const first = next.find(image => image.image_kind !== 'DETAIL');
   await request(`/seller/services/${current.id}/images`, { method: 'PUT', body: JSON.stringify({ version: current.version, images: next.map((image, index) => ({ file_id: image.file_id, image_kind: image.image_kind ?? 'GALLERY', is_cover: image === first, sort_order: index })) }) });
   current = await request<Product>(`/seller/services/${current.id}`); remember(current); setImages(current.images ?? []); setGallery([]); setDetails([]);
   if (submit) { await request(`/seller/services/${current.id}/submit-review`, { method: 'POST', body: JSON.stringify({ version: current.version }) }); remember(await request<Product>(`/seller/services/${current.id}`)); }
   setNotice(submit ? '已提交商品审核，通过后才公开上架' : '草稿已真实保存');
  } catch (error) { setNotice(businessError(error)); if (error && typeof error === 'object' && 'code' in error && error.code === 'RESOURCE_VERSION_CONFLICT') setConflict(true); }
  finally { lock.current = false; setBusy(false); }
 };
 return <div className="app-screen seller-workbench sw-product-focus"><header className="sw-header"><button type="button" onClick={back}>返回商品管理</button><h1>{initial ? '编辑商品' : '发布商品'}</h1></header><p role="status">{product ? `${({DRAFT:"草稿",PENDING_REVIEW:"待审核",REVIEW_REJECTED:"审核驳回",ON_SALE:"在售",OFF_SALE:"已下架",ADMIN_OFF_SALE:"平台下架",DELETED:"已删除"} as Record<string,string>)[product.status]??"状态待确认"} · 版本 ${product.version}` : '新商品草稿'} · 图片与商品分别人工审核</p>{notice && <p role="alert">{notice}</p>}{conflict && <button onClick={back}>返回列表重新读取最新版本</button>}{!editable && <p>在售商品须先下架再编辑；审核中的版本不可修改。</p>}{product?.status === 'ON_SALE' && <button disabled={busy} onClick={async () => { if (lock.current) return; lock.current = true; setBusy(true); try { await request(`/seller/services/${product.id}/off-sale`, { method: 'POST', body: JSON.stringify({ version: product.version }) }); remember(await request<Product>(`/seller/services/${product.id}`)); } catch (error) { setNotice(businessError(error)); } finally { lock.current = false; setBusy(false); } }}>先下架再编辑</button>}<fieldset disabled={busy || !editable || conflict} className="form-panel"><label>商品标题<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} /></label><label>商品说明<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={5000} /></label>{legacy ? <p>存量预约商品：保留原游戏、期限和规格，不自动转新规则。</p> : <><label>游戏<select aria-label="游戏" value={game} onChange={event => setGame(event.target.value as Game)}><option value="">请选择游戏</option>{Object.entries(gameNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>支付后完成时限（小时，最长 168）<input value={hours} inputMode="decimal" onChange={event => setHours(event.target.value)} /></label><label>定价模式<select value={mode} disabled={Boolean(product)} onChange={event => setMode(event.target.value as 'SINGLE' | 'MULTI')}><option value="SINGLE">默认单价</option><option value="MULTI">多规格</option></select></label>{mode === 'SINGLE' ? <label>默认价格（元）<input inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} /></label> : <>{specs.map((sku, index) => <div key={sku.id ?? index}><label>规格名称<input value={sku.name} onChange={event => setSpecs(rows => rows.map((row, i) => i === index ? { ...row, name: event.target.value } : row))} /></label><label>规格价格（元）<input inputMode="decimal" value={sku.price} onChange={event => setSpecs(rows => rows.map((row, i) => i === index ? { ...row, price: event.target.value } : row))} /></label></div>)}<button type="button" onClick={() => setSpecs(rows => [...rows, { name: '', price: '' }])}>添加规格</button></>}</>}{images.map((image, index) => <div key={image.file_id}>{image.image_kind === 'DETAIL' ? '详情图' : '商品图'} · {image.file_id.slice(0, 8)}<button type="button" onClick={() => setImages(rows => rows.filter(row => row.file_id !== image.file_id))}>从商品移除</button>{index > 0 && <button type="button" onClick={() => setImages(rows => { const next = [...rows]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>上移（首商品图为封面）</button>}</div>)}</fieldset>{editable && <><ConnectedFiles request={request} purpose="PRODUCT_IMAGE" label="商品图（首张为封面）" selected={gallery} onChange={setGallery} /><ConnectedFiles request={request} purpose="PRODUCT_IMAGE" label="详情图片" selected={details} onChange={setDetails} /></>}<div className="sw-sticky-actions"><button disabled={busy || !editable || conflict} onClick={() => void save(false)}>保存草稿</button><button disabled={busy || !editable || conflict} className="sw-primary" onClick={() => void save(true)}>{busy ? '正在保存…' : '提交商品审核'}</button></div></div>;
}
