'use client';
import { useEffect, useRef, useState } from 'react';

/** Only dismissal waits for paint; saves and other business actions are never delayed. */
export function usePanelDismiss(onClose: () => void) {
  const callback = useRef(onClose); callback.current = onClose;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finish = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; callback.current(); } };
    media.addEventListener('change', finish);
    return () => media.removeEventListener('change', finish);
  }, []);
  const dismiss = () => {
    if (timer.current || closing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { callback.current(); return; }
    setClosing(true);
    timer.current = setTimeout(() => { timer.current = null; callback.current(); }, 140);
  };
  return { closing, dismiss };
}
