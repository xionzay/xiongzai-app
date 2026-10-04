import { bearStickerAssets } from "./bear-sticker-assets.js";

export type BearStickerSide = "buyer" | "seller";
export type BearSticker = { id: string; name: string; side: BearStickerSide; url: string; width: number; height: number; duration_ms: number; frames: number; sha256: string; bytes: number };
export const bearStickers: readonly BearSticker[] = bearStickerAssets;
const byId = new Map(bearStickers.map(sticker => [sticker.id, sticker]));
export function getBearSticker(id: string): BearSticker | undefined { return byId.get(id); }
export function bearStickersFor(side: BearStickerSide) { return bearStickers.filter(sticker => sticker.side === side); }
export function encodeBearSticker(id: string) { return JSON.stringify({ pack: "bear-v3", id }); }
export function decodeBearSticker(content: string): BearSticker | undefined {
  try { const value = JSON.parse(content); return value.pack === "bear-v3" && typeof value.id === "string" ? getBearSticker(value.id) : undefined; } catch { return undefined; }
}
export function bearStickerSummary(sticker: BearSticker | undefined) { return sticker ? `[熊崽表情：${sticker.name}]` : "[表情暂不可用]"; }
