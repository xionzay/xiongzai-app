"use client";
import { CartoonIcon } from "../ui/CartoonIcon";
import { useEffect, useRef, useState } from 'react';
import { cropRect, errorMessage, type FileRecord, type Request } from './model';

export function ImagePicker({ kind, request, onClose, onSelect }: { kind: 'SELLER_COVER' | 'SELLER_AVATAR'; request: Request; onClose: () => void; onSelect: (id: string) => void }) {
  const [source, setSource] = useState(''), [zoom, setZoom] = useState(1), [x, setX] = useState(.5), [y, setY] = useState(.5);
  const [records, setRecords] = useState<FileRecord[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [uploaded, setUploaded] = useState<FileRecord | null>(null);
  const image = useRef<HTMLImageElement>(null), canvas = useRef<HTMLCanvasElement>(null), dialog = useRef<HTMLDialogElement>(null), lock = useRef(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const ratio = kind === 'SELLER_COVER' ? 2.75 : 1;
  const maxSize = kind === 'SELLER_COVER' ? 10 : 5;
  const load = async () => { try { const result = await request<{ items: FileRecord[] }>(`/me/files?file_type=${kind}&limit=50`); setRecords(result.items); if (uploaded) setUploaded(result.items.find(r => r.id === uploaded.id) ?? uploaded); } catch (e) { setError(errorMessage(e)); } };
  useEffect(() => { dialog.current?.showModal(); void load(); }, []);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);
  useEffect(() => { if (!dimensions.width || !image.current || !canvas.current) return; const rect = cropRect(dimensions.width, dimensions.height, ratio, zoom, x, y); const context = canvas.current.getContext('2d'); context?.clearRect(0, 0, canvas.current.width, canvas.current.height); context?.drawImage(image.current, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.current.width, canvas.current.height); }, [dimensions, ratio, zoom, x, y]);
  const upload = async () => {
    if (lock.current || !canvas.current) return; lock.current = true; setBusy(true); setError('');
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.current!.toBlob(b => b ? resolve(b) : reject(new Error('无法生成图片，请更换图片')), 'image/jpeg', .9));
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      const result = await request<{ file: FileRecord; upload: { url: string; method: string; headers: Record<string, string> } }>('/files/uploads', { method: 'POST', body: JSON.stringify({ file_type: kind, mime_type: 'image/jpeg', size_bytes: blob.size, sha256 }) });
      const response = await fetch(result.upload.url, { method: result.upload.method, headers: result.upload.headers, body: blob });
      if (!response.ok) throw new Error('图片传输失败，请重试');
      const file = await request<FileRecord>(`/files/${result.file.id}/complete`, { method: 'POST' }); setUploaded(file); setRecords(rows => [file, ...rows.filter(r => r.id !== file.id)]);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); lock.current = false; }
  };
  return <dialog className="sf-dialog" ref={dialog} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} aria-label={kind === 'SELLER_COVER' ? '编辑主页封面' : '编辑头像'}><header><h2>{kind === 'SELLER_COVER' ? '编辑主页封面' : '编辑头像'}</h2><button disabled={busy} aria-label="关闭图片编辑" onClick={onClose}><CartoonIcon kind="close" /></button></header><p>选择 JPEG、PNG 或 WebP，最大 {maxSize} MB。上传后需通过现有图片审核才能选用。</p><label className="sf-file-button">选择图片<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (!file) return; if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > maxSize * 1024 * 1024) { setError(`请选择 ${maxSize} MB 以内的 JPEG、PNG 或 WebP 图片`); return; } setError(''); setUploaded(null); setZoom(1); setX(.5); setY(.5); setDimensions({ width: 0, height: 0 }); setSource(URL.createObjectURL(file)); e.target.value = ''; }} /></label>
    {source && <><img ref={image} src={source} alt="" hidden onLoad={() => setDimensions({ width: image.current!.naturalWidth, height: image.current!.naturalHeight })} onError={() => setError('图片无法读取，请重新选择')} /><canvas ref={canvas} width={kind === 'SELLER_COVER' ? 1100 : 512} height={kind === 'SELLER_COVER' ? 400 : 512} className="sf-crop" aria-label="裁剪预览" /><label className="sf-slider">缩放<input type="range" min="1" max="3" step=".02" value={zoom} disabled={busy} onChange={e => { setUploaded(null); setZoom(Number(e.target.value)); }} /></label><label className="sf-slider">水平位置<input type="range" min="0" max="1" step=".01" value={x} disabled={busy} onChange={e => { setUploaded(null); setX(Number(e.target.value)); }} /></label><label className="sf-slider">垂直位置<input type="range" min="0" max="1" step=".01" value={y} disabled={busy} onChange={e => { setUploaded(null); setY(Number(e.target.value)); }} /></label><button className="sf-primary" disabled={busy || !dimensions.width || Boolean(uploaded)} onClick={() => void upload()}>{busy ? '正在上传…' : uploaded ? '已上传，等待图片审核' : '上传裁剪后的图片'}</button></>}
    {error && <p role="alert" className="sf-error">{error}</p>}
    <div className="sf-row"><h3>已上传的图片</h3><button disabled={busy} onClick={() => void load()}>刷新状态</button></div>
    {!records.length && <p>暂无可选图片</p>}
    {records.map(file => <ImageChoice key={file.id} file={file} request={request} disabled={busy} onSelect={() => onSelect(file.id)} />)}
    <small>选用图片后仍需保存主页资料。图片审核与主页资料审核分别进行。</small>
  </dialog>;
}
function ImageChoice({ file, request, disabled, onSelect }: { file: FileRecord; request: Request; disabled: boolean; onSelect: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { let active = true; request<FileRecord>(`/files/${file.id}/access`).then(r => { if (active) setUrl(r.access?.url ?? ''); }).catch(() => {}); return () => { active = false; }; }, [file.id, request]);
  const ready = file.upload_status === 'VERIFIED' && file.moderation_status === 'APPROVED';
  const status = ready ? '可选用' : file.moderation_status === 'REJECTED' ? '审核未通过，请更换图片' : file.upload_status !== 'VERIFIED' ? '上传未完成' : '图片审核中';
  return <div className="sf-image-choice">{url ? <img src={url} alt="已上传图片" /> : <span>图片</span>}<span>{status}</span><button disabled={disabled || !ready} onClick={onSelect}>选用</button></div>;
}
