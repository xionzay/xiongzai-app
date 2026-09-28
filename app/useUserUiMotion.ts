"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export function useHomeModeMotion(root: RefObject<HTMLElement | null>, mode: string) {
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const node = root.current;
    if (!node) return;
    const style = getComputedStyle(node);
    const duration = parseFloat(style.getPropertyValue("--motion-content")) || 200;
    const distance = style.getPropertyValue("--motion-distance-small").trim() || "4px";
    const animations = Array.from(node.querySelectorAll<HTMLElement>(":scope > .home-section")).map((section, index) => section.animate([{ opacity: .65, translate: `0 ${distance}` }, { opacity: 1, translate: "0 0" }], { duration, delay: Math.min(index, 2) * (parseFloat(style.getPropertyValue("--motion-stagger")) || 30), easing: "ease-out" }));
    const stop = () => animations.forEach(animation => animation.cancel());
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener("change", stop);
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", hide);
    return () => { stop(); media.removeEventListener("change", stop); document.removeEventListener("visibilitychange", hide); };
  }, [root, mode]);
}

// Delegated feedback does not add React renders or delay the native click.
export function useUserUiMotion(root: RefObject<HTMLElement | null>, page: string) {
  const visitedHome = useRef(false);
  const previousPage = useRef(page);
  useLayoutEffect(() => {
    const node = root.current;
    const screen = node?.querySelector<HTMLElement>(".app-screen:not(.home-screen), .home-retained:not([hidden]) .home-screen");
    const returningHome = page === "home" && visitedHome.current;
    const navigated = previousPage.current !== page;
    previousPage.current = page;
    if (page === "home") visitedHome.current = true;
    if (!node || !screen || document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const style = getComputedStyle(node);
    const duration = parseFloat(style.getPropertyValue("--motion-content")) || 200;
    const easing = style.getPropertyValue("--motion-ease").trim() || "ease-out";
    const animations: Animation[] = [];
    // Opacity only: transformed screens would change fixed navigation positioning.
    if (!returningHome) animations.push(screen.animate([{ opacity: .65 }, { opacity: 1 }], { duration, easing }));
    if (navigated && node.dataset.uiRefinement === "on" && (page === "home" || page === "messages")) {
      const icon = screen.querySelector<HTMLElement>(".bottom-nav button.active i");
      if (icon) animations.push(icon.animate([{ scale: 1 }, { scale: parseFloat(style.getPropertyValue("--motion-nav-scale")) || 1.06, offset: .4 }, { scale: 1 }], { duration, easing }));
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => animations.forEach(animation => animation.cancel());
    const hide = () => { if (document.hidden) stop(); };
    media.addEventListener("change", stop);
    document.addEventListener("visibilitychange", hide);
    return () => { stop(); media.removeEventListener("change", stop); document.removeEventListener("visibilitychange", hide); };
  }, [root, page]);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let pressed: HTMLElement | null = null;
    let origin: { x: number; y: number; id: number } | null = null;
    let cancelled: HTMLElement | null = null;
    let cancelledAt = 0;
    const button = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>("button:not(:disabled):not([aria-disabled='true']):not([aria-busy='true']), a[href]") : null;
    const clear = () => { pressed?.removeAttribute("data-pressed"); pressed = null; };
    const cancel = () => { if (pressed) { cancelled = pressed; cancelledAt = Date.now(); } clear(); origin = null; };
    const down = (event: PointerEvent) => {
      clear(); cancelled = null;
      if (!event.isPrimary || event.button !== 0) return;
      const target = button(event.target);
      if (!target || target.closest(".home-announcement-carousel")) return;
      pressed = target; origin = { x: event.clientX, y: event.clientY, id: event.pointerId }; target.dataset.pressed = "true";
    };
    const move = (event: PointerEvent) => {
      if (!origin || origin.id !== event.pointerId || !pressed) return;
      const rect = pressed.getBoundingClientRect();
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8 || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) cancel();
    };
    const up = () => { clear(); origin = null; };
    const hide = () => { if (document.hidden) cancel(); };
    const click = (event: MouseEvent) => { if (event.detail > 0 && cancelled === button(event.target) && Date.now() - cancelledAt < 500) { event.preventDefault(); event.stopPropagation(); } cancelled = null; };
    const keydown = (event: KeyboardEvent) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { clear(); pressed = button(event.target); if (pressed) pressed.dataset.pressed = "true"; } };
    node.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hide);
    node.addEventListener("scroll", cancel, true);
    node.addEventListener("click", click, true);
    node.addEventListener("keydown", keydown);
    node.addEventListener("keyup", up);
    node.addEventListener("focusout", up);
    return () => { clear(); node.removeEventListener("pointerdown", down); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", cancel); document.removeEventListener("visibilitychange", hide); node.removeEventListener("scroll", cancel, true); node.removeEventListener("click", click, true); node.removeEventListener("keydown", keydown); node.removeEventListener("keyup", up); node.removeEventListener("focusout", up); };
  }, [root]);
}

// Existing sheets keep their own close/submit rules; this hook only manages focus/scroll.
export function useSheetAccessibility(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let dialog: HTMLElement | null = null;
    let release: (() => void) | undefined;
    const sync = () => {
      const next = node.querySelector<HTMLElement>(".sheet-backdrop, .demo-overlay, .flow-overlay");
      if (next === dialog) return;
      release?.(); release = undefined; dialog = next;
      if (!next) return;
      const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const screen = next.closest<HTMLElement>(".app-screen");
      const overflow = screen?.style.overflowY ?? "";
      if (screen) screen.style.overflowY = "hidden";
      next.setAttribute("role", "dialog"); next.setAttribute("aria-modal", "true");
      if (!next.hasAttribute("aria-label")) next.setAttribute("aria-label", next.querySelector("h2, h3, b")?.textContent || "操作确认");
      const focusables = () => Array.from(next.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex='0']")).filter(item => item.getClientRects().length > 0);
      next.tabIndex = -1;
      (focusables()[0] ?? next).focus({ preventScroll: true });
      const trap = (event: KeyboardEvent) => {
        if (event.key !== "Tab") return;
        const items = focusables(), first = items[0] ?? next, last = items.at(-1) ?? next;
        if (!next.contains(document.activeElement) || (event.shiftKey && (document.activeElement === first || document.activeElement === next))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === next)) { event.preventDefault(); first.focus(); }
      };
      document.addEventListener("keydown", trap);
      release = () => { document.removeEventListener("keydown", trap); if (screen) screen.style.overflowY = overflow; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
    };
    const observer = new MutationObserver(sync);
    observer.observe(node, { childList: true, subtree: true }); sync();
    return () => { observer.disconnect(); release?.(); };
  }, [root]);
}
