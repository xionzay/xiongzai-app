'use client';
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, type RefObject, type KeyboardEvent } from 'react';
import { draftSelection, draftText, paintDraft, selectDraft } from './emoji-editor-dom';
import { insertAtSelection, type TextSelection } from './standard-emoji';

export interface EmojiDraftHandle {
  readonly value: string; readonly disabled: boolean; readonly selectionStart: number; readonly selectionEnd: number;
  focus(options?: FocusOptions): void; blur(): void; setSelectionRange(start: number, end: number): void;
  closest<T extends Element>(selector: string): T | null;
  addEventListener(name: string, listener: EventListener): void; removeEventListener(name: string, listener: EventListener): void;
}
export function EmojiDraftInput({ inputRef, value, onChange, disabled, label, placeholder, onFocus, onKeyDown }: {
  inputRef: RefObject<EmojiDraftHandle | null>; value: string; onChange: (value: string) => void; disabled: boolean;
  label: string; placeholder: string; onFocus: () => void; onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const root = useRef<HTMLDivElement>(null), composing = useRef(false), saved = useRef<TextSelection>({ start: 0, end: 0 });
  const current = useRef({ value, disabled, onChange });
  useLayoutEffect(() => { current.current = { value, disabled, onChange }; }, [value, disabled, onChange]);
  const remember = useCallback(() => { if (root.current) saved.current = draftSelection(root.current, saved.current); return saved.current; }, []);
  const fit = useCallback(() => { const el = root.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(Math.max(el.scrollHeight,44),118)}px`; }, []);
  const render = useCallback((text: string, selection: TextSelection, focus: boolean) => {
    const el = root.current; if (!el) return;
    paintDraft(el, text); saved.current = selection; fit();
    if (focus) selectDraft(el, selection);
    if (selection.end === text.length) el.scrollTop = el.scrollHeight;
  }, [fit]);
  const commit = useCallback((text: string, selection: TextSelection) => {
    if (current.current.disabled) return;
    current.current.value = text; render(text, selection, document.activeElement === root.current); current.current.onChange(text);
  }, [render]);
  const insert = useCallback((text: string) => { const next = insertAtSelection(draftText(root.current!), remember(), text); commit(next.text, next); }, [remember, commit]);
  useImperativeHandle(inputRef, () => ({
    get value() { return current.current.value; }, get disabled() { return current.current.disabled; },
    get selectionStart() { return remember().start; }, get selectionEnd() { return remember().end; },
    focus(options) { root.current?.focus(options); if (root.current) selectDraft(root.current, saved.current); },
    blur() { remember(); root.current?.blur(); },
    setSelectionRange(start, end) {
      saved.current = { start, end };
      if (root.current && !composing.current) {
        // Parent composer can restore a pending selection before this child's layout effect.
        if (draftText(root.current) !== current.current.value) paintDraft(root.current, current.current.value);
        if (document.activeElement === root.current) selectDraft(root.current, saved.current);
      }
    },
    closest: <T extends Element>(selector: string) => root.current?.closest<T>(selector) ?? null,
    addEventListener(name, listener) { root.current?.addEventListener(name, listener); },
    removeEventListener(name, listener) { root.current?.removeEventListener(name, listener); },
  }), [remember]);
  useEffect(() => {
    const el = root.current;
    const beforeInput = (event: InputEvent) => {
      if (!composing.current && !event.isComposing && ['insertParagraph','insertLineBreak'].includes(event.inputType)) { event.preventDefault(); insert('\n'); }
    };
    el?.addEventListener('beforeinput', beforeInput);
    return () => el?.removeEventListener('beforeinput', beforeInput);
  }, [insert]);
  useEffect(() => {
    const el = root.current; if (!el) return;
    let width = el.clientWidth;
    let frame: number | undefined;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      // Changing height inside ResizeObserver can re-enter layout when the send button changes width.
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = undefined; fit(); });
    });
    observer.observe(el);
    return () => { observer.disconnect(); if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [fit]);
  useLayoutEffect(() => {
    const el = root.current; if (!el || composing.current) return;
    if (draftText(el) !== value) render(value, { start: Math.min(saved.current.start,value.length), end: Math.min(saved.current.end,value.length) }, document.activeElement === el);
    else fit();
  }, [value, render, fit]);
  return <div ref={root} className="chat-draft-input" role="textbox" aria-multiline="true" aria-label={label} aria-disabled={disabled} contentEditable={!disabled} suppressContentEditableWarning tabIndex={disabled ? -1 : 0} data-placeholder={placeholder} data-empty={!value} enterKeyHint="enter"
    onFocus={onFocus} onClick={onFocus} onKeyDown={event => {
      onKeyDown(event);
      if (!event.defaultPrevented && event.key === 'Enter' && !composing.current && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); insert('\n'); }
    }} onBlur={remember} onKeyUp={remember} onPointerUp={remember}
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={() => { composing.current = false; const selection = remember(); commit(draftText(root.current!), selection); }}
    onInput={() => { if (!composing.current) { const selection = remember(); commit(draftText(root.current!), selection); } }}
    onPaste={event => { event.preventDefault(); if (!composing.current) insert(event.clipboardData.getData('text/plain').replace(/\r\n?/g,'\n')); }}
    onDrop={event => event.preventDefault()}
    onCopy={event => { const selection = remember(); event.clipboardData.setData('text/plain',draftText(root.current!).slice(selection.start,selection.end)); event.preventDefault(); }}
    onCut={event => { const selection = remember(); event.clipboardData.setData('text/plain',draftText(root.current!).slice(selection.start,selection.end)); event.preventDefault(); if (!composing.current) insert(''); }}
  />;
}
