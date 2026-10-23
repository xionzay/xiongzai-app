"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { ChatIcon } from "./ChatIcon";

export function ChatHeader({ title, subtitle, avatar, onBack, actions = [] }: { title: string; subtitle?: string; avatar?: ReactNode; onBack: () => void; actions?: { label: string; onClick: () => void }[] }) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && menu.current?.open) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, []);
  return <header className="screen-header chat-navigation">
    <div className="header-title"><button type="button" className="icon-button" aria-label="返回消息列表" onClick={onBack}><ChatIcon kind="back" /></button><div className="chat-header-identity">{avatar}<div className="chat-header-copy"><h1 title={title}>{title}</h1>{subtitle && <p>{subtitle}</p>}</div></div></div>
    {actions.length ? <details ref={menu} className="chat-header-menu"><summary aria-label="会话更多功能"><ChatIcon kind="more" /></summary><div className="chat-header-options">{actions.map(action => <button type="button" key={action.label} onClick={() => { if (menu.current) menu.current.open = false; action.onClick(); }}>{action.label}</button>)}</div></details> : <span aria-hidden="true" />}
  </header>;
}
