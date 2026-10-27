import { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton, dateTime, EmptyState, errorKey, ui } from '../../components/FormUI';
import { useLanguage, type TranslationKey } from '../../i18n/LanguageProvider';
import { colors } from '../../theme';
import { demoServices, type DemoService } from '../../screens/demo-services';
import type { Marketplace } from './useMarketplace';

export function MessagesScreen({ market, onOpen, onSignIn }: {
  market: Marketplace; onOpen: (id: string) => void; onSignIn: () => void;
}) {
  const { t, language } = useLanguage();
  const conversations = market.conversations.flatMap(conversation => {
    const service = demoServices.find(item => item.id === conversation.serviceId);
    return service ? [{ service, latest: conversation.messages.at(-1) }] : [];
  }).sort((a, b) => (b.latest?.createdAt ?? 0) - (a.latest?.createdAt ?? 0));
  return <ScrollView contentContainerStyle={ui.content}>
    <Text accessibilityRole="header" style={ui.title}>{t('messages')}</Text>
    {!market.profile ? <><EmptyState mood="welcome" title={t('signInTitle')} body={t('signInRequired')} /><ActionButton label={t('signIn')} onPress={onSignIn} /></> :
      conversations.length ? conversations.map(({ service, latest }) => {
        return <Pressable key={service.id} accessibilityRole="button"
          accessibilityLabel={[service.name, latest?.text, latest && dateTime(latest.createdAt, language)].filter(Boolean).join('. ')}
          onPress={() => onOpen(service.id)} style={ui.card}>
          <View style={ui.row}><View style={[ui.avatar, { backgroundColor: service.tint }]}><Text style={ui.initial}>{service.initials}</Text></View>
            <View style={ui.flex}><Text style={ui.heading}>{service.name}</Text><Text numberOfLines={2} style={ui.body}>{latest?.text}</Text></View></View>
          {latest && <Text style={ui.caption}>{dateTime(latest.createdAt, language)}</Text>}
        </Pressable>;
      }) : <EmptyState mood="waiting" title={t('noMessagesTitle')} body={t('noMessagesBody')} />}
  </ScrollView>;
}

export function ConversationScreen({ service, market, draft, onDraftChange, onBack, onService, onSignIn }: {
  service: DemoService; market: Marketplace; draft: string; onDraftChange: (text: string) => void;
  onBack: () => void; onService: () => void; onSignIn: () => void;
}) {
  const { t, language } = useLanguage();
  const messages = market.conversations.find(item => item.serviceId === service.id)?.messages ?? [];
  const scroll = useRef<ScrollView>(null);
  const submitting = useRef(false);
  const currentDraft = useRef(draft);
  currentDraft.current = draft;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const send = async () => {
    if (submitting.current || !draft.trim()) return;
    if (!market.profile) { onSignIn(); return; }
    if (draft.trim().length > 500) { setNotice('messageInvalid'); return; }
    const submittedDraft = draft;
    submitting.current = true; setBusy(true); setNotice(null);
    try {
      await market.sendMessage(service.id, submittedDraft);
      if (currentDraft.current === submittedDraft) onDraftChange('');
    }
    catch (error) { setNotice(errorKey(error)); }
    finally { submitting.current = false; setBusy(false); }
  };
  const navigate = (action: () => void) => { if (!submitting.current) { Keyboard.dismiss(); action(); } };
  return <KeyboardAvoidingView style={ui.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel={t('back')}
      accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => navigate(onBack)} style={[ui.back, busy && ui.disabled]}><Text style={ui.link}>‹ {t('back')}</Text></Pressable>
      <Text accessibilityRole="header" style={ui.heading}>{service.name}</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${t('service')}: ${t(service.title)}`}
      accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => navigate(onService)} style={[styles.service, busy && ui.disabled]}>
      <Text style={ui.label}>{t(service.title)} ↗</Text><Text style={ui.caption}>{t('game')} · {t(service.category)}</Text></Pressable>
    <ScrollView ref={scroll} style={ui.flex} contentContainerStyle={ui.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
      onLayout={() => scroll.current?.scrollToEnd({ animated: false })}
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
      {!messages.length && <EmptyState mood={notice ? 'concerned' : busy ? 'waiting' : draft.trim() ? 'curious' : 'waiting'} title={t('conversationEmpty')} body={t('conversationEmptyBody')} />}
      {messages.map(message => <View key={message.id} style={styles.message}>
        <Text style={styles.messageText}>{message.text}</Text><Text style={styles.meta}>{dateTime(message.createdAt, language)} · {t('messageSaved')}</Text>
      </View>)}
    </ScrollView>
    <View style={ui.footer}>
      <Text style={ui.caption}>{t('chatTestNotice')}</Text>
      {notice && <Text accessibilityRole="alert" style={ui.error}>{t(notice)}</Text>}
      {!market.profile && <ActionButton label={t('signIn')} onPress={() => navigate(onSignIn)} secondary />}
      <View style={styles.composer}><TextInput accessibilityLabel={t('messagePlaceholder')} placeholder={t('messagePlaceholder')}
        placeholderTextColor={colors.secondaryText} multiline maxLength={500} value={draft}
        onChangeText={text => { if (!submitting.current) { currentDraft.current = text; onDraftChange(text); setNotice(null); } }}
        accessibilityState={{ disabled: busy }} editable={!busy} style={styles.input} />
        <ActionButton label={t('send')} busy={busy} disabled={!draft.trim()} onPress={() => void send()} /></View>
    </View>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 8, gap: 4 }, service: { marginHorizontal: 20, padding: 14, borderRadius: 16, backgroundColor: colors.highlight, gap: 4 },
  message: { maxWidth: '88%', alignSelf: 'flex-end', borderRadius: 19, borderBottomRightRadius: 5, backgroundColor: colors.primary, padding: 14, gap: 7 },
  messageText: { color: '#fff', fontSize: 16, lineHeight: 24 }, meta: { color: '#EAF4FF', fontSize: 11, lineHeight: 17 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 }, input: { flex: 1, minHeight: 50, maxHeight: 120, backgroundColor: colors.background,
    borderWidth: 1, borderColor: '#BED9F5', borderRadius: 15, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15, lineHeight: 23, color: colors.navy, textAlignVertical: 'top' },
});
