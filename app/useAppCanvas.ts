'use client';
import { useLayoutEffect, type RefObject } from 'react';

/** Absolute docks paint the bottom slice of the same viewport-sized canvas. */
export function useAppCanvas(root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const sync = () => node.style.setProperty('--app-canvas-height', `${node.clientHeight}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => { observer.disconnect(); node.style.removeProperty('--app-canvas-height'); };
  }, [root]);
}
