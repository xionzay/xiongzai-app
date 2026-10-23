// User-selected glossy jelly artwork; quick match retains two controllers.
export const creamJellyKinds = [
  'quick-match', 'coupon-center', 'app-rules', 'feedback', 'official-notices',
  'home', 'order', 'message', 'mine', 'search', 'flame', 'crown',
  'product', 'wallet', 'shield', 'favorite', 'setting', 'share', 'service', 'data', 'mine-wait',
  'coupon', 'back', 'close', 'chevron', 'check', 'plus', 'minus', 'more', 'smile', 'send',
  'rating-outline', 'message-outline', 'rating-filled', 'target', 'refresh', 'image', 'warning',
  'hourglass', 'male', 'female', 'play', 'pause', 'heart-filled', 'heart-outline',
] as const;
const kinds = new Set<string>(creamJellyKinds);
const aliases: Record<string, string> = {
  profile: 'mine', review: 'message', case: 'shield', filter: 'service', withdraw: 'wallet',
  store: 'home', rating: 'rating-filled', star: 'rating-filled', 'home-flame': 'flame',
  'home-crown': 'crown', 'mine-rules': 'app-rules',
};
// Only these three silhouettes were reverted; keep the chosen jelly material.
const restoredShapes: Record<string, string> = {
  'coupon-center': 'coupon-center-original-shape',
  order: 'order-original-shape',
  feedback: 'feedback-original-shape',
};
export function creamJellyIconUrl(kind: string) {
  const resolved = aliases[kind] ?? kind;
  const selected = kinds.has(resolved) ? resolved : 'product';
  return '/assets/reference-jelly-v5/' + (restoredShapes[selected] ?? selected) + '.png';
}
export function CartoonIcon({ kind, className = '', label }: { kind: string; className?: string; label?: string }) {
  return <svg className={'toon-icon toon-illustration ' + className} viewBox="0 0 512 512"
    aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label} focusable="false">
    <image href={creamJellyIconUrl(kind)} width="512" height="512" preserveAspectRatio="xMidYMid meet" />
  </svg>;
}
// These labels may contain user wording; never rewrite it as decorative artwork.
export function JellyLabel({ text }: { text: string }) { return <>{text}</>; }
