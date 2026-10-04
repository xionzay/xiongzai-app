import type { ReactNode } from 'react';

// Painted bounds in the approved transparent atlas. Each view is centered in a
// square with equal optical padding; the original illustration stays untouched.
const illustratedBounds: Record<string, readonly [number, number, number, number]> = {
  home: [47,77,349,368], order: [411,79,702,373], message: [750,95,1050,370], mine: [1099,86,1399,371],
  product: [49,416,338,691], wallet: [410,410,691,691], shield: [759,413,1055,704], favorite: [1116,438,1413,697],
  search: [45,742,334,1002], setting: [408,741,687,1006], share: [753,751,1054,1001], service: [1090,752,1408,1014],
};
const aliases: Record<string,string> = { profile:'mine', review:'message', case:'shield', filter:'service', withdraw:'wallet', store:'home' };

/** Approved illustrated icons; small directional controls remain simple and legible. */
export function CartoonIcon({ kind, className = '' }: { kind: string; className?: string }) {
  const resolved = aliases[kind] ?? kind;
  if (resolved === 'data') return <svg className={`toon-icon toon-illustration ${className}`} viewBox="0 0 1280 1280" aria-hidden="true" focusable="false"><image href="/assets/cartoon-data-v1.png" width="1280" height="1280" /></svg>;
  const mineAsset = resolved === 'mine-wait' ? '/assets/cartoon-wait-v1.png' : resolved === 'mine-rules' ? '/assets/home-shortcuts/app-rules.png' : null;
  if (mineAsset) return <svg className={`toon-icon toon-illustration ${className}`} viewBox="0 0 256 256" aria-hidden="true" focusable="false"><image href={mineAsset} width="256" height="256" /></svg>;
  const bounds = illustratedBounds[resolved];
  if (bounds) {
    const [left, top, right, bottom] = bounds;
    const size = Math.max(right - left, bottom - top) + 20;
    const viewBox = `${(left + right - size) / 2} ${(top + bottom - size) / 2} ${size} ${size}`;
    return <svg className={`toon-icon toon-illustration ${className}`} viewBox={viewBox} aria-hidden="true" focusable="false">
      <image href="/assets/cartoon-icons-v1.png" width="1448" height="1086" />
    </svg>;
  }
  const shapes: Record<string, ReactNode> = {
    home: <><path d="M7 18 20 7l13 11v14a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3Z"/><path d="M4 20 18 7q2-2 4 0l14 13" fill="none"/><path d="M16 35V24q4-3 8 0v11" fill="var(--toon-accent)"/><circle cx="20" cy="17" r="2" fill="var(--toon-detail)"/></>,
    order: <><rect x="8" y="7" width="24" height="29" rx="5"/><rect x="14" y="4" width="12" height="7" rx="3" fill="var(--toon-accent)"/><path d="m13 19 2 2 4-4m3 3h5m-14 8h14" fill="none"/></>,
    message: <><path d="M34 19c0 9-7 14-15 14h-4l-8 4 1-9C1 19 7 7 20 7c8 0 14 5 14 12Z"/><path d="M12 24q8 5 16-1" fill="none"/><circle cx="14" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="25" cy="18" r="1.3" fill="currentColor" stroke="none"/></>,
    mine: <><circle cx="11" cy="10" r="4"/><circle cx="29" cy="10" r="4"/><path d="M7 33c0-9 26-9 26 0v3H7Z" fill="var(--toon-accent)"/><rect x="10" y="8" width="20" height="19" rx="9"/><circle cx="16" cy="17" r="1.3" fill="currentColor" stroke="none"/><circle cx="24" cy="17" r="1.3" fill="currentColor" stroke="none"/><path d="M17 22q3 2 6 0" fill="none"/></>,
    product: <><rect x="7" y="12" width="26" height="24" rx="5"/><path d="M14 13V9a6 6 0 0 1 12 0v4" fill="none"/><path d="m15 24 4 4 7-8" fill="none"/></>,
    shield: <><path d="m20 4 14 5v11c0 8-14 16-14 16S6 28 6 20V9Z"/><path d="m13 20 5 5 9-10" fill="none"/></>,
    wallet: <><rect x="5" y="10" width="30" height="24" rx="5"/><path d="m9 10 18-5v5"/><rect x="24" y="18" width="13" height="9" rx="3" fill="var(--toon-accent)"/><circle cx="28" cy="22.5" r="1" fill="currentColor"/></>,
    favorite: <path d="m20 5 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2Z"/>,
    service: <><path d="M7 24v-7a13 13 0 0 1 26 0v8" fill="none"/><rect x="4" y="17" width="8" height="13" rx="4"/><rect x="28" y="17" width="8" height="13" rx="4"/><path d="M32 29q-2 7-12 5" fill="none"/><rect x="16" y="31" width="8" height="5" rx="2" fill="var(--toon-accent)"/></>,
    setting: <><path d="m17 4 6 0 2 5 6-1 4 6-3 5 3 5-4 6-6-1-2 6h-6l-2-6-6 1-4-6 3-5-3-5 4-6 6 1Z"/><circle cx="20" cy="19" r="6" fill="var(--toon-accent)"/></>,
    coupon: <><path d="M5 9h30v8a4 4 0 0 0 0 8v7H5v-7a4 4 0 0 0 0-8Z"/><path d="M24 13v15m-13-7h7" fill="none"/></>,
    search: <><circle cx="17" cy="17" r="11"/><path d="m25 25 10 10" fill="none"/><path d="M12 14q2-4 6-4" fill="none" stroke="var(--toon-detail)"/></>,
    back: <path d="m25 8-12 12 12 12" fill="none"/>,
    close: <path d="m11 11 18 18m0-18L11 29" fill="none"/>,
    chevron: <path d="m10 16 10 10 10-10" fill="none"/>,
    share: <><path d="M10 20v12q0 3 3 3h17q3 0 3-3V20"/><path d="M21 25V5m-7 7 7-7 7 7" fill="none"/></>,
    check: <path d="m9 21 7 7L32 12" fill="none"/>,
    plus: <path d="M20 8v24M8 20h24" fill="none"/>,
    minus: <path d="M8 20h24" fill="none"/>,
    more: <>{[9,20,31].map(x => <circle key={x} cx={x} cy="20" r="2.5"/>)}</>,
  };
  return <svg className={`toon-icon ${className}`} viewBox="0 0 40 40" aria-hidden="true" fill="var(--toon-fill)" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{shapes[resolved] ?? shapes.product}</svg>;
}
