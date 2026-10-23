"use client";
import { CartoonIcon } from "../ui/CartoonIcon";
/* eslint-disable @next/next/no-img-element -- Local delivered PNG thumbnails, no image transformation. */
import { useEffect, useId, useRef, useState } from "react";
import { bearStickers, type ChatSticker } from "./manifest";
import { createStickerGesture } from "./gesture";

export type StickerPreviewState = { id: string; held: boolean } | null;
function StickerTile({ sticker, onSendSticker, onPreview }: { sticker: ChatSticker; onSendSticker: (id: string) => void; onPreview: (value: StickerPreviewState) => void }) {
  const callbacks = useRef({ onSendSticker, onPreview });
  const gesture = useRef<ReturnType<typeof createStickerGesture> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { callbacks.current = { onSendSticker, onPreview }; }, [onSendSticker, onPreview]);
  useEffect(() => {
    const control = createStickerGesture({ preview: () => callbacks.current.onPreview({ id: sticker.id, held: true }), close: () => callbacks.current.onPreview(null), send: () => callbacks.current.onSendSticker(sticker.id) });
    gesture.current = control;
    const visibility = () => { if (document.hidden) control.cancel(); };
    const cancelSecondaryPointer = (event: PointerEvent) => { if (!event.isPrimary) control.cancel(); };
    document.addEventListener("pointerdown", cancelSecondaryPointer, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", control.cancel);
    window.addEventListener("scroll", control.cancel, true);
    return () => { control.dispose(); gesture.current = null; document.removeEventListener("pointerdown", cancelSecondaryPointer, true); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("blur", control.cancel); window.removeEventListener("scroll", control.cancel, true); };
  }, [sticker.id]);
  return <div className="sticker-tile">
    <button type="button" className="sticker-pick" aria-label={`演示发送表情：${sticker.name}`} disabled={failed}
      onPointerDown={(event) => { if (event.button !== 0 || !event.isPrimary) return; event.currentTarget.setPointerCapture(event.pointerId); gesture.current?.down(event.pointerId, event.clientX, event.clientY); }}
      onPointerMove={(event) => gesture.current?.move(event.pointerId, event.clientX, event.clientY)}
      onPointerUp={(event) => gesture.current?.up(event.pointerId)}
      onPointerCancel={() => gesture.current?.cancel()} onLostPointerCapture={() => gesture.current?.cancel()}
      onContextMenu={(event) => event.preventDefault()} onClick={(event) => gesture.current?.click(event.detail)}>
      {failed ? <span className="sticker-thumb-missing">暂不可用</span> : <img src={sticker.thumbnail_url} width={320} height={320} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />}
      <span>{sticker.name}</span>
    </button>
    <button type="button" className="sticker-preview-button" aria-label={`预览表情：${sticker.name}`} onClick={() => onPreview({ id: sticker.id, held: false })} disabled={failed}>预览</button>
  </div>;
}

export function StickerPanel({ onSendSticker, onPreview, onClose }: { onSendSticker: (id: string) => void; onPreview: (value: StickerPreviewState) => void; onClose: () => void }) {
  const title = useId();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = panel.current;
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    node?.addEventListener("keydown", keydown);
    return () => node?.removeEventListener("keydown", keydown);
  }, [onClose]);
  return <section ref={panel} className="sticker-panel" aria-labelledby={title}>
    <header><strong id={title}>熊崽 <small>35 个表情</small></strong><button type="button" onClick={onClose} aria-label="关闭表情面板">收起 <CartoonIcon kind="close" className="toon-glyph" /></button></header>
    <p>轻点演示发送 · 长按预览 · 不会发送给对方</p>
    <div className="sticker-grid">{bearStickers.map((sticker) => <StickerTile key={sticker.id} sticker={sticker} onSendSticker={onSendSticker} onPreview={onPreview} />)}</div>
  </section>;
}
