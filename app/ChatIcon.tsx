import type { ReactNode } from "react";

export type ChatIconKind = "heart" | "delete" | "back" | "more" | "smile" | "keyboard" | "plus" | "close" | "audio" | "sound" | "apps" | "image" | "video" | "product" | "order" | "search" | "shield";
/** Generic line artwork, scoped to conversation controls. */
export function ChatIcon({ kind, className = "" }: { kind: ChatIconKind; className?: string }) {
  const drawings: Record<ChatIconKind, ReactNode> = {
    heart: <path d="M20.5 4.8a5.2 5.2 0 0 0-7.4 0L12 5.9l-1.1-1.1a5.2 5.2 0 0 0-7.4 7.4L12 20.7l8.5-8.5a5.2 5.2 0 0 0 0-7.4Z"/>,
    delete: <><path d="M9 5h12v14H9l-7-7 7-7Z"/><path d="m11 9 6 6m0-6-6 6"/></>,
    back: <path d="m15 4-8 8 8 8" />,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    smile: <><circle cx="12" cy="12" r="9"/><circle cx="8.8" cy="9.3" r=".85" fill="currentColor" stroke="none"/><circle cx="15.2" cy="9.3" r=".85" fill="currentColor" stroke="none"/><path d="M8.2 14a4.4 4.4 0 0 0 7.6 0"/></>,
    keyboard: <><circle cx="12" cy="12" r="9"/><path d="M7 8h.5m2.5 0h.5m2.5 0h.5m2.5 0h.5M7 11h.5m2.5 0h.5m2.5 0h.5m2.5 0h.5M7 14h.5m2.5 0h.5m2.5 0h.5m2.5 0h.5M8 17h8"/></>,
    plus: <><circle cx="12" cy="12" r="9"/><path d="M7.5 12h9M12 7.5v9"/></>,
    close: <><circle cx="12" cy="12" r="9"/><path d="m8 8 8 8m0-8-8 8"/></>,
    audio: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13v3m4-5v7m4-5v3"/></>,
    apps: <><rect x="3" y="3" width="6" height="6" rx="1.4"/><rect x="3" y="15" width="6" height="6" rx="1.4"/><rect x="15" y="15" width="6" height="6" rx="1.4"/><rect x="14.7" y="2.7" width="6.6" height="6.6" rx="1.3" transform="rotate(45 18 6)"/></>,
    sound: <><circle cx="12" cy="12" r="9"/><circle cx="7.8" cy="12" r=".85" fill="currentColor" stroke="none"/><path d="M10.5 9.5a3.5 3.5 0 0 1 0 5M13.2 7a7 7 0 0 1 0 10"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>,
    video: <><rect x="2" y="5" width="14" height="14" rx="2"/><path d="m16 10 6-4v12l-6-4"/></>,
    product: <><path d="M4 7h16v14H4zM8 8V6a4 4 0 0 1 8 0v2"/></>,
    order: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    search: <><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></>,
    shield: <><path d="m12 2 8 3v6c0 5-8 10-8 10S4 16 4 11V5l8-3Z"/><path d="m8 11 3 3 5-6"/></>,
  };
  return <svg className={`chat-line-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{drawings[kind]}</svg>;
}
