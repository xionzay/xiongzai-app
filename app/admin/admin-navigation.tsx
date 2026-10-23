"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./admin.module.css";

// Display grouping only. The caller supplies the already permission-filtered items.
export const ADMIN_NAV_GROUPS = [
  { id: "workbench", label: "工作台", modules: ["dashboard"] },
  { id: "people", label: "用户与陪玩", modules: ["users", "identityReview", "sellerReview", "sellers", "phoneChanges", "accountCancellations", "dataExports"] },
  { id: "trade", label: "商品与交易", modules: ["serviceReview", "services", "orders", "payments", "refunds"] },
  { id: "content", label: "客服与内容", modules: ["support", "complaints", "reviews", "files", "notifications"] },
  { id: "finance", label: "财务与资金", modules: ["finance", "withdrawals"] },
  { id: "system", label: "系统与安全", modules: ["policies", "config", "logs"] },
] as const;

type NavItem<T extends string> = { id: T; label: string; icon: string };
export function AdminNavigation<T extends string>({ items, active, counts, onNavigate }: {
  items: NavItem<T>[]; active: T; counts: Map<T, number>; onNavigate: (id: T) => void;
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const currentButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const group = ADMIN_NAV_GROUPS.find(group => (group.modules as readonly string[]).includes(active));
      if (group) setClosed(current => {
        if (!current.has(group.id)) return current;
        const next = new Set(current); next.delete(group.id); return next;
      });
      currentButton.current?.scrollIntoView({ block: "nearest" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active]);

  return <nav aria-label="后台模块">{ADMIN_NAV_GROUPS.map(group => {
    const visible = group.modules.flatMap(id => items.filter(item => item.id === id));
    if (!visible.length) return null;
    const expanded = !closed.has(group.id);
    return <section className={styles.navGroup} key={group.id} aria-label={group.label}>
      <button type="button" className={styles.navGroupToggle} aria-expanded={expanded} aria-controls={`admin-nav-${group.id}`} onClick={() => setClosed(current => {
        const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next;
      })}><span>{group.label}</span><i aria-hidden="true" /></button>
      <div id={`admin-nav-${group.id}`} className={styles.navGroupItems} hidden={!expanded}>{visible.map(item => {
        const count = counts.get(item.id);
        return <button type="button" key={item.id} ref={item.id === active ? currentButton : undefined} className={item.id === active ? styles.activeNav : undefined} aria-label={item.label} aria-current={item.id === active ? "page" : undefined} title={item.label} onClick={() => onNavigate(item.id)}>
          {/* Fixed same-origin brand icons; Vinext has no next/image runtime. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.icon} alt="" width={20} height={20} decoding="async" />
          <span>{item.label}</span>{count !== undefined && count > 0 ? <em aria-label={`${count} 项待办`}>{count}</em> : null}
        </button>;
      })}</div>
    </section>;
  })}</nav>;
}
