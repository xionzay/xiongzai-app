"use client";
import { useSyncExternalStore } from "react";
import { StateBear } from "./BearStateImage";

const subscribe = (callback: () => void) => {
  window.addEventListener("online", callback); window.addEventListener("offline", callback);
  return () => { window.removeEventListener("online", callback); window.removeEventListener("offline", callback); };
};
export function RequestErrorBear({ message = "", size = 128, hasContent = false }: { message?: string; size?: number; hasContent?: boolean }) {
  const offline = useSyncExternalStore(subscribe, () => navigator.onLine === false, () => false);
  const restricted = /登录|未授权|权限|身份尚未开通|认证失效/.test(message);
  if (offline && hasContent && !restricted) return <p role="status">网络已断开，保留上次加载的内容。请联网后重试。</p>;
  return <StateBear scene={restricted ? "authGuard" : offline ? "offline" : "error"} size={size} eventKey={message} />;
}

export function DemoStateNotice({ payment = false }: { payment?: boolean }) {
  return <p className="bear-demo-notice" role="note">设计稿演示状态 · 不代表真实业务结果{payment ? <><br />测试支付，不会真实扣款</> : null}</p>;
}
