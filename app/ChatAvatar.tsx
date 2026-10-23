import type { ComponentProps } from "react";
import { CatalogImage } from "./CatalogImage";

/** Chat-only frame; CatalogImage keeps the existing file-ID and fallback handling. */
export function ChatAvatar({ className = "chat-person-avatar", ...image }: ComponentProps<typeof CatalogImage>) {
  return <div className={`${className} chat-avatar-frame`}><CatalogImage {...image} kind="avatar" className="chat-avatar-image" /></div>;
}
