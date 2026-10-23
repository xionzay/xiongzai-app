"use client";
import { useEffect } from "react";

/** Handles the existing drawers and nested confirmations without redesigning them. */
export function useAdminDialogAccessibility() {
  useEffect(() => {
    const stack: Array<{ dialog: HTMLElement; previous: HTMLElement | null }> = [];
    const focusables = (dialog: HTMLElement) => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')).filter(node => node.getClientRects().length && !node.closest('[inert]'));
    const focus = (dialog: HTMLElement) => (focusables(dialog)[0] ?? dialog).focus();
    function sync() {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).filter(node => node.getClientRects().length);
      while (stack.length && !dialogs.includes(stack.at(-1)!.dialog)) {
        const closed = stack.pop()!;
        if (closed.previous?.isConnected) closed.previous.focus();
      }
      const top = dialogs.at(-1);
      if (top && stack.at(-1)?.dialog !== top) {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        top.tabIndex = -1;
        if (!top.hasAttribute("aria-label") && !top.hasAttribute("aria-labelledby")) top.setAttribute("aria-label", top.querySelector("h2,h3")?.textContent ?? "管理操作确认");
        stack.push({ dialog: top, previous }); focus(top);
      }
    }
    function keydown(event: KeyboardEvent) {
      const top = stack.at(-1)?.dialog; if (!top) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        const close = Array.from(top.querySelectorAll<HTMLButtonElement>("button")).find(button => button.getAttribute("aria-label") === "关闭" || button.textContent?.trim() === "取消");
        if (close && !close.disabled) close.click();
      }
      if (event.key === "Tab") {
        const nodes = focusables(top), index = nodes.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        if (!nodes.length) top.focus();
        else nodes[(index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length].focus();
      }
    }
    function focusin(event: FocusEvent) {
      const top = stack.at(-1)?.dialog;
      if (top && event.target instanceof Node && !top.contains(event.target)) focus(top);
    }
    const observer = new MutationObserver(sync); observer.observe(document.body, { childList: true, subtree: true }); sync();
    document.addEventListener("keydown", keydown, true); document.addEventListener("focusin", focusin);
    return () => { observer.disconnect(); document.removeEventListener("keydown", keydown, true); document.removeEventListener("focusin", focusin); };
  }, []);
}
