import manifest from '../../public/assets/standard-emoji/fluent-224-v1/manifest.json';

export const emojiManifest = manifest;
export const standardEmoji = manifest.emoji;
export type StandardEmoji = typeof standardEmoji[number];
export const emojiAssetRoot = '/assets/standard-emoji/fluent-224-v1/';
const byId = new Map(standardEmoji.map(emoji => [emoji.id, emoji]));
// VS16 is optional for these exact emoji sequences; VS15 text presentation stays text.
const canonical = (text: string) => text.replace(/\uFE0F/g, '');
const byGlyph = new Map(standardEmoji.map(emoji => [canonical(emoji.glyph), emoji]));
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
export const graphemes = (text: string) => Array.from(segmenter.segment(text));
export const findEmoji = (glyph: string) => byGlyph.get(canonical(glyph));
export const emojiForId = (id: string) => byId.get(id);
export function emojiTokens(text: string) {
  return graphemes(text).map(({ segment, index }) => ({ text: segment, index, emoji: findEmoji(segment) }));
}
export function searchEmoji(query: string, category: string, recentIds: string[] = []) {
  const search = query.trim().toLocaleLowerCase();
  if (search) return standardEmoji.filter(e => [e.label, e.name, e.glyph, ...e.keywords].join(' ').toLocaleLowerCase().includes(search));
  if (category === '常用') return recentIds.flatMap(id => { const emoji = byId.get(id); return emoji ? [emoji] : []; });
  return standardEmoji.filter(e => e.category === category);
}
export type TextSelection = { start: number; end: number };
function selectionBounds(text: string, selection: TextSelection) {
  const start = Math.max(0, Math.min(text.length, selection.start));
  const end = Math.max(start, Math.min(text.length, selection.end));
  const parts = graphemes(text);
  const floor = (n: number) => parts.find(p => p.index < n && p.index + p.segment.length > n)?.index ?? n;
  const ceil = (n: number) => { const p = parts.find(p => p.index < n && p.index + p.segment.length > n); return p ? p.index + p.segment.length : n; };
  return { start: floor(start), end: start === end ? floor(end) : ceil(end) };
}
export function insertAtSelection(text: string, selection: TextSelection, insertion: string) {
  const { start, end } = selectionBounds(text, selection);
  return { text: text.slice(0, start) + insertion + text.slice(end), start: start + insertion.length, end: start + insertion.length };
}
export function deleteAtSelection(text: string, selection: TextSelection, direction: 'backward' | 'forward' = 'backward') {
  let { start, end } = selectionBounds(text, selection);
  if (start === end) {
    const parts = graphemes(text);
    const containing = parts.find(p => p.index < selection.start && p.index + p.segment.length > selection.start);
    if (containing) return { text: text.slice(0, containing.index) + text.slice(containing.index + containing.segment.length), start: containing.index, end: containing.index };
    if (direction === 'backward') start = parts.filter(p => p.index < start).at(-1)?.index ?? start;
    else { const part = parts.find(p => p.index === start); if (part) end = part.index + part.segment.length; }
  }
  return { text: text.slice(0, start) + text.slice(end), start, end: start };
}
export const recentEmojiKey = 'xiongzai-standard-emoji-recent-v1';
export function validRecent(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && byId.has(id)))].slice(0, 24) : [];
}
export function addRecent(ids: string[], id: string) { return validRecent([id, ...ids.filter(value => value !== id)]); }
