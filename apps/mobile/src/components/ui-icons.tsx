import { Image } from 'react-native';
import { jellyAssets } from './jelly-assets';
type IconProps = { color?: string; size?: number };
function ControlIcon({ kind, size, right = false }: { kind: 'back' | 'target' | 'refresh'; size: number; right?: boolean }) {
  return <Image accessible={false} source={jellyAssets[kind]} resizeMode="contain"
    style={{ width: size, height: size, transform: [{ rotate: right ? '180deg' : '0deg' }] }} />;
}
export function ChevronLeftIcon({ size = 20 }: IconProps) { return <ControlIcon kind="back" size={size} />; }
export function ChevronRightIcon({ size = 20 }: IconProps) { return <ControlIcon kind="back" size={size} right />; }
export function TargetIcon({ size = 24 }: IconProps) { return <ControlIcon kind="target" size={size} />; }
export function RefreshIcon({ size = 22 }: IconProps) { return <ControlIcon kind="refresh" size={size} />; }
