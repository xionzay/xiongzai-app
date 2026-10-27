import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { en } from './en';
import { zh } from './zh';
export type Language = 'en' | 'zh';
export type TranslationKey = keyof typeof en;
const dictionaries = { en, zh };
const preferenceFile = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}language.json` : null;
const LanguageContext = createContext<{
  language: Language; ready: boolean; saveError: boolean;
  setLanguage: (language: Language) => void; t: (key: TranslationKey) => string;
} | null>(null);
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<Language>(() => Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('zh') ? 'zh' : 'en');
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (preferenceFile && (await FileSystem.getInfoAsync(preferenceFile)).exists) {
          const saved: unknown = JSON.parse(await FileSystem.readAsStringAsync(preferenceFile));
          if (active && (saved === 'en' || saved === 'zh')) updateLanguage(saved);
        }
      } catch { /* Missing/corrupt preference uses the device language. */ }
      finally { if (active) setReady(true); }
    })();
    return () => { active = false; };
  }, []);
  const setLanguage = (next: Language) => {
    updateLanguage(next);
    writes.current = writes.current.catch(() => {}).then(async () => {
      try {
        if (!preferenceFile) throw new Error('Storage unavailable');
        await FileSystem.writeAsStringAsync(preferenceFile, JSON.stringify(next));
        setSaveError(false);
      } catch { setSaveError(true); }
    });
  };
  return <LanguageContext.Provider value={{ language, ready, saveError, setLanguage, t: key => dictionaries[language][key] }}>{children}</LanguageContext.Provider>;
}
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('LanguageProvider is required');
  return context;
}
