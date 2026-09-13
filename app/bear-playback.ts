import { bearClips, type BearStateId } from "./bear-state-config";

export type BearProgress = { played: boolean; failed: boolean };
export type PlaybackOptions = { active: boolean; mode: "auto" | "static" };
let replaySequence = 0;

/** DOM-only playback. No requests, business callbacks, React state or polling. */
export function mountBearPlayback(image: HTMLImageElement, id: BearStateId, base: string, progress: BearProgress) {
  const clip = bearClips[id];
  const poster = `${base}/posters/${id}.png`;
  const end = `${base}/end/${id}.png`;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let options: PlaybackOptions = { active: false, mode: "static" };
  let inView = false;
  let disposed = false;
  let phase: "poster" | "end" | "animated" = "poster";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const still = (last = false) => {
    clear();
    const next = last ? "end" : "poster";
    if (phase !== next) { phase = next; image.src = last ? end : poster; }
    image.dataset.playback = next;
  };
  const update = () => {
    if (disposed) return;
    if (progress.failed || options.mode === "static" || reduce.matches) { still(); return; }
    if (!options.active || document.hidden || !inView) { still(progress.played && !clip.loop); return; }
    if (phase === "animated") return;
    if (progress.played && !clip.loop) { still(true); return; }
    progress.played = true;
    phase = "animated";
    image.dataset.playback = clip.loop ? "loop" : "once";
    // Only new events (or resuming a visible loop) get a new decoder, not rerenders.
    image.src = `${base}/assets/${id}.webp?play=${++replaySequence}`;
  };
  const loaded = () => {
    if (!disposed && phase === "animated" && !clip.loop && timer === undefined) {
      timer = setTimeout(() => { if (!disposed) still(true); }, clip.durationMs + 80);
    }
  };
  const errored = () => {
    if (disposed) return;
    progress.failed = true;
    if (phase === "poster") { image.style.visibility = "hidden"; clear(); }
    else still();
  };
  image.addEventListener("load", loaded);
  image.addEventListener("error", errored);
  if (image.complete && image.naturalWidth === 0) errored();
  // Older browsers without visibility observation use the static fallback.
  const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
    inView = Boolean(entry?.isIntersecting); update();
  });
  observer?.observe(image);
  document.addEventListener("visibilitychange", update);
  reduce.addEventListener("change", update);
  return {
    update(next: PlaybackOptions) { options = next; update(); },
    dispose() {
      disposed = true; clear(); observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
      reduce.removeEventListener("change", update);
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", errored);
      // Replacing animated src releases playback even if React retains a hidden subtree.
      image.src = poster;
      image.dataset.playback = "stopped";
    },
  };
}
