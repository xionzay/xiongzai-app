"use client";
/* eslint-disable @next/next/no-img-element -- GIF decoder and exact source bytes are controlled here. */
import { useEffect, useRef, useState } from "react";
import { getSticker } from "./manifest";
import { mountStickerPlayback, type StickerProgress } from "./playback";

export function StickerImage({ stickerId, progress, brokenAnimation = false, preview = false }: {
  stickerId: string; progress: StickerProgress; brokenAnimation?: boolean; preview?: boolean;
}) {
  const sticker = getSticker(stickerId);
  const image = useRef<HTMLImageElement>(null);
  const player = useRef<ReturnType<typeof mountStickerPlayback> | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!sticker || !image.current) return;
    const visual = brokenAnimation ? { ...sticker, gif_url: "/assets/chat-stickers/bear-v1/missing-demo.gif" } : sticker;
    const instance = mountStickerPlayback(image.current, visual, progress, () => setUnavailable(true));
    player.current = instance;
    return () => { instance.dispose(); player.current = null; };
  }, [sticker, progress, brokenAnimation]);
  if (!sticker || unavailable) return <div className="sticker-unavailable" role="img" aria-label="表情暂不可用">[表情暂不可用]</div>;
  const art = <img ref={image} src={sticker.thumbnail_url} width={320} height={320} alt={sticker.accessibility_description} draggable={false} />;
  return preview ? <div className="sticker-art preview-art">{art}</div> : <button type="button" className="sticker-art" onClick={() => player.current?.replay()} aria-label={`重播表情：${sticker.name}`}>{art}</button>;
}
