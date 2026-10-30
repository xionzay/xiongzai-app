import { Image } from 'react-native';
import { jellyAssets } from './jelly-assets';
type IllustrationKind = keyof typeof jellyAssets;
export function ApprovedIllustration({ kind, size = 40, rotation = 0 }: { kind: IllustrationKind; size?: number; rotation?: number }) {
  return <Image accessible={false} importantForAccessibility="no-hide-descendants" source={jellyAssets[kind]}
    resizeMode="contain" style={{ width: size, height: size, transform: [{ rotate: `${rotation}deg` }] }} />;
}
