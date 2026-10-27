import type { TranslationKey } from '../../i18n/LanguageProvider';

export type LocalizedText = { en: string; zh: string };
export type PlayMode = 'duo' | 'squad';
export type GameServer = 'wechat' | 'qq';
export type OrderStatus = 'unpaid' | 'awaitingService' | 'closed';
export type RefundReason = 'changedPlans' | 'incorrectDetails' | 'serviceUnavailable';
export type DeliveryDetails = { gameName: string; gameId: string; server: GameServer | ''; note: string };
export type AccountType = 'player' | 'provider';
export type VoiceIntroduction = { file: string; durationMs: number };
export function validVoiceIntroduction(value: unknown): value is VoiceIntroduction {
  return object(value) && typeof value.file === 'string' && /^voice-[a-z0-9-]+\.(m4a|mp3|aac)$/.test(value.file) &&
    typeof value.durationMs === 'number' && Number.isSafeInteger(value.durationMs) && value.durationMs >= 10_000 && value.durationMs <= 30_000;
}
export type ProviderDraft = { gameName: string; gameId: string; server: GameServer | ''; rank: string; kd: string; experience: string; playStyle: string; mode: PlayMode | ''; voiceIntroduction?: VoiceIntroduction | null };
export const emptyProviderDraft: ProviderDraft = { gameName: '', gameId: '', server: '', rank: '', kd: '', experience: '', playStyle: '', mode: '' };
export type ProviderApplication = { id?: string; status: 'pending' | 'approved' | 'changes_requested'; reason?: string | null; submittedAt: number; agreementVersion: 'preview-v1' | 'prototype-hosted-v1'; snapshot: { nickname: string; bio: string; avatarFile: string; draft: ProviderDraft } };
export type Profile = {accountRestricted?:boolean; providerApplication?: ProviderApplication; phone: string; nickname: string; bio: string; avatarFile?: string | null; accountType?: AccountType; providerDraft?: ProviderDraft };
export function applicationStatusKey(profile: Profile, hosted: boolean): TranslationKey {
  if (!hosted) return 'applicationPending';
  return profile.providerApplication?.status === 'approved' ? 'hostedReviewApproved' : profile.providerApplication?.status === 'changes_requested' ? 'hostedReviewChanges' : 'hostedReviewPending';
}
export function validateProviderDraft(draft: ProviderDraft): Partial<Record<keyof ProviderDraft, TranslationKey>> {
  const errors: Partial<Record<keyof ProviderDraft, TranslationKey>> = {};
  if (!draft.gameName.trim() || draft.gameName.trim().length > 32) errors.gameName = 'invalidGameName';
  if (!/^[A-Za-z0-9_-]{4,32}$/.test(draft.gameId.trim())) errors.gameId = 'invalidGameId';
  if (draft.server !== 'wechat' && draft.server !== 'qq') errors.server = 'serverRequired';
  if (!draft.rank.trim() || draft.rank.trim().length > 40) errors.rank = 'providerRankError';
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(draft.kd.trim())) errors.kd = 'providerKdError';
  if (!draft.experience.trim() || draft.experience.trim().length > 160) errors.experience = 'providerExperienceError';
  if (!draft.playStyle.trim() || draft.playStyle.trim().length > 160) errors.playStyle = 'providerStyleError';
  if (draft.mode !== 'duo' && draft.mode !== 'squad') errors.mode = 'providerModeError';
  if (draft.voiceIntroduction != null && !validVoiceIntroduction(draft.voiceIntroduction)) errors.voiceIntroduction = 'voiceInvalid';
  return errors;
}
export function saveProviderDraft(state: MarketplaceState, draft: ProviderDraft, avatarFile?: string | null): MarketplaceState {
  if (!state.profile) throw new Error('signInRequired');
  if (Object.keys(validateProviderDraft(draft)).length) throw new Error('providerFieldsRequired');
  const clean: ProviderDraft = { ...draft, gameName: draft.gameName.trim(), gameId: draft.gameId.trim(),
    rank: draft.rank.trim(), kd: draft.kd.trim(), experience: draft.experience.trim(), playStyle: draft.playStyle.trim() };
  if (avatarFile !== undefined && !validAvatarFile(avatarFile)) throw new Error('checkFields');
  const profile: Profile = { ...state.profile, accountType: 'provider', providerDraft: clean,
    ...(avatarFile !== undefined ? { avatarFile } : {}) };
  return { ...state, profile, accounts: [...(state.accounts ?? []).filter(item => item.phone !== profile.phone), profile] };
}
export function providerApplicationChecklist(profile: Profile) {
  return {
    game: !!profile.providerDraft && validProviderDraft(profile.providerDraft),
    photoBio: typeof profile.avatarFile === 'string' && validAvatarFile(profile.avatarFile) && !!profile.bio.trim(),
    voice: validVoiceIntroduction(profile.providerDraft?.voiceIntroduction),
  };
}
export function submitProviderApplication(state: MarketplaceState, accepted: boolean, now: number): MarketplaceState {
  const current = state.profile;
  if (!current) throw new Error('signInRequired');
  if (current.providerApplication) return state;
  if (!accepted) throw new Error('applicationAgreementRequired');
  if (!Number.isSafeInteger(now) || now <= 0 || current.accountType !== 'provider' || !Object.values(providerApplicationChecklist(current)).every(Boolean)) throw new Error('applicationIncomplete');
  const draft = current.providerDraft!;
  const profile: Profile = { ...current, providerApplication: {
    status: 'pending', submittedAt: now, agreementVersion: 'preview-v1',
    snapshot: { nickname: current.nickname, bio: current.bio, avatarFile: current.avatarFile!,
      draft: { ...draft, voiceIntroduction: { ...draft.voiceIntroduction! } } },
  } };
  return { ...state, profile, accounts: [...(state.accounts ?? []).filter(item => item.phone !== profile.phone), profile] };
}
function validProviderApplication(value: unknown): value is ProviderApplication {
  if (!object(value) || value.status !== 'pending' || value.agreementVersion !== 'preview-v1' || !Number.isSafeInteger(value.submittedAt) || (value.submittedAt as number) <= 0 || !object(value.snapshot)) return false;
  const snap = value.snapshot;
  return typeof snap.nickname === 'string' && validateNickname(snap.nickname) && typeof snap.bio === 'string' && !!snap.bio.trim() && snap.bio.length <= 160 &&
    typeof snap.avatarFile === 'string' && validAvatarFile(snap.avatarFile) && validProviderDraft(snap.draft) && validVoiceIntroduction(snap.draft.voiceIntroduction);
}
export type ServiceSnapshot = {
  id: string; name: string; initials: string; tint: string; title: LocalizedText;
  mode: PlayMode; unitPriceFen: number; maxQuantity: number; fulfillmentHours: number | null; listingRevision?:number; rulesVersion?:string; rulesText?:LocalizedText;
};
export type RefundRequest = { reason: RefundReason; description: string; amountFen: number; submittedAt: number };
export type Order = {
  fulfillmentStage?:string;activeCaseId?:string|null;totalRefundedFen?:number;role?:'buyer'|'seller'; simulated?:boolean; paymentStatus?:'none'|'pending'|'failed'|'succeeded'; paymentRequestId?:string;
  id: string; requestId: string; buyerPhone: string; service: ServiceSnapshot; quantity: number;
  delivery: DeliveryDetails; totalFen: number; status: OrderStatus; createdAt: number;
  paidAt: number | null; deadlineAt: number | null; closedAt: number | null; refund: RefundRequest | null;
  rules: { version: string; text: LocalizedText };
};
export type Message = { id: string; text: string; createdAt: number };
export type Conversation = { buyerPhone: string; serviceId: string; messages: Message[] };
export type MarketplaceState = { version: 1; accounts?: Profile[]; onboardingDone?: boolean; profile: Profile | null; orders: Order[]; conversations: Conversation[] };
export const emptyMarketplace: MarketplaceState = { version: 1, profile: null, orders: [], conversations: [] };
export const emptyDelivery: DeliveryDetails = { gameName: '', gameId: '', server: '', note: '' };
export const modeLabels: Record<PlayMode, TranslationKey> = { duo: 'modeDuo', squad: 'modeSquad' };
export const serverLabels: Record<GameServer, TranslationKey> = { wechat: 'serverWechat', qq: 'serverQQ' };
export const statusLabels: Record<OrderStatus, TranslationKey> = { unpaid: 'statusUnpaid', awaitingService: 'statusAwaitingService', closed: 'statusClosed' };
export const refundLabels: Record<RefundReason, TranslationKey> = { changedPlans: 'refundChangedPlans', incorrectDetails: 'refundIncorrectDetails', serviceUnavailable: 'refundUnavailable' };

export function quoteTotal(unitPriceFen: number, quantity: number, maximum: number) {
  if (!Number.isSafeInteger(unitPriceFen) || unitPriceFen <= 0 ||
      !Number.isSafeInteger(maximum) || maximum < 1 ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > maximum ||
      !Number.isSafeInteger(unitPriceFen * quantity)) throw new Error('invalidQuote');
  return unitPriceFen * quantity;
}

export function validateDelivery(details: DeliveryDetails): Partial<Record<keyof DeliveryDetails, TranslationKey>> {
  const errors: Partial<Record<keyof DeliveryDetails, TranslationKey>> = {};
  if (!details.gameName.trim() || details.gameName.trim().length > 32) errors.gameName = 'invalidGameName';
  if (!/^[A-Za-z0-9_-]{4,32}$/.test(details.gameId.trim())) errors.gameId = 'invalidGameId';
  if (details.server !== 'wechat' && details.server !== 'qq') errors.server = 'serverRequired';
  if (details.note.trim().length > 300) errors.note = 'noteTooLong';
  return errors;
}

export function validatePhone(phone: string) {
  return /^1[3-9][0-9]{9}$/.test(phone.trim());
}
export function validateNickname(nickname: string) {
  return nickname.trim().length >= 2 && nickname.trim().length <= 24;
}
// Local prototype authentication only; production verification belongs on the server.
export function accountChange(state: MarketplaceState, mode: 'signIn' | 'signUp' | 'edit', profile: Profile, code = '', accepted = false): MarketplaceState {
  if (!validatePhone(profile.phone)) throw new Error('phoneInvalid');
  const phone = profile.phone.trim();
  const accounts = [...(state.accounts ?? [])];
  if (state.profile && !accounts.some(item => item.phone === state.profile!.phone)) accounts.push(state.profile);
  const existing = accounts.find(item => item.phone === phone);
  if (mode !== 'edit' && code !== '123456') throw new Error('codeInvalid');
  if (mode === 'signIn') {
    if (!existing) throw new Error('accountNotFound');
    return { ...state, accounts, profile: existing, onboardingDone: true };
  }
  if (mode === 'edit' && state.profile?.phone !== phone) throw new Error('signInRequired');
  if (mode === 'signUp' && existing) throw new Error('accountExists');
  if (mode === 'signUp' && !accepted) throw new Error('loginRulesRequired');
  if (!validateNickname(profile.nickname) || profile.bio.trim().length > 160) throw new Error('checkFields');
  const clean: Profile = { ...(mode === 'edit' ? state.profile : {}), phone, nickname: profile.nickname.trim(), bio: profile.bio.trim() };
  if (profile.avatarFile !== undefined) {
    if (!validAvatarFile(profile.avatarFile)) throw new Error('checkFields');
    clean.avatarFile = profile.avatarFile;
  }
  if (mode === 'signUp') {
    if (profile.accountType !== undefined && profile.accountType !== 'player' && profile.accountType !== 'provider') throw new Error('checkFields');
    if (profile.accountType) clean.accountType = profile.accountType;
    if (profile.accountType === 'provider') {
      if (!profile.providerDraft || !validProviderDraft(profile.providerDraft)) throw new Error('providerFieldsRequired');
      clean.providerDraft = { ...profile.providerDraft };
    }
  }
  return { ...state, profile: clean, accounts: [...accounts.filter(item => item.phone !== phone), clean], onboardingDone: true };
}

export function parseRefundAmount(text: string, paidFen: number) {
  if (!Number.isSafeInteger(paidFen) || paidFen <= 0 || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(text.trim())) return null;
  const [whole, fractional = ''] = text.trim().split('.');
  const amount = Number(whole) * 100 + Number(fractional.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount > 0 && amount <= paidFen ? amount : null;
}

export function createOrder(state: MarketplaceState, input: {
  id: string; requestId: string; service: ServiceSnapshot; quantity: number; delivery: DeliveryDetails; rules: LocalizedText; now: number;
}) {
  if (!state.profile) throw new Error('signInRequired');
  if (!nonempty(input.requestId)) throw new Error('invalidOrder');
  const repeated = state.orders.find(order => order.requestId === input.requestId && order.buyerPhone === state.profile!.phone);
  if (repeated) return repeated;
  if (Object.keys(validateDelivery(input.delivery)).length) throw new Error('checkFields');
  const totalFen = quoteTotal(input.service.unitPriceFen, input.quantity, input.service.maxQuantity);
  if (!nonempty(input.id) || state.orders.some(order => order.id === input.id) || !validService(input.service) ||
      !validText(input.rules) || !validTimestamp(input.now) ||
      !validTimestamp(input.now + (input.service.fulfillmentHours??0) * 3_600_000)) throw new Error('invalidOrder');
  return {
    id: input.id, requestId: input.requestId, buyerPhone: state.profile.phone, service: { ...input.service, title: { ...input.service.title } },
    quantity: input.quantity, totalFen, delivery: {
      gameName: input.delivery.gameName.trim(), gameId: input.delivery.gameId.trim(), server: input.delivery.server, note: input.delivery.note.trim(),
    }, status: 'unpaid', createdAt: input.now, paidAt: null, deadlineAt: null, closedAt: null, refund: null,
    rules: { version: 'prototype-1', text: { ...input.rules } },
  } satisfies Order;
}

export function ownedOrder(state: MarketplaceState, id: string) {
  const order = state.orders.find(item => item.id === id && item.buyerPhone === state.profile?.phone);
  if (!order) throw new Error('orderUnavailable');
  return order;
}

export function transitionOrder(order: Order, action: 'pay' | 'cancel', now: number): Order {
  if (!validOrder(order)) throw new Error('invalidOrder');
  if (action === 'pay') {
    if (order.status === 'awaitingService') return order;
    if (order.status !== 'unpaid') throw new Error('orderNotPayable');
    const deadlineAt = now + (order.service.fulfillmentHours ?? 0) * 3_600_000;
    if (!validTimestamp(now) || now < order.createdAt || !validTimestamp(deadlineAt)) throw new Error('invalidOrder');
    return { ...order, status: 'awaitingService', paidAt: now, deadlineAt };
  }
  if (order.status === 'closed') return order;
  if (order.status !== 'unpaid') throw new Error('orderCannotCancel');
  if (!validTimestamp(now) || now < order.createdAt) throw new Error('invalidOrder');
  return { ...order, status: 'closed', closedAt: now };
}

export function requestRefund(order: Order, request: RefundRequest): Order {
  if (order.status !== 'awaitingService' || order.refund) throw new Error('refundUnavailableNow');
  if (!validOrder(order) || !Number.isSafeInteger(request.amountFen) || request.amountFen <= 0 || request.amountFen > order.totalFen ||
      !request.description.trim() || request.description.trim().length > 500 ||
      !Object.hasOwn(refundLabels, request.reason) || !validTimestamp(request.submittedAt) ||
      request.submittedAt < order.paidAt!) throw new Error('invalidRefund');
  return { ...order, refund: { ...request, description: request.description.trim() } };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function validTimestamp(value: unknown): value is number {
  // Date's range is slightly smaller than Number.MAX_SAFE_INTEGER.
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
}
function validPhone(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && validatePhone(value);
}
function validText(value: unknown): value is LocalizedText {
  return object(value) && nonempty(value.en) && nonempty(value.zh);
}
function validService(value: unknown): value is ServiceSnapshot {
  if (!object(value) || !nonempty(value.id) || !nonempty(value.name) || !nonempty(value.initials) || !nonempty(value.tint) ||
      !validText(value.title) || (value.mode !== 'duo' && value.mode !== 'squad') ||
      typeof value.unitPriceFen !== 'number' || typeof value.maxQuantity !== 'number' ||
      typeof value.fulfillmentHours !== 'number' || value.fulfillmentHours <= 0 ||
      !validTimestamp(value.fulfillmentHours * 3_600_000) || value.fulfillmentHours * 3_600_000 < 1) return false;
  try { quoteTotal(value.unitPriceFen, 1, value.maxQuantity); return true; } catch { return false; }
}
function validProviderDraft(value: unknown): value is ProviderDraft {
  if (!object(value) || !['gameName', 'gameId', 'server', 'rank', 'kd', 'experience', 'playStyle', 'mode'].every(key => typeof value[key] === 'string')) return false;
  return Object.keys(validateProviderDraft(value as ProviderDraft)).length === 0;
}
function validAvatarFile(value: unknown) {
  return value === null || (typeof value === 'string' && /^avatar-[a-z0-9-]+\.(jpg|png|webp|heic)$/.test(value));
}
function validProfile(value: unknown): value is Profile {
  return object(value) && validPhone(value.phone) &&
    typeof value.nickname === 'string' && validateNickname(value.nickname) && typeof value.bio === 'string' && value.bio.length <= 160 &&
    (value.avatarFile === undefined || validAvatarFile(value.avatarFile)) &&
    (value.accountType === undefined || value.accountType === 'player' || value.accountType === 'provider') &&
    (value.providerDraft === undefined || (value.accountType === 'provider' && validProviderDraft(value.providerDraft))) &&
    (value.accountType !== 'provider' || validProviderDraft(value.providerDraft)) &&
    (value.providerApplication === undefined || (value.accountType === 'provider' && validProviderApplication(value.providerApplication)));
}
function validOrder(value: unknown): value is Order {
  if (!object(value) || !validService(value.service) || !object(value.delivery) ||
      !object(value.rules) || !nonempty(value.rules.version) || !validText(value.rules.text)) return false;
  const s = value.service, d = value.delivery;
  if (!nonempty(value.id) || !nonempty(value.requestId) || !validPhone(value.buyerPhone) ||
      typeof value.quantity !== 'number' || typeof d.gameName !== 'string' || typeof d.gameId !== 'string' ||
      typeof d.note !== 'string' || (d.server !== 'wechat' && d.server !== 'qq') ||
      !validTimestamp(value.createdAt) || !validTimestamp(value.createdAt + (s.fulfillmentHours??0) * 3_600_000) ||
      typeof value.status !== 'string' || !['unpaid', 'awaitingService', 'closed'].includes(value.status)) return false;
  try {
    if (quoteTotal(s.unitPriceFen, value.quantity, s.maxQuantity) !== value.totalFen ||
        Object.keys(validateDelivery(d as DeliveryDetails)).length) return false;
  } catch { return false; }
  if (value.status === 'awaitingService') {
    if (!validTimestamp(value.paidAt) || value.paidAt < value.createdAt || !validTimestamp(value.deadlineAt) ||
        value.deadlineAt !== value.paidAt + (s.fulfillmentHours??0) * 3_600_000) return false;
  } else if (value.paidAt !== null || value.deadlineAt !== null) return false;
  if (value.status === 'closed') {
    if (!validTimestamp(value.closedAt) || value.closedAt < value.createdAt) return false;
  } else if (value.closedAt !== null) return false;
  if (value.refund !== null) {
    if (!object(value.refund) || value.status !== 'awaitingService' || typeof value.refund.reason !== 'string' || !Object.hasOwn(refundLabels, value.refund.reason) ||
        typeof value.refund.description !== 'string' || !value.refund.description.trim() || value.refund.description.length > 500 ||
        typeof value.refund.amountFen !== 'number' || !Number.isSafeInteger(value.refund.amountFen) ||
        value.refund.amountFen <= 0 || value.refund.amountFen > Number(value.totalFen) ||
        !validTimestamp(value.refund.submittedAt) || value.refund.submittedAt < Number(value.paidAt)) return false;
  }
  return true;
}
export function decodeMarketplace(text: string): MarketplaceState {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('invalidSavedData'); }
  if (!object(value) || value.version !== 1 || (value.profile !== null && !validProfile(value.profile)) ||
      !Array.isArray(value.orders) || !value.orders.every(validOrder) ||
      new Set(value.orders.map(order => order.id)).size !== value.orders.length ||
      new Set(value.orders.map(order => JSON.stringify([order.buyerPhone, order.requestId]))).size !== value.orders.length ||
      !Array.isArray(value.conversations) || !value.conversations.every(conversation =>
        object(conversation) && validPhone(conversation.buyerPhone) &&
        nonempty(conversation.serviceId) && Array.isArray(conversation.messages) &&
        conversation.messages.every(message => object(message) && nonempty(message.id) &&
          typeof message.text === 'string' && message.text.trim().length > 0 && message.text.length <= 500 &&
          validTimestamp(message.createdAt)) && new Set(conversation.messages.map(message => message.id)).size === conversation.messages.length) ||
      new Set(value.conversations.map(conversation => JSON.stringify([conversation.buyerPhone, conversation.serviceId]))).size !== value.conversations.length) throw new Error('invalidSavedData');
  if (value.accounts !== undefined && (!Array.isArray(value.accounts) || !value.accounts.every(validProfile) ||
      new Set(value.accounts.map(item => item.phone)).size !== value.accounts.length)) throw new Error('invalidSavedData');
  if (value.onboardingDone !== undefined && typeof value.onboardingDone !== 'boolean') throw new Error('invalidSavedData');
  return value as unknown as MarketplaceState;
}

export type MarketplaceStorage = {
  read: (file: 'primary' | 'backup') => Promise<string | null>;
  write: (file: 'primary' | 'backup', text: string) => Promise<void>;
};

export async function restoreMarketplace(storage: MarketplaceStorage) {
  let primaryFailed = false;
  try {
    const text = await storage.read('primary');
    if (text !== null) return { data: decodeMarketplace(text), recovered: false };
  } catch { primaryFailed = true; }
  const backup = await storage.read('backup');
  if (backup !== null) {
    const data = decodeMarketplace(backup);
    // Repair primary while the valid backup remains intact. The next mutation can then safely rotate backups.
    await storage.write('primary', JSON.stringify(data));
    return { data, recovered: true };
  }
  // Missing files mean a new install. Unreadable files must never reset saved history.
  if (primaryFailed) throw new Error('storageUnavailable');
  return { data: { ...emptyMarketplace, orders: [], conversations: [] }, recovered: false };
}

export async function writeMarketplace(storage: MarketplaceStorage, previous: MarketplaceState, next: MarketplaceState) {
  const previousText = JSON.stringify(previous), nextText = JSON.stringify(next);
  // Validate before any disk write so a malformed mutation cannot destroy either copy.
  decodeMarketplace(previousText);
  decodeMarketplace(nextText);
  await storage.write('backup', previousText);
  await storage.write('primary', nextText);
}
