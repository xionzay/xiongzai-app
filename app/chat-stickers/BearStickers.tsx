"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { bearStickersFor, getBearSticker, type BearStickerSide } from "../../packages/contracts/src/bear-stickers";

export type BearSend = (id: string, clientMessageId: string) => Promise<void>;
type PendingSticker = { id: string; key: string; scope: string; status: "sending" | "failed"; error?: string };
export function useBearStickerSender(scope: string, side: BearStickerSide, enabled: boolean, onSend: BearSend) {
  const [pending, setPending] = useState<PendingSticker[]>([]);
  const lock = useRef(false);
  const [sending, setSending] = useState(false);
  const submit = async (id: string, retryKey?: string) => {
    if (!enabled || lock.current || getBearSticker(id)?.side !== side) return;
    const key = retryKey ?? `bear-v3-${crypto.randomUUID()}`;
    const currentScope = scope;
    const send = onSend;
    lock.current = true; setSending(true);
    setPending(rows => [...rows.filter(row => row.key !== key), { id, key, scope: currentScope, status: "sending" }]);
    try {
      await send(id, key);
      setPending(rows => rows.filter(row => row.key !== key));
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : "发送失败，请重试";
      setPending(rows => rows.map(row => row.key === key ? { ...row, status: "failed", error } : row));
    } finally { lock.current = false; setSending(false); }
  };
  return { side, disabled: !enabled || sending, sending, pending: pending.filter(row => row.scope === scope), send: (id: string) => void submit(id), retry: (row: PendingSticker) => void submit(row.id, row.key) };
}
export type BearStickerSender = ReturnType<typeof useBearStickerSender>;

// Keep the last message visible when the keyboard/panel changes the available
// height, while leaving a user who is reading older messages at their position.
export function useChatViewportAnchor(pane: RefObject<HTMLElement | null>, enabled: boolean) {
  const followLatest = useRef(true);
  useEffect(() => {
    const element = pane.current;
    if (!enabled || !element || typeof ResizeObserver === "undefined") return;
    let previousHeight = element.clientHeight;
    element.style.setProperty("--chat-visible-height", `${previousHeight}px`);
    let atBottom = element.scrollHeight - element.scrollTop - previousHeight <= 32;
    followLatest.current = atBottom;
    let resizing = false;
    let frame: number | undefined;
    const onScroll = () => {
      if (resizing || element.clientHeight !== previousHeight) return;
      atBottom = element.scrollHeight - element.scrollTop - previousHeight <= 32;
      followLatest.current = atBottom;
    };
    const observer = new ResizeObserver(() => {
      const height = element.clientHeight;
      if (height === previousHeight) return;
      previousHeight = height;
      resizing = true;
      element.style.setProperty("--chat-visible-height", `${height}px`);
      if (atBottom) element.scrollTo({ top: element.scrollHeight, behavior: "instant" });
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // A resized GIF changes the content height in the same render frame.
        if (atBottom) element.scrollTo({ top: element.scrollHeight, behavior: "instant" });
        frame = requestAnimationFrame(() => { resizing = false; frame = undefined; });
      });
    });
    element.addEventListener("scroll", onScroll, { passive: true });
    observer.observe(element);
    return () => { observer.disconnect(); if (frame !== undefined) cancelAnimationFrame(frame); element.removeEventListener("scroll", onScroll); element.style.removeProperty("--chat-visible-height"); };
  }, [pane, enabled]);
  return followLatest;
}

export function BearStickerImage({ id, panel = false }: { id?: string; panel?: boolean }) {
  const sticker = id ? getBearSticker(id) : undefined;
  const [failedUrl, setFailedUrl] = useState("");
  const [revision, setRevision] = useState(0);
  if (!sticker) return <span role="status">表情暂不可用</span>;
  if (failedUrl === sticker.url && panel) return <span>表情加载失败</span>;
  if (failedUrl === sticker.url) return <button type="button" className="bear-v3-load-retry" onClick={() => { setFailedUrl(""); setRevision(value => value + 1); }}>表情加载失败，重试</button>;
  // The original GIF must not be optimized into a static first frame.
  // eslint-disable-next-line @next/next/no-img-element
  return <img key={`${sticker.id}:${revision}`} className={panel ? "bear-v3-panel-art" : "bear-v3-message-art"} src={sticker.url} alt={sticker.name} width={384} height={384} loading={panel ? "lazy" : undefined} decoding="async" draggable={false} onError={() => setFailedUrl(sticker.url)} />;
}
export function BearStickerPanel({ sender, previewOnly = false }: { sender: BearStickerSender; previewOnly?: boolean }) {
  const stickers = bearStickersFor(sender.side);
  return <section className="bear-v3-panel" aria-label={`${sender.side === "buyer" ? "买家" : "卖家"}熊崽动态表情`}>
    <p className="bear-v3-panel-hint">{sender.side === "buyer" ? "买家" : "卖家"}表情 · 35 个 · {previewOnly ? "点击本地预览" : "点击发送"}</p>
    <div className="bear-v3-grid" aria-busy={sender.sending}>{stickers.map(sticker => <button type="button" key={sticker.id} disabled={sender.disabled} aria-label={`${previewOnly ? "本地预览" : "发送"}${sticker.name}`} title={sticker.name} onClick={() => sender.send(sticker.id)}><BearStickerImage id={sticker.id} panel /></button>)}</div>
    <p className="bear-v3-panel-status" role="status">{sender.sending ? "正在发送表情…" : sender.disabled ? "当前会话暂不能发送表情" : "向上滑动查看全部表情"}</p>
  </section>;
}
export function PendingBearStickers({ sender }: { sender: BearStickerSender }) {
  return <>{sender.pending.map(row => <div className="bear-v3-pending" key={row.key}><BearStickerImage id={row.id}/><small role={row.status === "failed" ? "alert" : "status"}>{row.status === "sending" ? "发送中…" : `发送失败：${row.error}`}</small>{row.status === "failed" && <button type="button" disabled={sender.disabled} onClick={() => sender.retry(row)}>重试发送</button>}</div>)}</>;
}
