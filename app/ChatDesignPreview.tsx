"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ConversationList, type InboxEntry } from "./ConversationList";
import { previewCompanions } from "./local-catalog-data";
import { ChatAvatar } from "./ChatAvatar";
import { ChatIcon } from "./ChatIcon";
import { ChatHeader } from "./ChatHeader";
import { ChatComposer } from "./ChatComposer";
import type { EmojiDraftHandle } from "./chat-stickers/EmojiDraftInput";
import { EmojiText } from "./chat-stickers/StandardEmoji";
import { getBearSticker } from "../packages/contracts/src/bear-stickers";
import { BearStickerImage, type BearStickerSender } from "./chat-stickers/BearStickers";
import { StickerChatPreview, useStickerChat } from "./chat-stickers/StickerChat";

// Design fixtures are deliberately separate from API conversation IDs and records.
export const designChatThreads = previewCompanions.slice(0, 2).map((shop, index) => ({
  id: `ui-preview-chat-${index + 1}`, name: shop.name, avatar: shop.image,
  messages: [
    { id: "buyer-hello", role: "buyer", content: "你好，想了解一下和平精英组队陪玩。" },
    { id: "seller-reply", role: "seller", content: "你好呀，可以先聊聊你的游戏区服和需求。" },
    { id: "buyer-question", role: "buyer", content: "我玩 QQ 区，想先体验一下 😊" },
    { id: "seller-sticker", role: "seller", content: "", sticker: "bear-v3/seller/001" },
  ],
}));

export function searchDesignChats(keyword: string, seller = false): InboxEntry[] {
  const query = keyword.trim().toLocaleLowerCase();
  return designChatThreads.flatMap(thread => {
    const name = seller ? "小熊玩家" : thread.name;
    const match = thread.messages.find(message => message.content.toLocaleLowerCase().includes(query));
    if (query && !name.toLocaleLowerCase().includes(query) && !match) return [];
    return [{ id: thread.id, name, avatar: seller ? "/assets/xiongzai-icon.png" : thread.avatar,
      preview: "[熊崽表情] · UI 示例", ...(query && match ? { match: match.content } : {}) }];
  });
}

export function ChatDesignInbox({ onOpen, nav, seller = false }: { onOpen: (id: string) => void; nav: ReactNode; seller?: boolean }) {
  return <div className="app-screen messages-screen">
    <ConversationList seller={seller} entries={searchDesignChats("", seller)} search={async query => searchDesignChats(query, seller)} onOpen={onOpen} />
    {nav}
  </div>;
}

export function ChatDesignPreview({ threadId, seller = false, onBack }: { threadId?: string; seller?: boolean; onBack: () => void }) {
  const thread = designChatThreads.find(item => item.id === threadId) ?? designChatThreads[0];
  const [text, setText] = useState("");
  const [localMessages, setLocalMessages] = useState<{ id: string; content: string; sticker?: string }[]>([]);
  const pane = useRef<HTMLElement>(null);
  const input = useRef<EmojiDraftHandle>(null);
  const side = seller ? "seller" : "buyer";
  const previewBear: BearStickerSender = { side, disabled: false, sending: false, pending: [], retry() {}, send(id) {
    if (getBearSticker(id)?.side === side) setLocalMessages(rows => [...rows, { id: crypto.randomUUID(), content: "", sticker: id }]);
  } };
  const stickers = useStickerChat(`ui-design:${seller}:${thread.id}`, pane, input, { value: text, onChange: setText }, previewBear, { localOnly: true });
  const name = seller ? "小熊玩家" : thread.name;
  const avatar = seller ? "/assets/xiongzai-icon.png" : thread.avatar;
  const previewText = () => {
    if (!text.trim()) return;
    setLocalMessages(rows => [...rows, { id: crypto.randomUUID(), content: text.trim() }]);
    setText("");
  };
  useEffect(() => { if (stickers.followLatest.current) pane.current?.scrollTo({ top: pane.current.scrollHeight }); }, [localMessages.length, stickers.followLatest]);
  return <div className="app-screen chat-screen">
    <div className="chat-topbar">
      <ChatHeader title={name} avatar={<ChatAvatar src={avatar} alt={`${name}头像`} />} onBack={() => stickers.requestExit(onBack)} />
      <div className="chat-notice"><ChatIcon kind="shield" className="nav-symbol" /><span>请在平台内沟通，保障交易安全</span></div>
    </div>
    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Make the scrollable message history reachable for keyboard scrolling. */}
    <section className="chat-messages chat-scroll-content" ref={pane} tabIndex={0} aria-label="UI 示例聊天记录">
      {thread.messages.map(message => {
        const mine = message.role === (seller ? "seller" : "buyer");
        return <div className={`message ${mine ? "mine" : "theirs"}${message.sticker ? " bear-v3-message" : ""}`} key={message.id}>
          {!mine && <ChatAvatar kind="avatar" className="chat-person-avatar" src={avatar} alt="" />}
          <span><p>{message.sticker ? <BearStickerImage id={message.sticker} /> : <EmojiText text={message.content} />}</p></span>
          {mine && <ChatAvatar kind="avatar" className="chat-person-avatar chat-person-avatar-self" src={seller ? thread.avatar : "/assets/xiongzai-icon.png"} alt="本地示例用户头像" />}
        </div>;
      })}
      {localMessages.map(message => <div className={`message mine last-sent${message.sticker ? " bear-v3-message" : ""}`} key={message.id}><span><p>{message.sticker ? <BearStickerImage id={message.sticker} /> : <EmojiText text={message.content} />}</p><small className="read-receipt">仅本地展示</small></span><ChatAvatar kind="avatar" className="chat-person-avatar chat-person-avatar-self" src={seller ? thread.avatar : "/assets/xiongzai-icon.png"} alt="本地示例用户头像" /></div>)}
    </section>
    <div className="chat-compose-dock">
      <ChatComposer control={stickers} inputRef={input} value={text} onChange={setText} onSend={previewText} label="UI 示例文字输入" placeholder="输入消息…" sendLabel="本地预览消息，不发送给对方" />
    </div><StickerChatPreview control={stickers} />
  </div>;
}
