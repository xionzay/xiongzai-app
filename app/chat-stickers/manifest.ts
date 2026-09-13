import suppliedManifest from "../../public/assets/chat-stickers/bear-v1/manifest.json";

export type ChatSticker = {
  id: string; pack_id: string; version: number; name: string;
  gif_url: string; thumbnail_url: string; width: number; height: number;
  duration_ms: number; accessibility_description: string;
};
export const bearStickers: readonly ChatSticker[] = suppliedManifest;
const byId = new Map(bearStickers.map((sticker) => [sticker.id, sticker]));
export const getSticker = (id: string) => byId.get(id);
export const stickerSummary = (id: string) => {
  const sticker = getSticker(id);
  return sticker ? `[表情：${sticker.name}]` : "[表情暂不可用]";
};
