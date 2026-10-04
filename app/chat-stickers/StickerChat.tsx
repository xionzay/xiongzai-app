"use client";
import { useCallback, useEffect, useReducer, useState, type ReactNode, type RefObject } from "react";
import { emptyDemo, stickerDemoReducer, type DemoStatus } from "./demo-adapter";
import { StickerPanel, type StickerPreviewState } from "./StickerPanel";
import { StickerPreview } from "./StickerPreview";
import { StickerMessage } from "./StickerMessage";
import { useEmojiComposer, type EmojiDraft } from "./useEmojiComposer";
import { EmojiText, StandardEmojiPanel } from "./StandardEmoji";
import { BearStickerPanel, useChatViewportAnchor, type BearStickerSender } from "./BearStickers";

export function useStickerChat(scope: string, pane: RefObject<HTMLElement | null>, inputRef: RefObject<HTMLInputElement | null>, draft?: EmojiDraft, bear?: BearStickerSender) {
  const [state, dispatch] = useReducer(stickerDemoReducer, scope, emptyDemo);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState<"standard" | "bear">("standard");
  const composer = useEmojiComposer(inputRef, draft);
  useChatViewportAnchor(pane, Boolean(bear));
  const [preview, setPreview] = useState<StickerPreviewState>(null);
  const messages = state.scope === scope ? state.messages : [];
  useEffect(() => { const element = pane.current; if (element && (panelOpen || messages.length)) element.scrollTo({ top: element.scrollHeight, behavior: "instant" }); }, [panelOpen, messages.length, pane]);
  const sendDemo = useCallback((id: string, options: { direction?: "mine" | "theirs"; status?: DemoStatus; brokenAnimation?: boolean; allowUnknown?: boolean } = {}) => {
    dispatch({ type: "send", scope, id, localId: `sticker-demo-${crypto.randomUUID()}`, at: Date.now(), time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }), ...options });
  }, [scope]);
  const onSendSticker = useCallback((id: string) => sendDemo(id), [sendDemo]);
  const closePreview = useCallback(() => setPreview(null), []);
  const closePanel = useCallback(() => { setPanelOpen(false); setPreview(null); }, []);
  const togglePanel = () => { composer.remember(); if (panelOpen) { closePanel(); composer.focus(); } else { inputRef.current?.blur(); setTab("standard"); setPanelOpen(true); } };
  const returnToInput = () => { closePanel(); composer.focus(); };
  return { messages, panelOpen, preview, tab, setTab, composer, bear, standardEnabled: Boolean(draft), standardDisabled: Boolean(draft?.disabled) || Boolean(bear?.sending), onSendSticker, sendDemo, setPreview, closePreview, closePanel, togglePanel, returnToInput,
    retry: (localId: string) => dispatch({ type: "retry", scope, localId }),
    setStatus: (localId: string, status: DemoStatus) => dispatch({ type: "status", scope, localId, status }),
    clear: () => dispatch({ type: "clear", scope }),
  };
}
export type StickerChatControl = ReturnType<typeof useStickerChat>;
export function StickerToggle({ control }: { control: StickerChatControl }) {
  return <button type="button" className="sticker-toggle" aria-label={control.panelOpen ? "切回文字输入" : control.standardEnabled ? "打开表情面板" : "打开熊崽表情面板"} aria-expanded={control.panelOpen} onClick={control.togglePanel}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M7.7 13.5c1.2 4.5 7.4 4.5 8.6 0M8 8.5h1M15 8.5h1" strokeLinecap="round" /></svg></button>;
}
export function StickerTray({ control }: { control: StickerChatControl }) {
  if (!control.panelOpen) return null;
  if (!control.standardEnabled) return <StickerPanel onSendSticker={control.onSendSticker} onPreview={control.setPreview} onClose={control.returnToInput} />;
  return <section className="chat-emoji-tray" aria-label="聊天表情面板"><div className="chat-emoji-tabs" role="tablist" aria-label="表情包"><button type="button" role="tab" aria-selected={control.tab === "standard"} onClick={() => control.setTab("standard")}>标准表情</button><button type="button" role="tab" aria-selected={control.tab === "bear"} onClick={() => control.setTab("bear")}>熊崽动态</button><button type="button" onClick={control.returnToInput} aria-label="收起表情并切回键盘">收起</button></div>{control.tab === "standard" ? <StandardEmojiPanel disabled={control.standardDisabled} onInsert={control.composer.insert} onDelete={() => control.composer.remove()} onKeyboard={control.returnToInput}/> : control.bear ? <BearStickerPanel sender={control.bear}/> : <p role="status">此预览未连接真实表情发送，请进入正式聊天会话。</p>}</section>;
}
export function StickerChatPreview({ control }: { control: StickerChatControl }) {
  return control.preview ? <StickerPreview key={`${control.preview.id}:${control.preview.held}`} value={control.preview} onClose={control.closePreview} /> : null;
}
export type LocalDemoText = { id: string; content: string; createdAt: number };
export function StickerDemoMessages({ control, selfAvatar, otherAvatar, localTexts = [] }: { control: StickerChatControl; selfAvatar: ReactNode; otherAvatar: ReactNode; localTexts?: LocalDemoText[] }) {
  if (!control.messages.length && !localTexts.length) return null;
  const rows = [
    ...control.messages.map((message) => ({ id: message.localId, at: message.createdAt, node: <StickerMessage message={message} avatar={message.direction === "mine" ? selfAvatar : otherAvatar} onRetry={control.retry} /> })),
    ...localTexts.map((text) => ({ id: text.id, at: text.createdAt, node: <div className="sticker-local-text"><EmojiText text={text.content}/><small>本地演示文字 · 未发送给对方</small></div> })),
  ].sort((a, b) => a.at - b.at);
  return <section className="sticker-demo-messages" aria-label="本地表情演示记录"><p className="sticker-demo-label">表情交互演示，尚未接入真实发送</p>{rows.map((row) => <div key={row.id}>{row.node}</div>)}</section>;
}
