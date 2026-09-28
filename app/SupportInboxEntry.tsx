type InboxConversation = {
  id: string;
  conversation_type: string;
  last_message_preview: string | null;
  last_message_at: string | null;
  created_at: string;
  unread_count: number;
};

export function summarizeSupportInbox<T extends InboxConversation>(conversations: T[]) {
  const support = conversations.filter((item) => item.conversation_type === "SUPPORT");
  const timestamp = (item: T) => Date.parse(item.last_message_at ?? item.created_at) || 0;
  const latest = support.reduce<T | null>((current, item) => !current || timestamp(item) > timestamp(current) ? item : current, null);
  return {
    latest,
    unread: support.reduce((total, item) => total + Math.max(0, item.unread_count), 0),
    others: conversations.filter((item) => item.conversation_type !== "SUPPORT"),
  };
}

export function SupportInboxEntry({ latest, unread, onOpen }: {
  latest: InboxConversation | null;
  unread: number;
  onOpen: () => void;
}) {
  return <button type="button" className="platform-support-entry" onClick={onOpen}>
    <span><img src="/assets/xiongzai-icon.png" alt="" /></span>
    <div className="support-inbox-copy">
      <b>平台客服{latest?.last_message_at ? <time dateTime={latest.last_message_at}>{new Date(latest.last_message_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time> : null}</b>
      <small>{latest?.last_message_preview || "订单、退款、投诉与账号问题"}</small>
    </div>
    {unread > 0 ? <em className="support-unread" aria-label={`${unread} 条客服未读消息`}>{unread > 99 ? "99+" : unread}</em> : null}
  </button>;
}
