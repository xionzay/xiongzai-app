import { Image } from 'react-native';
import back from '../../assets/chat-controls/back.png';
import sound from '../../assets/chat-controls/sound.png';
import smile from '../../assets/chat-controls/smile.png';
import plus from '../../assets/chat-controls/plus.png';
import shield from '../../assets/chat-controls/shield.png';
const sources = { back, sound, smile, plus, shield };
export function ChatControlIcon({ kind, size = 26 }: { kind: keyof typeof sources; size?: number }) {
  return <Image source={sources[kind]} style={{ width: size, height: size }} resizeMode="contain" accessible={false} />;
}
