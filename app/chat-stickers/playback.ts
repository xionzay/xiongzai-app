import type { ChatSticker } from "./manifest";

export type StickerProgress = { played: boolean; failed: boolean };
let decoder = 0;

/** A visual-only GIF player. Nothing in here can change message delivery state. */
export function mountStickerPlayback(image: HTMLImageElement, sticker: ChatSticker, progress: StickerProgress, onUnavailable: () => void) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let visible = false, disposed = false, animated = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (animated) image.src = sticker.thumbnail_url;
    animated = false;
    image.dataset.playback = "static";
  };
  const update = () => {
    if (disposed) return;
    if (!visible || document.hidden || reduced.matches || progress.failed) { stop(); return; }
    if (progress.played || animated) return;
    progress.played = true; animated = true;
    image.dataset.playback = "once";
    image.src = `${sticker.gif_url}?replay=${++decoder}`;
  };
  const loaded = () => {
    if (!disposed && animated && timer === undefined) timer = setTimeout(() => { if (!disposed) stop(); }, sticker.duration_ms);
  };
  const errored = () => {
    if (disposed) return;
    progress.failed = true;
    if (animated) { stop(); image.dataset.playback = "fallback"; }
    else { stop(); onUnavailable(); }
  };
  const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting); update();
  });
  observer?.observe(image);
  image.addEventListener("load", loaded); image.addEventListener("error", errored);
  document.addEventListener("visibilitychange", update); reduced.addEventListener("change", update);
  if (image.complete && image.naturalWidth === 0) errored();
  return {
    replay() {
      if (disposed || reduced.matches || document.hidden || !visible) return;
      stop(); progress.played = false; progress.failed = false; update();
    },
    dispose() {
      disposed = true; stop(); observer?.disconnect();
      image.removeEventListener("load", loaded); image.removeEventListener("error", errored);
      document.removeEventListener("visibilitychange", update); reduced.removeEventListener("change", update);
      image.src = sticker.thumbnail_url; image.dataset.playback = "stopped";
    },
  };
}
