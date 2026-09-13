/** Shared pointer state machine: native scroll/cancel never becomes a send. */
export function createStickerGesture(callbacks: { preview: () => void; close: () => void; send: () => void }, delay = 450) {
  let current: { id: number; x: number; y: number; long: boolean } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let suppressClick = false;
  let lastSend = -Infinity;
  const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const send = () => { if (Date.now() - lastSend < 600) return; lastSend = Date.now(); callbacks.send(); };
  const cancel = () => { clear(); if (current?.long) callbacks.close(); current = null; suppressClick = true; };
  return {
    down(id: number, x: number, y: number) {
      if (current) { cancel(); return; }
      suppressClick = true; current = { id, x, y, long: false };
      timer = setTimeout(() => { if (current) { current.long = true; callbacks.preview(); } }, delay);
    },
    move(id: number, x: number, y: number) { if (current?.id === id && Math.hypot(x - current.x, y - current.y) > 8) cancel(); },
    up(id: number) {
      if (!current || current.id !== id) return;
      clear(); const long = current.long; current = null; suppressClick = true;
      if (long) callbacks.close(); else send();
    },
    click(detail: number) {
      // Pointer sends are handled by up; detail=0 covers keyboard/assistive activation.
      if (detail === 0 && !current) { suppressClick = false; send(); }
      else if (suppressClick) suppressClick = false;
    },
    cancel, dispose: cancel,
  };
}
