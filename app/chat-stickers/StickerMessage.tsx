"use client";
import type { ReactNode } from "react";
import { StickerImage } from "./StickerImage";
import type { DemoStickerMessage } from "./demo-adapter";

export function StickerMessage({ message, avatar, onRetry }: { message: DemoStickerMessage; avatar: ReactNode; onRetry: (id: string) => void }) {
  return <article className={`sticker-message ${message.direction}`} data-local-sticker-message={message.localId}>
    {message.direction === "theirs" ? <div className="sticker-avatar">{avatar}</div> : null}
    <div className="sticker-message-body"><StickerImage stickerId={message.stickerId} progress={message.progress} brokenAnimation={message.brokenAnimation} />
      <footer><time>{message.time}</time><span>{message.status === "sending" ? "演示发送中" : message.status === "failed" ? "演示发送失败" : message.direction === "mine" ? "仅本地展示" : "模拟对方表情"}</span></footer>
      {message.status === "failed" ? <button type="button" className="sticker-retry" onClick={() => onRetry(message.localId)}>原位重试（演示）</button> : null}
      {message.brokenAnimation ? <small className="sticker-fallback-note">动画失败演示 · 静态回退</small> : null}
    </div>
    {message.direction === "mine" ? <div className="sticker-avatar">{avatar}</div> : null}
  </article>;
}
