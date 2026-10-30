import { Image, Text } from 'react-native';
import { jellyAssets } from './jelly-assets';
const iconKinds = {
  back: 'back', chevron: 'chevron', check: 'check', close: 'close', plus: 'plus', minus: 'minus',
  star: 'rating-filled', outline: 'rating-outline', male: 'male', female: 'female', warning: 'warning',
  search: 'search', image: 'image', more: 'more', target: 'target', share: 'share',
  play: 'play', pause: 'pause', heartFilled: 'heart-filled', heartOutline: 'heart-outline',
} as const;
export function JellyIcon({ kind, size = 16, right = false, up = false, label }: { kind: keyof typeof iconKinds; size?: number; right?: boolean; up?: boolean; label?: string }) {
  const flip = (kind === 'back' && right) || (kind === 'chevron' && up);
  return <Image source={jellyAssets[iconKinds[kind]]} resizeMode="contain" accessible={Boolean(label)} accessibilityLabel={label}
    style={{ width: size, height: size, transform: [{ rotate: flip ? '180deg' : '0deg' }] }} />;
}
const symbolKinds: Record<string, keyof typeof iconKinds> = {
  '‹': 'back', '›': 'back', '⌄': 'chevron', '⌃': 'chevron', '✓': 'check', '×': 'close',
  '+': 'plus', '−': 'minus', '★': 'star', '☆': 'outline', '♂': 'male', '♀': 'female',
  '!': 'warning', '⌕': 'search', '◇': 'image', '…': 'more', '◎': 'target', '↥': 'share',
  '▶': 'play', 'Ⅱ': 'pause', '♥': 'heartFilled', '♡': 'heartOutline',
};
export function JellySymbol({ symbol, size = 24 }: { symbol: string; size?: number }) {
  const kind = symbolKinds[symbol];
  return kind ? <JellyIcon kind={kind} size={size} right={symbol === '›'} up={symbol === '⌃'} /> : <Text>{symbol}</Text>;
}
export function JellyLabel({ text }: { text: string }) { return <>{text}</>; }
