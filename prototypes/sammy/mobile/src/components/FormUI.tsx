import {gameName} from '../features/marketplace/catalog';
import { NotificationHost } from './Notifications';
import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage, type Language, type TranslationKey } from '../i18n/LanguageProvider';
import { colors } from '../theme';
import { AnimatedMascot, type MascotMood } from './AnimatedMascot';
import type { LocalizedText, ServiceSnapshot } from '../features/marketplace/domain';

export function money(fen: number, language: Language) {
  return new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    style: 'currency', currency: 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(fen / 100);
}
export function dateTime(time: number, language: Language) {
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(time);
}
export function localized(text: LocalizedText, language: Language) { return text[language]; }

export function ActionButton({ label, onPress, busy = false, disabled = false, secondary = false }: {
  label: string; onPress: () => void; busy?: boolean; disabled?: boolean; secondary?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [ui.button, secondary && ui.secondaryButton, (busy || disabled) && ui.disabled, pressed && ui.pressed]}>
    {busy ? <ActivityIndicator color={secondary ? colors.primary : colors.card} /> :
      <Text style={[ui.buttonText, secondary && ui.secondaryText]}>{label}</Text>}
  </Pressable>;
}
export function Field({ label, error, hint, ...props }: TextInputProps & { label: string; error?: string; hint?: string }) {
  return <View style={ui.field}>
    <Text style={ui.label}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={colors.secondaryText} {...props}
      style={[ui.input, props.multiline && ui.multiline, props.style, !!error && ui.inputError]} />
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : hint ? <Text style={ui.caption}>{hint}</Text> : null}
  </View>;
}
export function CheckRow({ label, checked, onPress, disabled = false }: { label: string; checked: boolean; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress} style={[ui.checkRow, disabled && ui.disabled]}>
    <View style={[ui.checkBox, checked && ui.checkSelected]}><Text style={ui.checkMark}>{checked ? '✓' : ''}</Text></View>
    <Text style={[ui.body, ui.flex]}>{label}</Text>
  </Pressable>;
}
export function Choice({ label, selected, onPress, disabled = false }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected, disabled }} disabled={disabled}
    onPress={onPress} style={[ui.choice, selected && ui.choiceSelected, disabled && ui.disabled]}>
    <Text style={[ui.choiceText, selected && ui.choiceTextSelected]}>{label}</Text>
  </Pressable>;
}
export function SummaryRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <View style={ui.summaryRow}><Text style={ui.caption}>{label}</Text><Text style={[ui.summaryValue, emphasis && ui.total]}>{value}</Text></View>;
}
export function ServiceSummary({ service, quantity }: { service: ServiceSnapshot; quantity: number }) {
  const { language, t } = useLanguage();
  return <View style={ui.card}>
    <View style={ui.row}><View style={[ui.avatar, { backgroundColor: service.tint }]}><Text style={ui.initial}>{service.initials}</Text></View>
      <View style={ui.flex}><Text style={ui.label}>{service.name}</Text><Text style={ui.body}>{localized(service.title, language)}</Text></View>
    </View>
    <Text style={ui.caption}>{gameName(service.game??'peaceElite',language)} · {t(service.mode === 'duo' ? 'modeDuo' : 'modeSquad')}</Text>
    <SummaryRow label={t('unitPrice')} value={money(service.unitPriceFen, language) + ' ' + t('perHour')} />
    <SummaryRow label={t('duration')} value={String(quantity) + ' ' + t(quantity === 1 ? 'hour' : 'hours')} />
  </View>;
}
export function EmptyState({ title, body, mood = 'waiting' }: { title: string; body: string; mood?: MascotMood }) {
  return <View style={ui.empty}><View style={ui.emptyImage}><AnimatedMascot label={title} size={110} mood={mood} /></View>
    <Text style={ui.title}>{title}</Text><Text style={ui.body}>{body}</Text></View>;
}
export function Sheet({ visible, title, onClose, children, closeDisabled = false }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; closeDisabled?: boolean }) {
  const { t } = useLanguage();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!closeDisabled) onClose(); }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={ui.overlay}>
      <SafeAreaView style={ui.sheet} edges={['bottom']}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={ui.content}>
          <View style={ui.row}><Text accessibilityRole="header" style={[ui.heading, ui.flex]}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('close')} accessibilityState={{ disabled: closeDisabled }} disabled={closeDisabled} onPress={onClose} style={[ui.close, closeDisabled && ui.disabled]}><Text style={ui.link}>×</Text></Pressable></View>
          {children}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
    {visible && <NotificationHost />}
  </Modal>;
}
const knownErrors = new Set<string>(['hostedContentUnavailable','productApprovalRequired','productReviewPending','ruleVersionUnsupported','orderSimulationDisabled','ownServicePurchase','orderQuoteChanged','orderRequestConflict','paymentRequestConflict','paymentPending','accountSuspended','publicationRestricted','listingHostedRequired','listingUnavailable','listingConflict','listingLimit','providerApprovalRequired','hostedUnavailable','hostedMediaUnavailable','hostedMediaInvalid','hostedBuildRequired','apiUrlInvalid','invalidCredentials','sessionExpired','hostedFeatureUnavailable','hostedAccountMediaRetry','storageNotConfigured','tooManyAttempts','applicationIncomplete', 'applicationAgreementRequired', "voiceInvalid","voiceBuildRequired","voicePermissionDenied","voiceLengthError","voiceFormatError","voiceSizeError","voiceUnavailable","voiceInterrupted", 'avatarTooLarge', 'avatarBuildRequired', 'providerFieldsRequired', 'accountNotFound', 'accountExists', 'codeInvalid', 'phoneInvalid', 'loginRulesRequired',
  'signInRequired', 'orderUnavailable', 'orderNotPayable', 'orderCannotCancel', 'refundUnavailableNow',
  'invalidRefund', 'invalidQuote', 'invalidOrder', 'checkFields', 'messageInvalid', 'storageUnavailable',
]);
export function errorKey(error: unknown): TranslationKey {
  return error instanceof Error && knownErrors.has(error.message) ? error.message as TranslationKey : 'saveFailed';
}

export const ui = StyleSheet.create({
  flex: { flex: 1 }, fill: { flex: 1 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  page: { flex: 1, backgroundColor: colors.background }, content: { padding: 20, gap: 18, paddingBottom: 30 },
  title: { fontSize: 26, lineHeight: 34, fontWeight: '800', color: colors.navy },
  heading: { fontSize: 19, lineHeight: 26, fontWeight: '700', color: colors.navy },
  body: { fontSize: 15, lineHeight: 23, color: colors.secondaryText },
  caption: { fontSize: 13, lineHeight: 20, color: colors.secondaryText }, label: { fontSize: 15, lineHeight: 22, fontWeight: '700', color: colors.navy },
  card: { borderRadius: 22, padding: 18, gap: 12, borderWidth: 1, borderColor: '#E5EEF8', backgroundColor: colors.card },
  notice: { padding: 14, gap: 6, backgroundColor: colors.highlight, borderRadius: 16 },
  button: { minHeight: 50, borderRadius: 16, backgroundColor: colors.primary, paddingVertical: 13, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.card, fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  secondaryButton: { backgroundColor: colors.card, borderWidth: 1, borderColor: '#BED9F5' }, secondaryText: { color: colors.navy },
  disabled: { opacity: 0.5 }, pressed: { opacity: 0.72 }, field: { gap: 7 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#BED9F5', borderRadius: 14, backgroundColor: colors.card, color: colors.navy, fontSize: 16, paddingVertical: 13, paddingHorizontal: 14 },
  multiline: { minHeight: 100, textAlignVertical: 'top' }, inputError: { borderColor: '#B42318' },
  error: { color: '#B42318', fontSize: 13, lineHeight: 20 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 15, paddingVertical: 11, borderRadius: 14, borderWidth: 1, borderColor: '#BED9F5', backgroundColor: colors.card },
  choiceSelected: { backgroundColor: colors.navy, borderColor: colors.navy },
  choiceText: { color: colors.navy, fontSize: 14, lineHeight: 21, fontWeight: '600' }, choiceTextSelected: { color: colors.card },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  checkBox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: '#8CACD0', alignItems: 'center', justifyContent: 'center' },
  checkSelected: { borderColor: colors.primary, backgroundColor: colors.primary }, checkMark: { fontSize: 15, fontWeight: '800', color: colors.card },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  summaryValue: { color: colors.navy, fontSize: 15, lineHeight: 22, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  total: { fontSize: 24, lineHeight: 30, fontWeight: '800' }, avatar: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.navy, fontSize: 24, fontWeight: '700' },
  footer: { padding: 18, gap: 12, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: '#E5EEF8' },
  back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, link: { color: colors.primary, fontSize: 15, lineHeight: 22, fontWeight: '700' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: 28, gap: 16 }, emptyImage: { width: 110, height: 110, alignSelf: 'center', borderRadius: 28, marginBottom: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(8,46,114,0.35)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.background, overflow: 'hidden' },
});
