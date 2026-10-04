'use client';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

const DATABASE = 'xiongzai-design-preview-v31';
const STORE = 'records';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
export async function previewRead<T>(key: string): Promise<T | undefined> {
  const db = await database();
  try { return await new Promise<T | undefined>((resolve, reject) => { const request = db.transaction(STORE).objectStore(STORE).get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}
export async function previewWrite(key: string, value: unknown) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(value, key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
  finally { db.close(); }
}
/** Design samples only. Never use this store as authentication, payment or server authority. */
export function usePreviewState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>, string] {
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const changed = useRef(false), pending = useRef(Promise.resolve());
  useEffect(() => { let live = true; previewRead<T>(key).then(saved => { if (!live) return; if (saved !== undefined && !changed.current) setValue(saved); setReady(true); }).catch(() => { if (live) setError('本地预览记录读取失败，已停止写入以保护原记录，请重新加载后重试。'); }); return () => { live = false; }; }, [key]);
  useEffect(() => { if (!ready) return; pending.current = pending.current.catch(() => {}).then(() => previewWrite(key, value)).then(() => setError('')).catch(() => setError('本地保存失败，请保留当前页面并检查浏览器存储空间。')); }, [key, ready, value]);
  const update: Dispatch<SetStateAction<T>> = next => { changed.current = true; setValue(next); };
  return [value, update, error];
}
export async function savePreviewFile(file: File) {
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('');
  await previewWrite(`file:${digest}`, file);
  return digest;
}
export function usePreviewFile(id?: string, fallback?: string) {
  const [url, setUrl] = useState(fallback), [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => { let live = true, objectUrl: string | undefined; setError(''); setUrl(fallback);
    if (id) previewRead<Blob>(`file:${id}`).then(blob => { if (!live) return; if (!blob) throw new Error('missing'); objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }).catch(() => { if (live) setError('附件读取失败，请重试或重新选择原文件。'); });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, fallback, retry]);
  return { url, error, retry: () => setRetry(v => v + 1) };
}
