import { NotificationHost, NotificationProvider } from './src/components/Notifications';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from './src/i18n/LanguageProvider';
import { PrototypeApp } from './src/screens/PrototypeApp';
export default function App() {
  return <SafeAreaProvider><LanguageProvider><NotificationProvider><StatusBar style="dark" /><PrototypeApp /><NotificationHost /></NotificationProvider></LanguageProvider></SafeAreaProvider>;
}
