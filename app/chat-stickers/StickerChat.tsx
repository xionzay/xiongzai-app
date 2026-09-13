"use client";
import { useCallback, useEffect, useReducer, useState, type ReactNode, type RefObject } from "react";
import { emptyDemo, stickerDemoReducer, type DemoStatus } from "./demo-adapter";
import { StickerPanel, type StickerPreviewState } from "./StickerPanel";
import { StickerPreview } from "./StickerPreview";
import { StickerMessage } from "./StickerMessage";

export function useStickerChat(scope: string, pane: RefObject<HTMLElement | null>, inputRef: RefObject<HTMLInputElement | null>) {
  const [state, dispatch] = useReducer(stickerDemoReducer, scope, emptyDemo);
  const [panelOpen, setPanelOpen] = useState(false);
  const [preview, setPreview] = useState<StickerPreviewState>(null);
  const messages = state.scope === scope ? state.messages : [];
  useEffect(() => { const element = pane.current; if (element && (panelOpen || messages.length)) element.scrollTo({ top: element.scrollHeight, behavior: "instant" }); }, [panelOpen, messages.length, pane]);
  const sendDemo = useCallback((id: string, options: { direction?: "mine" | "theirs"; status?: DemoStatus; brokenAnimation?: boolean; allowUnknown?: boolean } = {}) => {
    dispatch({ type: "send", scope, id, localId: `sticker-demo-${crypto.randomUUID()}`, at: Date.now(), time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }), ...options });
  }, [scope]);
  const onSendSticker = useCallback((id: string) => sendDemo(id), [sendDemo]);
  const closePreview = useCallback(() => setPreview(null), []);
  const closePanel = useCallback(() => { setPanelOpen(false); setPreview(null); }, []);
  const togglePanel = () => { if (panelOpen) { closePanel(); inputRef.current?.focus(); } else { inputRef.current?.blur(); setPanelOpen(true); } };
  const returnToInput = () => { closePanel(); inputRef.current?.focus(); };
  return { messages, panelOpen, preview, onSendSticker, sendDemo, setPreview, closePreview, closePanel, togglePanel, returnToInput,
    retry: (localId: string) => dispatch({ type: "retry", scope, localId }),
    setStatus: (localId: string, status: DemoStatus) => dispatch({ type: "status", scope, localId, status }),
    clear: () => dispatch({ type: "clear", scope }),
  };
}
export type StickerChatControl = ReturnType<typeof useStickerChat>;
export function StickerToggle({ control }: { control: StickerChatControl }) {
  return <button type="button" className="sticker-toggle" aria-label={control.panelOpen ? "切回文字输入" : "打开熊崽表情面板"} aria-expanded={control.panelOpen} onClick={control.togglePanel}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M7.7 13.5c1.2 4.5 7.4 4.5 8.6 0M8 8.5h1M15 8.5h1" strokeLinecap="round" /></svg></button>;
}
export function StickerTray({ control }: { control: StickerChatControl }) {
  return control.panelOpen ? <StickerPanel onSendSticker={control.onSendSticker} onPreview={control.setPreview} onClose={control.returnToInput} /> : null;
}
export function StickerChatPreview({ control }: { control: StickerChatControl }) {
  return control.preview ? <StickerPreview key={`${control.preview.id}:${control.preview.held}`} value={control.preview} onClose={control.closePreview} /> : null;
}
export type LocalDemoText = { id: string; content: string; createdAt: number };
export function StickerDemoMessages({ control, selfAvatar, otherAvatar, localTexts = [] }: { control: StickerChatControl; selfAvatar: ReactNode; otherAvatar: ReactNode; localTexts?: LocalDemoText[] }) {
  if (!control.messages.length && !localTexts.length) return null;
  const rows = [
    ...control.messages.map((message) => ({ id: message.localId, at: message.createdAt, node: <StickerMessage message={message} avatar={message.direction === "mine" ? selfAvatar : otherAvatar} onRetry={control.retry} /> })),
    ...localTexts.map((text) => ({ id: text.id, at: text.createdAt, node: <div className="sticker-local-text">{text.content}<small>本地演示文字 · 未发送给对方</small></div> })),
  ].sort((a, b) => a.at - b.at);
  return <section className="sticker-demo-messages" aria-label="本地表情演示记录"><p className="sticker-demo-label">表情交互演示，尚未接入真实发送</p>{rows.map((row) => <div key={row.id}>{row.node}</div>)}</section>;
}
