import { emojiAssetRoot, emojiTokens, type TextSelection } from './standard-emoji';

/** The DOM is presentation only. Drafts, clipboard and transport remain Unicode. */
export function draftText(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? '';
  if (node instanceof Element) {
    if (node.hasAttribute('data-emoji')) return node.getAttribute('data-emoji') ?? '';
    if (node.hasAttribute('data-caret-end')) return '';
    if (node.tagName === 'BR') return '\n';
  }
  return Array.from(node.childNodes).map(child => draftText(child)).join('');
}
export function draftSelection(root: HTMLElement, fallback: TextSelection): TextSelection {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.rangeCount) return fallback;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return fallback;
  const offset = (node: Node, end: number) => {
    const prefix = root.ownerDocument.createRange(); prefix.selectNodeContents(root); prefix.setEnd(node, end);
    return draftText(prefix.cloneContents()).length;
  };
  return { start: offset(range.startContainer, range.startOffset), end: offset(range.endContainer, range.endOffset) };
}
export function selectDraft(root: HTMLElement, value: TextSelection) {
  const point = (wanted: number): [Node, number] => {
    let remaining = wanted;
    for (let i = 0; i < root.childNodes.length; i++) {
      const node = root.childNodes[i], length = draftText(node).length;
      if (node.nodeType === 3 && remaining <= length) return [node, remaining];
      if (remaining === 0) return [root, i];
      if (remaining <= length) return [root, i + 1];
      remaining -= length;
    }
    return [root, root.childNodes.length];
  };
  const range = root.ownerDocument.createRange(); range.setStart(...point(value.start)); range.setEnd(...point(value.end));
  const selection = root.ownerDocument.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
}
export function paintDraft(root: HTMLElement, text: string) {
  const doc = root.ownerDocument, fragment = doc.createDocumentFragment();
  for (const token of emojiTokens(text)) {
    if (token.emoji) {
      const img = doc.createElement('img'); img.src = emojiAssetRoot + token.emoji.assets.webp128;
      img.alt = token.text; img.dataset.emoji = token.text; img.className = 'chat-draft-emoji';
      img.draggable = false; img.contentEditable = 'false';
      img.onerror = () => { if (!img.src.endsWith(token.emoji!.assets.png64)) img.src = emojiAssetRoot + token.emoji!.assets.png64; };
      fragment.append(img);
    } else {
      token.text.split('\n').forEach((part, index) => { if (index) fragment.append(doc.createElement('br')); if (part) fragment.append(doc.createTextNode(part)); });
    }
  }
  // A non-content final BR gives a trailing newline a visible caret line.
  if (text.endsWith('\n')) { const end = doc.createElement('br'); end.dataset.caretEnd = ''; fragment.append(end); }
  root.replaceChildren(fragment);
}
