import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Keyboard, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AnimatedMascot } from '../../components/AnimatedMascot';
import { ActionButton, CheckRow, errorKey, Field, Sheet, ui } from '../../components/FormUI';
import { useLanguage, type TranslationKey } from '../../i18n/LanguageProvider';
import { applicationStatusKey, emptyProviderDraft, validateProviderDraft, type AccountType, type ProviderDraft, validateNickname, validatePhone } from './domain';
import { ProviderFields, ProviderReview } from './ProviderSetup';
import type { Marketplace } from './useMarketplace';
import type { OrderFilter } from './OrderScreens';
import { avatarUri } from './avatar';
import { AvatarPicker } from '../../components/AvatarPicker';
import { colors } from '../../theme';

export function AccountSheet({ visible, market, onClose, onSaved, initialMode = 'signIn' }: {
  initialMode?: 'signIn' | 'signUp'; visible: boolean; market: Marketplace; onClose: () => void; onSaved: (registeredProvider?: boolean) => void;
}) {
  const { t } = useLanguage();
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState<AccountType | null>(null);
  const [step, setStep] = useState<'account' | 'provider' | 'review'>('account');
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>({ ...emptyProviderDraft });
  const [providerErrors, setProviderErrors] = useState<Partial<Record<keyof ProviderDraft, TranslationKey>>>({});
  const [phone, setPhone] = useState(market.profile?.phone ?? '');
  const [nickname, setNickname] = useState(market.profile?.nickname ?? '');
  const [avatar, setAvatar] = useState<string | null>(market.profile?.avatarFile ?? null);
  const [picking, setPicking] = useState(false);
  const pickerLock = useRef(false);
  const [bio, setBio] = useState(market.profile?.bio ?? '');
  const [code, setCode] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<'phone' | 'nickname' | 'bio' | 'code' | 'rules' | 'passwordConfirmation', TranslationKey>>>({});
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const editing = !!market.profile;
  useEffect(() => {
    setPhone(market.profile?.phone ?? ''); setNickname(market.profile?.nickname ?? ''); setBio(market.profile?.bio ?? '');
    setAvatar(market.profile?.avatarFile ?? null);
    setCode(''); setPasswordConfirmation(''); setCodeSent(false); setAccepted(false); setRulesOpen(false); setErrors({}); setNotice(null);
  }, [market.profile?.phone]);
  const requestCode = () => {
    if (submitting.current || editing) return;
    if (!validatePhone(phone)) { setErrors(current => ({ ...current, phone: 'phoneInvalid' })); return; }
    setErrors(current => ({ ...current, phone: undefined, code: undefined })); setCodeSent(true);
  };
  const close = () => { if (!submitting.current && !pickerLock.current) { Keyboard.dismiss(); onClose(); } };
  const submit = async () => {
    if (submitting.current || pickerLock.current) return;
    const next: typeof errors = {};
    if (!validatePhone(phone)) next.phone = 'phoneInvalid';
    if ((editing || mode === 'signUp') && !validateNickname(nickname)) next.nickname = 'nicknameInvalid';
    if (bio.trim().length > 160) next.bio = 'bioInvalid';
    if (!editing && (market.hosted ? code.length < 12 || code.length > 128 : !codeSent || code !== '123456')) next.code = market.hosted ? 'passwordInvalid' : 'codeInvalid';
    if (!editing && market.hosted && mode === 'signUp' && code !== passwordConfirmation) next.passwordConfirmation = 'passwordMismatch';
    if (!editing && mode === 'signUp' && !accepted) next.rules = 'loginRulesRequired';
    setErrors(next);
    if (Object.keys(next).length) { setStep('account'); return; }
    if (!editing && mode === 'signUp' && !role) return;
    if (!editing && mode === 'signUp' && role === 'provider') {
      if (step === 'account') { Keyboard.dismiss(); setStep('provider'); return; }
      const issues = validateProviderDraft(providerDraft); setProviderErrors(issues);
      if (Object.keys(issues).length) { setStep('provider'); return; }
      if (step === 'provider') { Keyboard.dismiss(); setStep('review'); return; }
    }
    submitting.current = true; setBusy(true); setNotice(null);
    try {
      await market.authenticate(editing ? 'edit' : mode, { phone: phone.trim(), nickname: nickname.trim(), bio: bio.trim(), avatarFile: avatar, ...(!editing && mode === 'signUp' ? { accountType: role!, ...(role === 'provider' ? { providerDraft } : {}) } : {}) }, market.hosted || codeSent ? code : '', accepted);
      Keyboard.dismiss();
      onSaved(!editing && mode === 'signUp' && role === 'provider'); onClose();
    } catch (error) { setNotice(errorKey(error)); }
    finally { submitting.current = false; setBusy(false); }
  };
  const choosingRole = !editing && mode === 'signUp' && !role;
  const providerFlow = !editing && mode === 'signUp' && role === 'provider';
  return <Sheet visible={visible} title={t(editing ? 'editProfile' : mode === 'signUp' ? choosingRole ? 'chooseAccountTitle' : providerFlow ? 'providerSetupTitle' : 'playerSignupTitle' : 'signInTitle')} onClose={close} closeDisabled={busy || picking}>
    {!editing && <><View style={{ alignItems: 'center' }}><AnimatedMascot size={88} mood={notice ? 'concerned' : providerFlow ? step === 'review' ? 'waiting' : 'curious' : 'welcome'} label={t('brand')} /></View><Text style={ui.body}>{t(mode === 'signUp' ? providerFlow ? 'roleProviderBody' : 'signUpBody' : 'returningBody')}</Text></>}
    {choosingRole ? <>
      <Text style={ui.heading}>{t('chooseAccountBody')}</Text>
      {(['player', 'provider'] as const).map(value => <Pressable key={value} accessibilityRole="button" onPress={() => { setRole(value); setStep('account'); }} style={({ pressed }) => [ui.card, pressed && ui.pressed]}>
        <Text style={ui.heading}>{t(value === 'player' ? 'rolePlayer' : 'roleProvider')} ↗</Text>
        <Text style={ui.body}>{t(value === 'player' ? 'rolePlayerBody' : 'roleProviderBody')}</Text>
      </Pressable>)}
      <Text style={ui.caption}>{t('roleSharedAccount')}</Text>
    </> : <>
      {providerFlow && <Text style={ui.caption}>{t(step === 'account' ? 'providerStep1' : step === 'provider' ? 'providerStep2' : 'providerStep3')}</Text>}
      {step === 'account' ? <>
        {(editing || mode === 'signUp') && <><Text style={ui.label}>{t('avatarLabel')}</Text><AvatarPicker value={avatar} onChange={setAvatar} disabled={busy}
          onBusyChange={value => { pickerLock.current = value; setPicking(value); }} onError={setNotice} /></>}

    {(editing || mode === 'signUp') && <Field label={t('nickname')} placeholder={t('nicknamePlaceholder')} value={nickname} onChangeText={value => { setNickname(value); setErrors(current => ({ ...current, nickname: undefined })); }}
      maxLength={24} autoComplete="nickname" editable={!busy} error={errors.nickname && t(errors.nickname)} />}
    <Field label={t('phone')} placeholder={t('phonePlaceholder')} value={phone}
      onChangeText={value => { setPhone(value); setCodeSent(false); setCode(''); setErrors(current => ({ ...current, phone: undefined, code: undefined })); }} keyboardType="phone-pad"
      maxLength={11} editable={!editing && !busy} autoComplete="tel" error={errors.phone && t(errors.phone)} />
    {!editing && (market.hosted ? <>
      <Field label={t('password')} hint={t('passwordHint')} value={code} onChangeText={setCode} secureTextEntry autoCapitalize="none" autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} maxLength={128} editable={!busy} error={errors.code && t(errors.code)} />
      {mode === 'signUp' && <Field label={t('passwordConfirm')} value={passwordConfirmation} onChangeText={setPasswordConfirmation} secureTextEntry autoCapitalize="none" autoComplete="new-password" maxLength={128} editable={!busy} error={errors.passwordConfirmation && t(errors.passwordConfirmation)} />}
      <Text style={ui.caption}>{t('hostedPasswordNote')}</Text>
    </> : <>
      <ActionButton label={t('getCode')} onPress={requestCode} secondary disabled={busy || picking} />
      {codeSent && <View style={ui.notice}><Text style={ui.caption}>{t('testSmsNotice')}</Text></View>}
      <Field label={t('smsCode')} value={code} onChangeText={value => { setCode(value); setErrors(current => ({ ...current, code: undefined })); }} placeholder="123456" keyboardType="number-pad"
        maxLength={6} editable={!busy} autoComplete="one-time-code" error={errors.code && t(errors.code)} />
    </>)}
    {(editing || mode === 'signUp') && <Field label={t('bio')} placeholder={t('bioPlaceholder')} value={bio} onChangeText={value => { setBio(value); setErrors(current => ({ ...current, bio: undefined })); }} maxLength={160} multiline
      editable={!busy} error={errors.bio && t(errors.bio)} />}
    {!editing && mode === 'signUp' && <>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: rulesOpen }}
        onPress={() => setRulesOpen(current => !current)} style={ui.back}><Text style={ui.link}>{t('viewAgreements')}</Text></Pressable>
      {rulesOpen && <View style={ui.card}><Text style={ui.heading}>{t('rulesPreview')}</Text><Text style={ui.body}>{t(market.hosted ? 'hostedRulesBody' : 'accountRulesBody')}</Text></View>}
      <CheckRow label={t('loginAgreements')} checked={accepted} disabled={busy}
        onPress={() => { if (!submitting.current) setAccepted(current => !current); setErrors(current => ({ ...current, rules: undefined })); }} />
      {!!errors.rules && <Text accessibilityRole="alert" style={ui.error}>{t(errors.rules)}</Text>}
    </>}
      </> : step === 'provider' ? <ProviderFields draft={providerDraft} onChange={value => { setProviderDraft(value); setProviderErrors({}); }} errors={providerErrors} disabled={busy} onMediaBusyChange={value => { pickerLock.current = value; setPicking(value); }} /> : <>
        <View style={ui.card}>{avatarUri(avatar) && <Image source={{ uri: avatarUri(avatar)! }} accessibilityLabel={t('avatarPreview')} style={{ width: 72, height: 72, borderRadius: 36 }} />}<Text style={ui.heading}>{nickname}</Text><Text style={ui.body}>{phone.slice(0, 3)} ···· {phone.slice(7)}</Text>{!!bio && <Text style={ui.body}>{bio}</Text>}</View>
        <ProviderReview draft={providerDraft} />
      </>}
    </>}
    {!!notice && <Text accessibilityRole="alert" style={ui.error}>{t(notice)}</Text>}
    {!choosingRole && <ActionButton label={t(editing ? 'saveProfile' : mode === 'signUp' ? providerFlow ? step === 'review' ? 'providerCreateDraft' : step === 'provider' ? 'providerReview' : 'onboardNext' : 'createAccount' : 'signIn')} busy={busy} disabled={picking} onPress={() => void submit()} />}
    {!editing && mode === 'signUp' && role && <ActionButton secondary disabled={busy || picking} label={t(step === 'account' ? 'changeAccountType' : 'back')} onPress={() => {
      if (step === 'account') setRole(null); else setStep(step === 'review' ? 'provider' : 'account'); setNotice(null);
    }} />}
    {!editing && <ActionButton secondary disabled={busy || picking} label={t(mode === 'signIn' ? 'needAccount' : 'haveAccount')} onPress={() => {
      setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setStep('account'); setRole(null); setErrors({}); setNotice(null); setAccepted(false); setCode(''); setPasswordConfirmation(''); setCodeSent(false);
    }} />}
  </Sheet>;
}

export function AccountScreen({ market, languageSwitch, onAccount, onOrders, onMessages, onIntroduction, onProvider }: {
  onProvider: () => void; onIntroduction: () => void; market: Marketplace; languageSwitch: ReactNode; onAccount: () => void;
  onOrders: (filter?: OrderFilter) => void; onMessages: () => void;
}) {
  const { t, language } = useLanguage();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 370 || fontScale > 1.2;
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const signOut = async () => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(null);
    try { await market.signOut(); setConfirmSignOut(false); }
    catch (problem) { setError(errorKey(problem)); }
    finally { submitting.current = false; setBusy(false); }
  };
  const shortcuts: { filter: OrderFilter; label: TranslationKey; icon: ProfileIconKind; count: number }[] = [
    { filter: 'unpaid', label: 'profileToPay', icon: 'receipt', count: market.orders.filter(order => order.status === 'unpaid').length },
    { filter: 'awaitingService', label: 'profileToPlay', icon: 'controller', count: market.orders.filter(order => order.status === 'awaitingService').length },
    { filter: 'afterSales', label: 'profileAfterSales', icon: 'refund', count: market.orders.filter(order => !!order.refund).length },
  ];
  return <>
    <View style={profileStyles.hero}>
      <View style={[profileStyles.heroTop, compact && profileStyles.heroTopCompact]}>
        <View style={ui.flex}>
          <Text style={profileStyles.eyebrow}>{t(market.profile?.accountType === 'provider' ? 'providerEyebrow' : 'profileEyebrow')}</Text>
          <Text accessibilityRole="header" style={profileStyles.name}>{market.profile?.nickname ?? t('profileGreeting')}</Text>
          {market.profile && <Text style={profileStyles.phone}>{market.profile.phone.slice(0, 3) + ' ···· ' + market.profile.phone.slice(7)}</Text>}
        </View>
        <View style={profileStyles.mascotTile}>{avatarUri(market.profile?.avatarFile) ? <Image source={{ uri: avatarUri(market.profile?.avatarFile)! }} accessibilityLabel={t('avatarPreview')} style={{ width: 100, height: 106, borderRadius: 28 }} /> : <AnimatedMascot size={82} mood={market.profile ? 'calm' : 'welcome'} label={t('brand')} />}</View>
      </View>
      <Text style={profileStyles.heroBody}>{market.profile ? market.profile.bio || t('tagline') : t('profileGuestBody')}</Text>
      <Pressable accessibilityRole="button" onPress={onAccount} style={({ pressed }) => [profileStyles.heroButton, pressed && ui.pressed]}>
        <Text style={profileStyles.heroButtonText}>{t(market.profile ? 'editProfile' : 'signIn')}</Text>
        <Text accessible={false} style={profileStyles.heroArrow}>↗</Text>
      </Pressable>
      {market.profile && <Text style={profileStyles.accountNote}>{t(market.hosted ? 'hostedAccountNote' : 'testAccount')}</Text>}
    </View>

    {!!market.profile && <View style={profileStyles.panel}>
      <Text accessibilityRole="header" style={profileStyles.sectionTitle}>{t(market.profile.providerApplication ? applicationStatusKey(market.profile, market.hosted) : market.profile.accountType === 'provider' ? 'providerDraftTitle' : 'becomeProvider')}</Text>
      <Text style={profileStyles.caption}>{t(market.profile.providerApplication ? market.hosted ? 'hostedApplicationBody' : 'applicationPendingBody' : market.profile.accountType === 'provider' ? market.hosted ? 'hostedDraftBody' : 'providerDraftBody' : 'roleProviderBody')}</Text>
      
      <ActionButton label={t(market.profile.accountType === 'provider' ? 'providerViewProfile' : 'providerStart')} onPress={onProvider} secondary />
    </View>}
    <View style={profileStyles.panel}>
      <View style={profileStyles.sectionHeader}>
        <Text accessibilityRole="header" style={[profileStyles.sectionTitle, ui.flex]}>{t('profileOrders')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('ordersAll')} onPress={() => onOrders('all')} style={profileStyles.viewAll}>
          <Text style={profileStyles.viewAllText}>{t('profileViewAll')} <Text accessible={false}>›</Text></Text>
        </Pressable>
      </View>
      <View style={[profileStyles.shortcuts, compact && profileStyles.shortcutsCompact]}>
        {shortcuts.map(item => <Pressable key={item.filter} accessibilityRole="button"
          accessibilityLabel={t(item.label) + (market.profile ? `: ${item.count}` : '')}
          onPress={() => onOrders(item.filter)} style={({ pressed }) => [profileStyles.shortcut, compact && profileStyles.shortcutCompact, pressed && ui.pressed]}>
          <View style={profileStyles.iconTile}>
            <ProfileIcon kind={item.icon} />
            {!!market.profile && item.count > 0 && <View style={profileStyles.badge}><Text style={profileStyles.badgeText}>{item.count > 99 ? '99+' : item.count}</Text></View>}
          </View>
          <Text style={profileStyles.shortcutLabel}>{t(item.label)}</Text>
        </Pressable>)}
      </View>
    </View>

    <Pressable accessibilityRole="button" accessibilityLabel={t('messages') + (market.profile ? `: ${market.conversations.length}` : '')}
      onPress={onMessages} style={({ pressed }) => [profileStyles.messageCard, pressed && ui.pressed]}>
      <View style={profileStyles.smallIconTile}><ProfileIcon kind="chat" /></View>
      <View style={ui.flex}><Text style={profileStyles.sectionTitle}>{t('messages')}</Text><Text style={profileStyles.caption}>{t('profileChatsBody')}</Text></View>
      {market.profile && market.conversations.length > 0 && <View style={profileStyles.countPill}><Text style={profileStyles.countText}>{market.conversations.length}</Text></View>}
      <Text accessible={false} style={profileStyles.chevron}>›</Text>
    </Pressable>

    <View style={profileStyles.panel}>
      <Text accessibilityRole="header" style={profileStyles.preferences}>{t('profilePreferences')}</Text>
      <View style={profileStyles.languageRow}>
        <View style={profileStyles.languageInfo}><View style={profileStyles.smallIconTile}><ProfileIcon kind="globe" /></View>
          <View style={ui.flex}><Text style={profileStyles.sectionTitle}>{t('language')}</Text><Text style={profileStyles.caption}>{language === 'zh' ? '简体中文' : 'English'}</Text></View>
        </View>
        {languageSwitch}
      </View>
      <Text style={profileStyles.caption}>{t('languageNote')}</Text>
      <ActionButton secondary label={t('onboardReplay')} onPress={onIntroduction} />
      {market.profile && <Pressable accessibilityRole="button" onPress={() => { setError(null); setConfirmSignOut(true); }}
        style={({ pressed }) => [profileStyles.signOut, pressed && ui.pressed]}>
        <Text style={profileStyles.signOutText}>{t('signOut')}</Text><Text accessible={false} style={profileStyles.chevron}>›</Text>
      </Pressable>}
    </View>

    <Sheet visible={confirmSignOut} title={t('signOutTitle')} closeDisabled={busy} onClose={() => { if (!submitting.current) setConfirmSignOut(false); }}>
      <Text style={ui.body}>{t('signOutBody')}</Text>
      {!!error && <Text accessibilityRole="alert" style={ui.error}>{t(error)}</Text>}
      <ActionButton label={t('signOut')} busy={busy} onPress={() => void signOut()} secondary />
    </Sheet>
  </>;
}

type ProfileIconKind = 'receipt' | 'controller' | 'refund' | 'chat' | 'globe';
function ProfileIcon({ kind }: { kind: ProfileIconKind }) {
  return <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={profileStyles.icon}>
    {kind === 'receipt' ? <View style={profileStyles.receipt}><View style={profileStyles.receiptLine} /><View style={profileStyles.receiptLine} /><View style={[profileStyles.receiptLine, { width: 7 }]} /></View>
      : kind === 'controller' ? <View style={profileStyles.controller}><View style={profileStyles.crossHorizontal} /><View style={profileStyles.crossVertical} /><View style={profileStyles.gameDot} /><View style={[profileStyles.gameDot, { right: 4, top: 4 }]} /></View>
      : kind === 'refund' ? <Text style={profileStyles.refundIcon}>↺</Text>
      : kind === 'chat' ? <><View style={profileStyles.chat}><View style={profileStyles.chatDot} /><View style={profileStyles.chatDot} /><View style={profileStyles.chatDot} /></View><View style={profileStyles.chatTail} /></>
      : <View style={profileStyles.globe}><View style={profileStyles.meridian} /><View style={profileStyles.equator} /></View>}
  </View>;
}
const profileStyles = StyleSheet.create({
  hero: { backgroundColor: colors.navy, borderRadius: 28, padding: 22, gap: 18, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 16 }, heroTopCompact: { flexDirection: 'column-reverse', alignItems: 'stretch' },
  eyebrow: { color: '#A4D2FF', fontSize: 10, lineHeight: 16, letterSpacing: 1.8, fontWeight: '700', marginBottom: 8 },
  name: { color: '#FFFFFF', fontSize: 24, lineHeight: 32, fontWeight: '800' }, phone: { color: '#BCD9F8', fontSize: 13, lineHeight: 20, marginTop: 8 },
  mascotTile: { width: 100, height: 106, backgroundColor: '#E2F1FF', borderRadius: 28, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#F5FBFF' },
  heroBody: { color: '#D1E6FF', fontSize: 14, lineHeight: 22 },
  heroButton: { minHeight: 48, borderRadius: 15, backgroundColor: '#FFFFFF', paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heroButtonText: { color: colors.navy, fontSize: 15, lineHeight: 22, fontWeight: '700', flex: 1 }, heroArrow: { color: colors.primary, fontSize: 22 },
  accountNote: { color: '#BCD9F8', fontSize: 11, lineHeight: 17 },
  panel: { padding: 18, gap: 14, borderRadius: 24, backgroundColor: colors.card, borderWidth: 1, borderColor: '#E3EDF8' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 }, sectionTitle: { color: colors.navy, fontSize: 17, lineHeight: 24, fontWeight: '700' },
  viewAll: { minHeight: 44, justifyContent: 'center', paddingLeft: 6 }, viewAllText: { color: colors.secondaryText, fontSize: 12, lineHeight: 19, fontWeight: '600' },
  shortcuts: { flexDirection: 'row', gap: 8 }, shortcutsCompact: { flexDirection: 'column' },
  shortcut: { flex: 1, alignItems: 'center', gap: 10, paddingVertical: 6, minHeight: 88 }, shortcutCompact: { flex: 0, flexDirection: 'row', minHeight: 60, gap: 14 },
  iconTile: { width: 50, height: 50, borderRadius: 17, backgroundColor: '#EEF6FF', alignItems: 'center', justifyContent: 'center' },
  shortcutLabel: { color: colors.navy, fontSize: 12, lineHeight: 18, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 19, minHeight: 19, paddingHorizontal: 4, borderRadius: 10, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', lineHeight: 14 },
  messageCard: { padding: 18, borderRadius: 24, borderWidth: 1, borderColor: '#E3EDF8', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 12 },
  smallIconTile: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#EEF6FF', alignItems: 'center', justifyContent: 'center' },
  caption: { color: colors.secondaryText, fontSize: 12, lineHeight: 19 }, chevron: { fontSize: 25, color: colors.secondaryText },
  countPill: { minWidth: 25, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10, backgroundColor: colors.highlight }, countText: { color: colors.navy, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  preferences: { fontSize: 10, lineHeight: 17, letterSpacing: 1.4, fontWeight: '700', color: colors.secondaryText },
  languageRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }, languageInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 135 },
  signOut: { minHeight: 48, borderTopWidth: 1, borderTopColor: '#EAF1F9', paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, signOutText: { fontSize: 14, lineHeight: 21, color: '#B42318', fontWeight: '600' },
  icon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  receipt: { width: 18, height: 23, borderWidth: 1.8, borderColor: colors.primary, borderRadius: 4, paddingHorizontal: 3, paddingTop: 5, gap: 3 }, receiptLine: { height: 1.5, width: 9, backgroundColor: colors.primary },
  controller: { width: 26, height: 18, borderRadius: 7, borderWidth: 1.8, borderColor: colors.primary }, crossHorizontal: { position: 'absolute', width: 8, height: 1.8, backgroundColor: colors.primary, left: 3, top: 6.3 }, crossVertical: { position: 'absolute', height: 8, width: 1.8, backgroundColor: colors.primary, left: 6, top: 3 }, gameDot: { position: 'absolute', width: 3, height: 3, borderRadius: 2, backgroundColor: colors.primary, right: 7, top: 8 },
  refundIcon: { fontSize: 31, lineHeight: 34, color: colors.primary, marginTop: -2 },
  chat: { width: 24, height: 18, borderWidth: 1.8, borderRadius: 6, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }, chatDot: { width: 2.5, height: 2.5, borderRadius: 2, backgroundColor: colors.primary }, chatTail: { position: 'absolute', width: 6, height: 6, borderLeftWidth: 1.8, borderBottomWidth: 1.8, borderColor: colors.primary, backgroundColor: '#EEF6FF', transform: [{ skewY: '-30deg' }], bottom: 2, left: 7 },
  globe: { width: 23, height: 23, borderWidth: 1.8, borderRadius: 12, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, meridian: { width: 10, height: 23, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary }, equator: { position: 'absolute', height: 1.5, width: 22, backgroundColor: colors.primary },
});
