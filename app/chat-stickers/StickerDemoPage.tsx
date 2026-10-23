"use client";
import { CartoonIcon } from "../ui/CartoonIcon";
/* eslint-disable @next/next/no-img-element -- Reuse the prototype's existing local avatar and brand assets. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { StickerChatPreview, StickerDemoMessages, StickerToggle, StickerTray, useStickerChat, type LocalDemoText } from "./StickerChat";
import { stickerSummary } from "./manifest";

export default function StickerDemoPage() {
  const [mode, setMode] = useState<"chat" | "support">("chat");
  return <DemoSurface key={mode} mode={mode} onMode={setMode} />;
}
function DemoSurface({ mode, onMode }: { mode: "chat" | "support"; onMode: (mode: "chat" | "support") => void }) {
  const pane = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const control = useStickerChat(`isolated-preview:${mode}`, pane, inputRef);
  const [draft, setDraft] = useState("");
  const [texts, setTexts] = useState<LocalDemoText[]>([]);
  useEffect(() => { if (texts.length) pane.current?.scrollTo({ top: pane.current.scrollHeight, behavior: "instant" }); }, [texts.length]);
  const latest = control.messages.at(-1);
  const selfAvatar = <span className="chat-person-avatar chat-person-avatar-self">我</span>;
  const otherAvatar = mode === "support" ? <img src="/assets/xiongzai-icon.png" alt="平台客服头像" /> : <img src="/assets/player-kirito.png" alt="陪玩头像" />;
  const sendText = () => { if (draft.trim()) { setTexts([...texts, { id: crypto.randomUUID(), content: draft.trim(), createdAt: Date.now() }]); setDraft(""); } };
  return <main className="sticker-demo-stage">
    <aside className="sticker-demo-guide"><img src="/assets/xiongzai-logo.png" alt="熊崽电竞" /><span>WEB UI · LOCAL DEMO</span><h1>把心情，交给熊崽</h1><p>表情交互演示，尚未接入真实发送。<br />本页不登录、不请求聊天 API；刷新清空演示记录。</p>
      <div className="sticker-demo-mode"><button type="button" aria-pressed={mode === "chat"} onClick={() => onMode("chat")}>普通聊天</button><button type="button" aria-pressed={mode === "support"} onClick={() => onMode("support")}>平台客服</button></div>
      <details className="sticker-demo-controls"><summary>演示状态控制</summary><div>
        <button type="button" onClick={() => control.sendDemo("bear-v1/001")}>本人发送</button>
        <button type="button" onClick={() => control.sendDemo("bear-v1/003", { direction: "theirs" })}>对方发送</button>
        <button type="button" onClick={() => control.sendDemo("bear-v1/004", { status: "sending" })}>发送中</button>
        <button type="button" onClick={() => control.sendDemo("bear-v1/008", { status: "failed" })}>发送失败</button>
        <button type="button" onClick={() => control.sendDemo("bear-v1/005", { brokenAnimation: true })}>动画加载失败</button>
        <button type="button" onClick={() => control.sendDemo("unknown-demo", { allowUnknown: true })}>未知表情 ID</button>
        <button type="button" disabled={!latest || latest.status !== "sending"} onClick={() => latest && control.setStatus(latest.localId, "local")}>完成最近一次演示</button>
        <button type="button" onClick={() => { control.clear(); setTexts([]); }}>清空本地演示</button>
      </div><p>原位重试仅切换为“演示发送中”，需手动点击“完成最近一次演示”；动画不控制消息状态。</p></details>
      <p className="sticker-demo-summary">会话列表演示摘要<br /><b>{latest ? stickerSummary(latest.stickerId) : "[表情：你好]"}</b></p><p><Link href="/" prefetch={false}>返回用户端设计稿</Link></p>
    </aside>
    <section className="phone-shell" aria-label={mode === "support" ? "客服表情演示" : "普通聊天表情演示"}>
      <div className={`app-screen ${mode === "support" ? "customer-service-screen" : "chat-screen"} sticker-demo-chat`}>
        <div className="chat-topbar"><div className="screen-header"><div className="header-title"><Link className="icon-button" href="/" prefetch={false} aria-label="返回用户端"><CartoonIcon kind="back" className="toon-glyph" label="返回" /></Link><div><h1>{mode === "support" ? "平台客服" : "熊崽陪玩"}</h1><p>本地表情演示</p></div></div><span className="chat-person-avatar">{mode === "support" ? "客" : "熊"}</span></div><div className="chat-notice">表情交互演示，尚未接入真实发送</div></div>
        <section className="chat-scroll-content chat-messages" ref={pane} aria-label="表情演示聊天记录">
          {!control.messages.length && !texts.length ? <div className="sticker-demo-empty">点输入框旁的笑脸，选一只熊崽。<br />轻点本地展示，长按放大预览。<br />未发送的文字不会丢失。</div> : null}
          <StickerDemoMessages control={control} selfAvatar={selfAvatar} otherAvatar={otherAvatar} localTexts={texts} />
        </section>
        <div className="chat-compose-dock"><div className={`${mode === "support" ? "customer-chat-input" : "chat-input"} has-stickers`}>
          <input ref={inputRef} aria-label="本地演示文字输入" value={draft} onFocus={control.closePanel} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) sendText(); }} placeholder="输入消息…" />
          <StickerToggle control={control} /><button type="button" aria-label="本地展示文字" disabled={!draft.trim()} onClick={sendText}><CartoonIcon kind="send" className="toon-glyph" /></button>
        </div><StickerTray control={control} /></div>
        <StickerChatPreview control={control} />
      </div>
    </section>
  </main>;
}
