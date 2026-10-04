'use client';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { deleteAtSelection, insertAtSelection, type TextSelection } from './standard-emoji';

export type EmojiDraft = { value: string; onChange: (value: string) => void; disabled?: boolean };
export function useEmojiComposer(inputRef: RefObject<HTMLInputElement | null>, draft?: EmojiDraft) {
  const current = useRef(draft);
  const selection = useRef<TextSelection>({ start: 0, end: 0 });
  const pending = useRef<TextSelection | null>(null);
  const composing = useRef(false);
  useLayoutEffect(() => { current.current = draft; if (pending.current && inputRef.current) { inputRef.current.setSelectionRange(pending.current.start, pending.current.end); selection.current = pending.current; pending.current = null; } }, [draft, inputRef]);
  const remember = () => { const input = inputRef.current; if (input) selection.current = { start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length }; };
  const apply = (change: {text: string; start: number; end: number}) => {
    if (!current.current || current.current.disabled || !inputRef.current || inputRef.current.disabled || composing.current) return false;
    selection.current = pending.current = { start: change.start, end: change.end };
    current.current = { ...current.current, value: change.text };
    current.current.onChange(change.text);
    return true;
  };
  const remove = (direction: 'backward' | 'forward' = 'backward') => { if (current.current) apply(deleteAtSelection(current.current.value, selection.current, direction)); };
  const enabled = Boolean(draft);
  useEffect(() => {
    const input = inputRef.current;
    if (!input || !current.current) return;
    const begin = () => { composing.current = true; };
    const end = () => { composing.current = false; remember(); };
    const key = (event: KeyboardEvent) => {
      if (composing.current || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || !['Backspace', 'Delete'].includes(event.key)) return;
      event.preventDefault(); remember(); remove(event.key === 'Backspace' ? 'backward' : 'forward');
    };
    const beforeInput = (event: InputEvent) => {
      if (composing.current || event.isComposing || !event.cancelable || !['deleteContentBackward', 'deleteContentForward'].includes(event.inputType)) return;
      event.preventDefault(); remember(); remove(event.inputType === 'deleteContentBackward' ? 'backward' : 'forward');
    };
    const events = ['select', 'keyup', 'pointerup', 'blur', 'input'] as const;
    events.forEach(name => input.addEventListener(name, remember));
    input.addEventListener('compositionstart', begin); input.addEventListener('compositionend', end);
    input.addEventListener('keydown', key); input.addEventListener('beforeinput', beforeInput);
    return () => { events.forEach(name => input.removeEventListener(name, remember)); input.removeEventListener('compositionstart', begin); input.removeEventListener('compositionend', end); input.removeEventListener('keydown', key); input.removeEventListener('beforeinput', beforeInput); };
    // Native listeners read refs, avoiding reinstalling during IME composition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputRef, enabled]);
  return {
    remember,
    isComposing: () => composing.current,
    insert: (glyph: string) => current.current ? apply(insertAtSelection(current.current.value, selection.current, glyph)) : false,
    remove,
    focus: () => { const input = inputRef.current; if (!input || input.disabled) return; input.focus({ preventScroll: true }); input.setSelectionRange(selection.current.start, selection.current.end); },
  };
}
