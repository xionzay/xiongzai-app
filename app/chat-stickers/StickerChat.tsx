"use client";
import { ChatIcon } from "../ChatIcon";
import { useCallback, useEffect, useReducer, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { emptyDemo, stickerDemoReducer, type DemoStatus } from "./demo-adapter";
import { StickerPanel, type StickerPreviewState } from "./StickerPanel";
import { StickerPreview } from "./StickerPreview";
import { StickerMessage } from "./StickerMessage";
import { useEmojiComposer, type EmojiDraft, type ChatTextElement } from "./useEmojiComposer";
import { EmojiText, StandardEmojiPanel } from "./StandardEmoji";
import { BearStickerPanel, useChatViewportAnchor, type BearStickerSender } from "./BearStickers";

export function useStickerChat(scope: string, pane: RefObject<HTMLElement | null>, inputRef: RefObject<ChatTextElement | null>, draft?: EmojiDraft, bear?: BearStickerSender, options?: { localOnly?: boolean }) {
  const [state, dispatch] = useReducer(stickerDemoReducer, scope, emptyDemo);
  const [panelState, setPanelState] = useState<{ scope: string; value: "emoji" | "more" | null }>({ scope, value: null });
  const panel = panelState.scope === scope ? panelState.value : null;
  const panelOpen = panel === "emoji";
  const [hasAttachment, setAttachmentPending] = useState(false);
  const [exitRequest, setExitRequest] = useState<(() => void) | null>(null);
  const requestExit = (action: () => void) => { if (draft?.value.trim() || hasAttachment) setExitRequest(() => action); else action(); };
  const [tab, setTab] = useState<"standard" | "bear">("standard");
  const composer = useEmojiComposer(inputRef, draft);
  const followLatestRef = useChatViewportAnchor(pane, true);
  const [preview, setPreview] = useState<StickerPreviewState>(null);
  const messages = state.scope === scope ? state.messages : [];
  useEffect(() => { const element = pane.current; if (element && messages.length && followLatestRef.current) element.scrollTo({ top: element.scrollHeight, behavior: "instant" }); }, [messages.length, pane, followLatestRef]);
  const sendDemo = useCallback((id: string, options: { direction?: "mine" | "theirs"; status?: DemoStatus; brokenAnimation?: boolean; allowUnknown?: boolean } = {}) => {
    dispatch({ type: "send", scope, id, localId: `sticker-demo-${crypto.randomUUID()}`, at: Date.now(), time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }), ...options });
  }, [scope]);
  const onSendSticker = useCallback((id: string) => sendDemo(id), [sendDemo]);
  const closePreview = useCallback(() => setPreview(null), []);
  const closePanel = useCallback(() => { setPanelState({ scope, value: null }); setPreview(null); }, [scope]);
  useEffect(() => {
    const history = pane.current;
    if (!history) return;
    let start: { x: number; y: number; at: number } | null = null;
    const down = (event: PointerEvent) => {
      const target = event.target as Element;
      // Only unused history space dismisses input. Text, media and links retain their gestures.
      const onContent = target.closest(".message,.customer-message,.sw-message,.sticker-message,button,a,input,textarea,[role=button]");
      start = !onContent && !history.ownerDocument.getSelection()?.toString() ? { x: event.clientX, y: event.clientY, at: event.timeStamp } : null;
    };
    const cancel = () => { start = null; };
    const up = (event: PointerEvent) => {
      if (start && !history.ownerDocument.getSelection()?.toString() && event.timeStamp - start.at < 300 && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8) {
        closePanel(); inputRef.current?.blur();
      }
      start = null;
    };
    history.addEventListener("pointerdown", down); history.addEventListener("pointerup", up); history.addEventListener("pointercancel", cancel);
    return () => { history.removeEventListener("pointerdown", down); history.removeEventListener("pointerup", up); history.removeEventListener("pointercancel", cancel); };
  }, [pane, inputRef, closePanel]);
  const togglePanel = () => {
    composer.remember(); setPreview(null);
    setPanelState(current => ({ scope, value: current.scope === scope && current.value === "emoji" ? null : "emoji" }));
    if (panelOpen) composer.focus(); else inputRef.current?.blur();
  };
  const toggleMore = () => {
    composer.remember(); inputRef.current?.blur(); setPreview(null);
    setPanelState(current => ({ scope, value: current.scope === scope && current.value === "more" ? null : "more" }));
  };
  const openMore = () => { composer.remember(); inputRef.current?.blur(); setPreview(null); setPanelState({ scope, value: "more" }); };
  const closeMore = () => setPanelState(current => current.scope === scope && current.value === "more" ? { scope, value: null } : current);
  const returnToInput = () => { closePanel(); composer.focus(); };
  return { prepareSend: () => { followLatestRef.current = true; pane.current?.scrollTo({ top: pane.current.scrollHeight, behavior: "instant" }); }, messages, localOnly: Boolean(options?.localOnly), hasAttachment, setAttachmentPending, requestExit, exitRequest, cancelExit: () => setExitRequest(null), confirmExit: () => { setExitRequest(null); draft?.onChange(""); setAttachmentPending(false); exitRequest?.(); }, panel, panelOpen, toggleMore, openMore, closeMore, followLatest: followLatestRef, preview, tab, setTab, composer, bear, standardEnabled: Boolean(draft), standardDisabled: Boolean(draft?.disabled) || Boolean(bear?.sending), onSendSticker, sendDemo, setPreview, closePreview, closePanel, togglePanel, returnToInput,
    retry: (localId: string) => dispatch({ type: "retry", scope, localId }),
    setStatus: (localId: string, status: DemoStatus) => dispatch({ type: "status", scope, localId, status }),
    clear: () => dispatch({ type: "clear", scope }),
  };
}
export type StickerChatControl = ReturnType<typeof useStickerChat>;
export function StickerToggle({ control }: { control: StickerChatControl }) {
  return <button type="button" className="sticker-toggle" aria-label={control.panelOpen ? "切回文字输入" : control.standardEnabled ? "打开表情面板" : "打开熊崽表情面板"} aria-expanded={control.panelOpen} onClick={control.togglePanel}><ChatIcon kind={control.panelOpen ? "keyboard" : "smile"} /></button>;
}
export function StickerTray({ control, onSend, canSend = false, canDelete = true, sendLabel = "发送消息", sending = false }: { control: StickerChatControl; onSend?: () => void; canSend?: boolean; canDelete?: boolean; sendLabel?: string; sending?: boolean }) {
  if (!control.panelOpen) return null;
  if (!control.standardEnabled) return <StickerPanel onSendSticker={control.onSendSticker} onPreview={control.setPreview} onClose={control.returnToInput} />;
  const tabs = ["standard", "bear"] as const;
  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.indexOf(control.tab);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : null;
    if (next === null) return;
    event.preventDefault();
    control.setTab(tabs[next]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  return <section className="chat-emoji-tray" aria-label="聊天表情面板"><div className="chat-emoji-tabs" role="tablist" aria-label="表情包"><button type="button" role="tab" aria-label="标准表情" title="标准表情" aria-selected={control.tab === "standard"} tabIndex={control.tab === "standard" ? 0 : -1} onKeyDown={onTabKeyDown} onClick={() => control.setTab("standard")}><ChatIcon kind="smile" /></button><button type="button" role="tab" aria-label="熊崽动态" title="熊崽动态" aria-selected={control.tab === "bear"} tabIndex={control.tab === "bear" ? 0 : -1} onKeyDown={onTabKeyDown} onClick={() => control.setTab("bear")}><ChatIcon kind="heart" /></button></div>{control.tab === "standard" ? <StandardEmojiPanel disabled={control.standardDisabled} canDelete={canDelete} onInsert={control.composer.insert} onDelete={() => control.composer.remove()} onKeyboard={control.returnToInput} onSend={onSend} canSend={canSend} sendLabel={sendLabel} sending={sending}/> : control.bear ? <><BearStickerPanel sender={control.bear} previewOnly={control.localOnly}/>{onSend && <footer className="chat-sticker-send-row"><span>文字草稿保留在输入框中</span><button type="button" className="chat-panel-send" disabled={!canSend} aria-label={sendLabel} onClick={onSend}>{sending ? "发送中" : "发送"}</button></footer>}</> : <p role="status">此预览未连接真实表情发送，请进入正式聊天会话。</p>}</section>;
}
export function StickerChatPreview({ control }: { control: StickerChatControl }) {
  const exitRequest = control.exitRequest;
  const cancelExit = control.cancelExit;
  useEffect(() => {
    if (!exitRequest) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") cancelExit(); };
    document.addEventListener("keydown", cancel);
    return () => document.removeEventListener("keydown", cancel);
  }, [exitRequest, cancelExit]);
  return <>{control.preview ? <StickerPreview key={`${control.preview.id}:${control.preview.held}`} value={control.preview} onClose={control.closePreview} /> : null}{control.exitRequest && <div className="flow-overlay" role="dialog" aria-modal="true" aria-label="离开当前会话？"><section className="flow-dialog"><h2>离开当前会话？</h2><p>尚未发送的文字或附件会被清空。</p><div><button type="button" onClick={control.cancelExit}>继续编辑</button><button type="button" onClick={control.confirmExit}>放弃并离开</button></div></section></div>}</>;
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
