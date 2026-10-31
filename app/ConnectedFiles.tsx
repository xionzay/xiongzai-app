'use client';
/* eslint-disable jsx-a11y/media-has-caption -- User evidence has no supplied caption track. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { businessError, type BusinessFile, type Request } from './connected-commerce';

export function ConnectedFiles({ request, purpose, label, selected, onChange }: { request: Request; purpose: 'PRODUCT_IMAGE' | 'ORDER_FULFILLMENT_IMAGE' | 'ORDER_FULFILLMENT_VIDEO' | 'COMPLAINT_EVIDENCE' | 'REVIEW_IMAGE'; label: string; selected: BusinessFile[]; onChange: (files: BusinessFile[]) => void }) {
  const [rows, setRows] = useState<BusinessFile[]>([]), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const lock = useRef(false);
  const refresh = async () => { try { const page = await request<{ items: BusinessFile[] }>(`/me/files?file_type=${purpose}&limit=30`); setRows(page.items); setNotice('上传、文件校验、人工审核与业务提交是不同步骤；只可选已校验且人工审核通过的文件。'); } catch (error) { setNotice(businessError(error)); } };
  useEffect(() => { let active = true; void request<{ items: BusinessFile[] }>(`/me/files?file_type=${purpose}&limit=30`).then(page => { if (active) setRows(page.items); }).catch(error => { if (active) setNotice(businessError(error)); }); return () => { active = false; }; }, [request, purpose]);
  const upload = async (file: File) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice('正在读取并上传文件…');
    try {
      const policies = await request<{ file_type: string; mime_types: string[]; maximum_bytes: number }[]>('/files/policies');
      const policy = policies.find(item => item.file_type === purpose);
      if (!policy || !policy.mime_types.includes(file.type) || file.size < 1 || file.size > policy.maximum_bytes) { setNotice('文件格式或大小不符合服务端上传策略'); return; }
      const bytes = await file.arrayBuffer();
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
      const result = await request<{ file: BusinessFile; upload: { url: string; method: string; headers: Record<string, string> } }>('/files/uploads', { method: 'POST', body: JSON.stringify({ file_type: purpose, mime_type: file.type, size_bytes: file.size, sha256 }) });
      setRows(current => [result.file, ...current.filter(item => item.id !== result.file.id)]);
      // The signed target receives only its upload headers, never API credentials.
      const response = await fetch(result.upload.url, { method: result.upload.method, headers: result.upload.headers, body: bytes, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) { setNotice('直传失败，尚未完成校验，请重试'); return; }
      await request(`/files/${result.file.id}/complete`, { method: 'POST' }); await refresh();
    } catch (error) { setNotice(businessError(error)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section className="paper-panel connected-files"><h3>{label}</h3><label>选择文件<input type="file" disabled={busy} accept={purpose.endsWith('VIDEO') ? 'video/mp4' : 'image/jpeg,image/png,image/webp'} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} /></label><button type="button" disabled={busy} onClick={() => void refresh()}>刷新人工审核状态</button><p role="status">{notice}</p>{rows.map(file => {
    const checked = selected.some(item => item.id === file.id);
    const ready = file.file_type === purpose && file.upload_status === 'VERIFIED' && file.moderation_status === 'APPROVED' && file.visibility === (purpose === 'PRODUCT_IMAGE' ? 'PUBLIC' : 'PRIVATE') && (purpose !== 'REVIEW_IMAGE' || file.bound_review_id === null);
    return <label key={file.id}><input type="checkbox" checked={checked} disabled={!ready || busy} onChange={() => onChange(checked ? selected.filter(item => item.id !== file.id) : [...selected, file])} /><span>{file.id.slice(0, 8)} · {file.upload_status==="VERIFIED"?"已校验":"待校验"} · {file.moderation_status==="APPROVED"?"人工审核通过":file.moderation_status==="REJECTED"?"已驳回":file.moderation_status==="FLAGGED"?"异常":"待人工审核"}{checked ? ' · 已选' : ''}</span>{file.upload_status === 'PENDING' || file.upload_status === 'UPLOADED' ? <button type="button" disabled={busy} onClick={async () => { if (lock.current) return; lock.current = true; setBusy(true); try { await request(`/files/${file.id}/complete`, { method: 'POST' }); await refresh(); } catch (error) { setNotice(businessError(error)); } finally { lock.current = false; setBusy(false); } }}>重试校验</button> : null}</label>;
  })}</section>;
}

export function OrderEvidence({ request, orderId, files }: { request: Request; orderId: string; files: { file_id: string; kind: 'IMAGE' | 'VIDEO' }[] }) {
  const [notice, setNotice] = useState('');
  const [accesses, setAccesses] = useState<Record<string, string>>({});
  const generation=useRef(0), timers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  useEffect(()=>{const timeouts=timers.current;const clear=()=>{generation.current++;timeouts.forEach(clearTimeout);timeouts.clear();setAccesses({});};const hidden=()=>{if(document.hidden)clear();};document.addEventListener('visibilitychange',hidden);return()=>{clear();document.removeEventListener('visibilitychange',hidden);};},[orderId]);
  const open = useCallback(async (fileId: string) => {
    const current=generation.current;
    try { const result = await request<{ id:string; access: { url: string; expires_at:string } }>(`/files/order-evidence/${orderId}/${fileId}/access`); if(current!==generation.current)return;const ttl=Date.parse(result.access.expires_at)-Date.now();if(result.id!==fileId||!Number.isFinite(ttl)||ttl<=0)throw new Error('unavailable');setAccesses(old => ({ ...old, [fileId]: result.access.url }));setNotice('');const previous=timers.current.get(fileId);if(previous)clearTimeout(previous);timers.current.set(fileId,setTimeout(()=>{setAccesses(old=>{const next={...old};delete next[fileId];return next;});timers.current.delete(fileId);},Math.min(ttl,60000))); }
    catch { if(current===generation.current)setNotice('凭证不可用或授权已过期，请重新读取。'); }
  },[request,orderId]);
  const expired = (fileId: string) => { setAccesses(current => { const next = { ...current }; delete next[fileId]; return next; }); setNotice('凭证加载失败或访问已过期，请重新读取。'); };
  // Access URLs stay in component memory, never in another window's history or persistent storage.
  return <section className="paper-panel"><h3>履约凭证</h3>{files.length ? files.map((file, index) => <div key={file.file_id}><button type="button" onClick={() => void open(file.file_id)}>{file.kind === 'VIDEO' ? '查看连续录屏' : `查看截图 ${index + 1}`}</button>{accesses[file.file_id] ? file.kind === 'VIDEO' ? <video controls preload="metadata" crossOrigin="anonymous" src={accesses[file.file_id]} onError={() => expired(file.file_id)} /> : <img src={accesses[file.file_id]} crossOrigin="anonymous" referrerPolicy="no-referrer" alt={`订单完成截图 ${index + 1}`} onError={() => expired(file.file_id)} /> : null}</div>) : <p>尚未提交凭证</p>}<p role="status">{notice}</p></section>;
}
