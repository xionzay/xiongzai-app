"use client";

import { useEffect, useRef, type RefObject, type KeyboardEvent } from "react";
import { ChatPlusPanel, type ChatAttachment, type ChatRichApi, type ChatPlusHandle } from "./ProductDecisionPages";
import { ChatIcon } from "./ChatIcon";
import { EmojiDraftInput, type EmojiDraftHandle } from "./chat-stickers/EmojiDraftInput";

import { StickerToggle, StickerTray, type StickerChatControl } from "./chat-stickers/StickerChat";

export function handleChatKey(event: Pick<KeyboardEvent<HTMLElement>, "key" | "shiftKey" | "nativeEvent" | "preventDefault">, composing: boolean, mobile: boolean, send: () => void) {
  if (event.key !== "Enter" || event.shiftKey || composing || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || mobile) return;
  event.preventDefault(); send();
}

export function ChatComposer({ control, inputRef, value, onChange, onSend, disabled = false, sending = false, label = "输入文字消息", placeholder = "发消息…", sendLabel = "发送消息", support = false, items = [], mediaApi }: {
  control: StickerChatControl; inputRef: RefObject<EmojiDraftHandle | null>; value: string; onChange: (value: string) => void; onSend: () => void;
  disabled?: boolean; sending?: boolean; label?: string; placeholder?: string; sendLabel?: string; support?: boolean; items?: ChatAttachment[]; mediaApi?: ChatRichApi;
}) {
  useEffect(() => {
    if (!value.trim() && !control.hasAttachment) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [value, control.hasAttachment]);
  const { panel, exitRequest, returnToInput } = control;
  useEffect(() => {
    if (!panel || exitRequest) return;
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); returnToInput(); } };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [panel, exitRequest, returnToInput]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const screen = inputRef.current?.closest<HTMLElement>(".app-screen");
    if (!viewport || !screen) return;
    const sync = () => {
      if (window.innerWidth > 760) { screen.style.removeProperty("--chat-available-height"); return; }
      const top = Math.max(0, screen.getBoundingClientRect().top - viewport.offsetTop);
      screen.style.setProperty("--chat-available-height", `${Math.max(0, viewport.height - top)}px`);
    };
    sync(); viewport.addEventListener("resize", sync); window.addEventListener("resize", sync);
    return () => { viewport.removeEventListener("resize", sync); window.removeEventListener("resize", sync); screen.style.removeProperty("--chat-available-height"); };
  }, [inputRef]);
  const mediaPanel = useRef<ChatPlusHandle>(null);
  const tooLong = value.trim().length > 500;
  const canSend = !disabled && !sending && !tooLong && Boolean(value.trim());
  const submit = () => { if (canSend && !control.composer.isComposing()) { control.prepareSend(); onSend(); } };
  const showSend = Boolean(value.trim()) && !control.panel;
  return <div className="chat-composer" data-panel={control.panel ?? "keyboard"}>
    <div className={`${support ? "customer-chat-input" : "chat-input"} has-stickers`} data-action={showSend ? "send" : "more"}>
      <button type="button" className="chat-audio-toggle" aria-label="选择语音文件" title="选择语音文件（非按住录音）" onClick={() => { control.openMore(); mediaPanel.current?.selectKind("语音"); }}><ChatIcon kind="sound" /></button>
      <EmojiDraftInput inputRef={inputRef} label={label} value={value} disabled={disabled || sending} placeholder={placeholder} onFocus={control.closePanel} onChange={onChange} onKeyDown={event => handleChatKey(event, control.composer.isComposing(), window.matchMedia("(pointer: coarse)").matches, submit)} />
      <StickerToggle control={control} />
      {showSend ? <button type="button" className="chat-submit" aria-label={sending ? "正在发送消息" : sendLabel} aria-busy={sending} disabled={!canSend} onPointerDown={event => event.preventDefault()} onClick={submit}>{sending ? "发送中" : "发送"}</button> : <button type="button" className="chat-more-toggle" aria-label="聊天更多功能" aria-expanded={control.panel === "more"} onClick={control.toggleMore}><ChatIcon kind="plus" /></button>}
    </div>
    {tooLong && <p className="chat-permission-note" role="alert">消息超过现有的500字符限制，请缩短后发送。输入内容已保留。</p>}
    {control.hasAttachment && control.panel !== "more" && <p className="chat-attachment-retained" role="status">未发送附件已保留，可打开加号继续处理。</p>}
    <div className="chat-expanded-area" hidden={!control.panel}>
      <StickerTray control={control} canDelete={value.length > 0} onSend={submit} canSend={canSend} sendLabel={sendLabel} sending={sending} />
      <ChatPlusPanel ref={mediaPanel} items={items} api={mediaApi} open={control.panel === "more"} onOpenChange={open => { if (!open) control.closeMore(); }} hideTrigger onDraftChange={control.setAttachmentPending} />
      {control.panel === "more" && Boolean(value.trim()) && <footer className="chat-more-text-action"><span>输入框中的文字</span><button type="button" className="chat-panel-send" disabled={!canSend} aria-label={sendLabel} onPointerDown={event => event.preventDefault()} onClick={submit}>{sending ? "发送中" : "发送"}</button></footer>}
    </div>

  </div>;
}
