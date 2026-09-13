"use client";
import { useEffect, useRef, useState } from "react";
import { getSticker } from "./manifest";
import { StickerImage } from "./StickerImage";
import type { StickerPreviewState } from "./StickerPanel";

export function StickerPreview({ value, onClose }: { value: NonNullable<StickerPreviewState>; onClose: () => void }) {
  const [progress] = useState(() => ({ played: false, failed: false }));
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!value.held) closeButton.current?.focus();
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close.current(); } if (!value.held && event.key === "Tab") { event.preventDefault(); closeButton.current?.focus(); } };
    const visibility = () => { if (document.hidden) close.current(); };
    document.addEventListener("keydown", keyboard); document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", onClose);
    return () => { document.removeEventListener("keydown", keyboard); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("blur", onClose); if (!value.held && previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [value.held, onClose]);
  return <div className={`sticker-preview-overlay ${value.held ? "is-held" : ""}`} role={value.held ? "status" : "dialog"} aria-modal={value.held ? undefined : true} aria-label="熊崽表情放大预览">
    <div className="sticker-preview-card"><StickerImage stickerId={value.id} progress={progress} preview /><b>{getSticker(value.id)?.name ?? "表情暂不可用"}</b><p>{value.held ? "松开关闭，不会发送" : "仅预览，不会发送"}</p>{!value.held ? <button type="button" ref={closeButton} onClick={onClose}>关闭预览</button> : null}</div>
  </div>;
}
