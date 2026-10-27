import assert from 'node:assert/strict';
import test from 'node:test';
import {
  providerApplicationChecklist, submitProviderApplication, validVoiceIntroduction, saveProviderDraft, validateProviderDraft, accountChange, createOrder, decodeMarketplace, emptyMarketplace, ownedOrder, parseRefundAmount,
  quoteTotal, restoreMarketplace, requestRefund, transitionOrder, validateDelivery, validateNickname, validatePhone, writeMarketplace,
} from '../src/features/marketplace/domain.ts';

const now = Date.UTC(2026, 9, 13, 12);
const profile = { phone: '13800138000', nickname: '小熊', bio: '' };
const service = {
  id: '1', name: '小蓝 · Lan', initials: '蓝', tint: '#DCEFFF', title: { en: 'Duo', zh: '双排' },
  mode: 'duo', unitPriceFen: 3900, maxQuantity: 4, fulfillmentHours: 24,
};
const delivery = { gameName: '小熊', gameId: 'player_01', server: 'wechat', note: '' };
const rules = { en: 'Delivery within 24 hours after payment.', zh: '付款后24小时内服务。' };
const state = (overrides = {}) => ({ ...structuredClone(emptyMarketplace), profile: { ...profile }, ...overrides });
const input = (overrides = {}) => ({ id: 'XZ-1', requestId: 'request-1', service: structuredClone(service), quantity: 2, delivery: { ...delivery }, rules: { ...rules }, now, ...overrides });
const order = (overrides = {}) => createOrder(state(), input(overrides));
const paidOrder = () => transitionOrder(order(), 'pay', now + 1000);
const refund = (overrides = {}) => ({ reason: 'changedPlans', description: 'Plans changed.', amountFen: 3900, submittedAt: now + 2000, ...overrides });
const decode = value => decodeMarketplace(JSON.stringify(value));

test('quotes use integer fen and reject invalid quantities, prices, limits, and overflow', () => {
  assert.equal(quoteTotal(3901, 3, 4), 11703);
  assert.equal(quoteTotal(Number.MAX_SAFE_INTEGER, 1, 1), Number.MAX_SAFE_INTEGER);
  for (const price of [0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => quoteTotal(price, 1, 4), /invalidQuote/);
  }
  for (const quantity of [0, -1, 1.5, NaN, Infinity, 5]) {
    assert.throws(() => quoteTotal(3900, quantity, 4), /invalidQuote/);
  }
  for (const maximum of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => quoteTotal(3900, 1, maximum), /invalidQuote/);
  }
  assert.throws(() => quoteTotal(Number.MAX_SAFE_INTEGER, 2, 2), /invalidQuote/);
});

test('refund amounts parse decimal text exactly and respect the paid amount', () => {
  assert.equal(parseRefundAmount(' 39.01 ', 7800), 3901);
  assert.equal(parseRefundAmount('0.01', 7800), 1);
  assert.equal(parseRefundAmount('78', 7800), 7800);
  assert.equal(parseRefundAmount('1.1', 7800), 110);
  assert.equal(parseRefundAmount('90071992547409.91', Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  for (const text of ['', '0', '-1', '+1', '01', '.5', '1.', '1.001', '1e2', 'NaN', 'Infinity', '78.01', '90071992547409.92']) {
    assert.equal(parseRefundAmount(text, 7800), null, text);
  }
  for (const paid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseRefundAmount('0.01', paid), null, String(paid));
  }
});

test('forms enforce phone, nickname, delivery, server, and length rules', () => {
  assert.equal(validatePhone(' 13800138000 '), true);
  for (const phone of ['', '12800138000', '1380013800', '138001380000', '+8613800138000']) assert.equal(validatePhone(phone), false);
  assert.equal(validateNickname(' 小熊 '), true);
  for (const nickname of ['', ' ', 'A', 'A'.repeat(25)]) assert.equal(validateNickname(nickname), false);
  assert.deepEqual(validateDelivery(delivery), {});
  assert.deepEqual(validateDelivery({ gameName: ' ', gameId: 'a b', server: '', note: 'a'.repeat(301) }), {
    gameName: 'invalidGameName', gameId: 'invalidGameId', server: 'serverRequired', note: 'noteTooLong',
  });
  assert.deepEqual(validateDelivery({ ...delivery, gameName: 'a'.repeat(32), gameId: 'x'.repeat(32), note: 'a'.repeat(300) }), {});
  assert.equal(validateDelivery({ ...delivery, gameName: 'a'.repeat(33) }).gameName, 'invalidGameName');
});

test('creation requires sign-in and valid fields and snapshots all purchase terms', () => {
  assert.throws(() => createOrder(state({ profile: null }), input()), /signInRequired/);
  assert.throws(() => order({ delivery: { ...delivery, server: '' } }), /checkFields/);
  const draft = input({ delivery: { ...delivery, gameName: ' 小熊 ', gameId: ' player_01 ', note: ' Hello ' } });
  const created = createOrder(state(), draft);
  assert.equal(created.totalFen, 7800);
  assert.equal(created.status, 'unpaid');
  assert.equal(created.paidAt, null);
  assert.deepEqual(created.delivery, { ...delivery, note: 'Hello' });
  draft.service.title.en = 'Changed';
  draft.service.unitPriceFen = 1;
  draft.delivery.note = 'Changed';
  draft.rules.en = 'Changed';
  assert.equal(created.service.title.en, 'Duo');
  assert.equal(created.service.unitPriceFen, 3900);
  assert.equal(created.delivery.note, 'Hello');
  assert.equal(created.rules.text.en, rules.en);
});

test('creation rejects malformed IDs, service snapshots, and unsafe creation times', () => {
  for (const change of [
    { id: '' }, { id: ' ' }, { requestId: '' }, { requestId: ' ' },
    { now: -1 }, { now: NaN }, { now: Infinity }, { now: Number.MAX_SAFE_INTEGER },
    { now: 8_640_000_000_000_000 },
    { service: { ...service, fulfillmentHours: Infinity } },
    { service: { ...service, fulfillmentHours: 0 } },
    { service: { ...service, mode: 'invalid' } },
    { rules: { ...rules, en: '' } },
  ]) assert.throws(() => order(change), /invalidOrder/);
});

test('duplicate creation reuses the original buyer request while ID collisions fail', () => {
  const original = order();
  const current = state({ orders: [original] });
  assert.strictEqual(createOrder(current, input({ id: 'XZ-2', quantity: 3 })), original);
  assert.throws(() => createOrder(current, input({ requestId: 'request-2' })), /invalidOrder/);
  const otherBuyer = state({ profile: { ...profile, phone: '13900139000' }, orders: [original] });
  assert.equal(createOrder(otherBuyer, input({ id: 'XZ-2' })).buyerPhone, '13900139000');
});

test('only the signed-in buyer can resolve an order', () => {
  const original = order();
  assert.strictEqual(ownedOrder(state({ orders: [original] }), original.id), original);
  assert.throws(() => ownedOrder(state({ orders: [original] }), 'missing'), /orderUnavailable/);
  assert.throws(() => ownedOrder(state({ orders: [original], profile: null }), original.id), /orderUnavailable/);
  assert.throws(() => ownedOrder(state({ orders: [original], profile: { ...profile, phone: '13900139000' } }), original.id), /orderUnavailable/);
});

test('pay and cancellation are idempotent and mutually exclusive', () => {
  const original = order();
  const paid = transitionOrder(original, 'pay', now + 1000);
  assert.equal(paid.status, 'awaitingService');
  assert.equal(paid.deadlineAt, now + 1000 + 24 * 3_600_000);
  assert.strictEqual(transitionOrder(paid, 'pay', now + 2000), paid);
  assert.throws(() => transitionOrder(paid, 'cancel', now + 2000), /orderCannotCancel/);
  const closed = transitionOrder(original, 'cancel', now + 1000);
  assert.equal(closed.status, 'closed');
  assert.equal(closed.closedAt, now + 1000);
  assert.strictEqual(transitionOrder(closed, 'cancel', now + 2000), closed);
  assert.throws(() => transitionOrder(closed, 'pay', now + 2000), /orderNotPayable/);
  assert.equal(original.status, 'unpaid');
});

test('payment rejects tampered totals and transitions reject invalid timestamps', () => {
  assert.throws(() => transitionOrder({ ...order(), totalFen: 1 }, 'pay', now + 1000), /invalidOrder/);
  for (const time of [-1, now - 1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => transitionOrder(order(), 'pay', time), /invalidOrder/);
    assert.throws(() => transitionOrder(order(), 'cancel', time), /invalidOrder/);
  }
  assert.throws(() => transitionOrder(order(), 'pay', 8_640_000_000_000_000), /invalidOrder/);
});

test('refund request remains pending, snapshots text, and cannot be submitted twice', () => {
  const paid = paidOrder();
  const submitted = refund({ description: '  Plans changed.  ' });
  const requested = requestRefund(paid, submitted);
  assert.equal(requested.status, 'awaitingService');
  assert.equal(requested.totalFen, 7800);
  assert.equal(requested.refund.description, 'Plans changed.');
  assert.equal(paid.refund, null);
  submitted.amountFen = 1;
  assert.equal(requested.refund.amountFen, 3900);
  assert.throws(() => requestRefund(requested, refund()), /refundUnavailableNow/);
  assert.throws(() => requestRefund(order(), refund()), /refundUnavailableNow/);
  assert.throws(() => requestRefund(transitionOrder(order(), 'cancel', now), refund()), /refundUnavailableNow/);
});

test('refund requests reject overpayment, invalid amounts, invalid details and backdated times', () => {
  const paid = paidOrder();
  assert.equal(requestRefund(paid, refund({ amountFen: paid.totalFen })).refund.amountFen, 7800);
  for (const change of [
    { amountFen: 0 }, { amountFen: -1 }, { amountFen: 1.5 }, { amountFen: 7801 }, { amountFen: Infinity },
    { reason: 'invalid' }, { description: ' ' }, { description: 'a'.repeat(501) },
    { submittedAt: now }, { submittedAt: NaN }, { submittedAt: Infinity },
  ]) assert.throws(() => requestRefund(paid, refund(change)), /invalidRefund/);
});

test('saved data round-trips valid lifecycle states and retains other buyers history', () => {
  for (const item of [order(), paidOrder(), transitionOrder(order(), 'cancel', now), requestRefund(paidOrder(), refund())]) {
    const saved = state({ orders: [item], conversations: [{ buyerPhone: profile.phone, serviceId: '1', messages: [{ id: 'm1', text: 'Hello', createdAt: now }] }] });
    assert.deepEqual(decode(saved), saved);
    assert.deepEqual(decode({ ...saved, profile: null }).orders, saved.orders);
  }
});

test('saved data rejects bad envelopes, profiles, quotes, snapshots and lifecycle timestamps', () => {
  assert.throws(() => decodeMarketplace('{'), /invalidSavedData/);
  for (const saved of [null, [], { ...state(), version: 2 }, { ...state(), profile: { ...profile, phone: 'bad' } }]) {
    assert.throws(() => decode(saved), /invalidSavedData/);
  }
  for (const change of [
    { id: '' }, { requestId: '' }, { totalFen: 1 }, { quantity: 0 }, { createdAt: -1 }, { status: ['unpaid'] },
    { service: { ...service, fulfillmentHours: 1e20 } }, { rules: { version: '', text: rules } },
    { paidAt: now, deadlineAt: now }, { closedAt: now }, { refund: refund() },
  ]) assert.throws(() => decode(state({ orders: [{ ...order(), ...change }] })), /invalidSavedData/);
  for (const change of [{ paidAt: now - 1 }, { deadlineAt: now + 2000 }, { closedAt: now }, { refund: refund({ submittedAt: now }) }]) {
    assert.throws(() => decode(state({ orders: [{ ...paidOrder(), ...change }] })), /invalidSavedData/);
  }
});

test('saved data rejects duplicate order IDs, buyer request IDs, conversation pairs and message IDs', () => {
  const original = order();
  assert.throws(() => decode(state({ orders: [original, original] })), /invalidSavedData/);
  assert.throws(() => decode(state({ orders: [original, { ...original, id: 'XZ-2' }] })), /invalidSavedData/);
  const message = { id: 'm1', text: 'Hello', createdAt: now };
  const conversation = { buyerPhone: profile.phone, serviceId: '1', messages: [message] };
  assert.throws(() => decode(state({ conversations: [conversation, conversation] })), /invalidSavedData/);
  assert.throws(() => decode(state({ conversations: [{ ...conversation, messages: [message, message] }] })), /invalidSavedData/);
  assert.throws(() => decode(state({ conversations: [{ ...conversation, messages: [{ ...message, createdAt: -1 }] }] })), /invalidSavedData/);
});

function memoryStorage(initial = {}) {
  const files = { primary: null, backup: null, ...initial };
  const reads = [], writes = [];
  return {
    files, reads, writes,
    async read(file) { reads.push(file); return files[file]; },
    async write(file, text) { writes.push(file); files[file] = text; },
  };
}

test('storage starts empty only when both snapshots are absent', async () => {
  const storage = memoryStorage();
  assert.deepEqual(await restoreMarketplace(storage), { data: emptyMarketplace, recovered: false });
  assert.deepEqual(storage.reads, ['primary', 'backup']);
  assert.deepEqual(storage.writes, []);
});

test('storage prefers a valid primary without reading or changing its backup', async () => {
  const saved = state({ orders: [paidOrder()] });
  const storage = memoryStorage({ primary: JSON.stringify(saved), backup: 'broken' });
  assert.deepEqual(await restoreMarketplace(storage), { data: saved, recovered: false });
  assert.deepEqual(storage.reads, ['primary']);
  assert.deepEqual(storage.writes, []);
});

test('storage recovers and repairs primary after a missing, corrupt, invalid, or unreadable primary', async () => {
  const saved = state({ orders: [order()] });
  for (const primary of [null, '{', JSON.stringify({ ...saved, version: 2 })]) {
    const storage = memoryStorage({ primary, backup: JSON.stringify(saved) });
    assert.deepEqual(await restoreMarketplace(storage), { data: saved, recovered: true });
    assert.deepEqual(storage.writes, ['primary']);
    assert.deepEqual(decodeMarketplace(storage.files.primary), saved);
    assert.deepEqual(decodeMarketplace(storage.files.backup), saved);
  }
  const storage = memoryStorage({ backup: JSON.stringify(saved) });
  const read = storage.read;
  storage.read = async file => { if (file === 'primary') throw new Error('read failed'); return read(file); };
  assert.deepEqual(await restoreMarketplace(storage), { data: saved, recovered: true });
});

test('a failed primary repair leaves the backup intact and requires a retry', async () => {
  const saved = state({ orders: [order()] });
  const storage = memoryStorage({ primary: '{', backup: JSON.stringify(saved) });
  const write = storage.write;
  storage.write = async (file, text) => {
    if (file === 'primary') throw new Error('disk full');
    return write(file, text);
  };
  await assert.rejects(restoreMarketplace(storage), /disk full/);
  assert.deepEqual(decodeMarketplace(storage.files.backup), saved);
  storage.write = write;
  assert.deepEqual(await restoreMarketplace(storage), { data: saved, recovered: true });
});

test('unrecoverable storage fails without discarding history or writing empty data', async () => {
  for (const initial of [{ primary: '{' }, { primary: '{', backup: '{' }, { backup: '{' }]) {
    const storage = memoryStorage(initial);
    await assert.rejects(restoreMarketplace(storage));
    assert.deepEqual(storage.writes, []);
    assert.deepEqual(storage.files, { primary: null, backup: null, ...initial });
  }
  const storage = memoryStorage();
  storage.read = async () => { throw new Error('permission denied'); };
  await assert.rejects(restoreMarketplace(storage));
  assert.deepEqual(storage.writes, []);
});

test('persistence saves the previous valid state before committing the next snapshot', async () => {
  const previous = state(), next = state({ orders: [order()] });
  const storage = memoryStorage({ primary: JSON.stringify(previous) });
  await writeMarketplace(storage, previous, next);
  assert.deepEqual(storage.writes, ['backup', 'primary']);
  assert.deepEqual(decodeMarketplace(storage.files.backup), previous);
  assert.deepEqual(await restoreMarketplace(storage), { data: next, recovered: false });
});

test('invalid mutations never replace either saved snapshot', async () => {
  const previous = state();
  const storage = memoryStorage({ primary: JSON.stringify(previous), backup: JSON.stringify(emptyMarketplace) });
  const before = { ...storage.files };
  await assert.rejects(writeMarketplace(storage, previous, state({ orders: [{ ...order(), totalFen: 1 }] })), /invalidSavedData/);
  assert.deepEqual(storage.writes, []);
  assert.deepEqual(storage.files, before);
});

test('backup failure prevents primary replacement, while a partial primary failure remains recoverable', async () => {
  const previous = state({ orders: [order()] });
  const next = state({ orders: [paidOrder()] });
  const storage = memoryStorage({ primary: JSON.stringify(previous) });
  const write = storage.write;
  storage.write = async (file, text) => { if (file === 'backup') throw new Error('disk full'); await write(file, text); };
  await assert.rejects(writeMarketplace(storage, previous, next), /disk full/);
  assert.deepEqual(decodeMarketplace(storage.files.primary), previous);
  storage.write = async (file, text) => {
    if (file === 'primary') { await write(file, '{'); throw new Error('write interrupted'); }
    await write(file, text);
  };
  await assert.rejects(writeMarketplace(storage, previous, next), /write interrupted/);
  storage.write = write;
  assert.deepEqual(await restoreMarketplace(storage), { data: previous, recovered: true });
});

test('the first write after backup recovery preserves the recovered valid state', async () => {
  const previous = state({ orders: [order()] });
  const storage = memoryStorage({ primary: '{', backup: JSON.stringify(previous) });
  const restored = await restoreMarketplace(storage);
  const next = { ...restored.data, orders: [transitionOrder(restored.data.orders[0], 'pay', now + 1000)] };
  await writeMarketplace(storage, restored.data, next);
  assert.deepEqual(decodeMarketplace(storage.files.backup), previous);
  assert.deepEqual(await restoreMarketplace(storage), { data: next, recovered: false });
});


test('registration persists a profile and sign-in restores it without overwriting details', () => {
  const registered = accountChange(emptyMarketplace, 'signUp', profile, '123456', true);
  const signedOut = decode({ ...registered, profile: null });
  const restored = accountChange(signedOut, 'signIn', { phone: profile.phone, nickname: '', bio: '' }, '123456');
  assert.deepEqual(restored.profile, profile);
  assert.equal(restored.onboardingDone, true);
  assert.throws(() => accountChange(signedOut, 'signUp', profile, '123456', true), /accountExists/);
  assert.throws(() => accountChange(emptyMarketplace, 'signIn', profile, '123456'), /accountNotFound/);
  assert.throws(() => accountChange(signedOut, 'signIn', profile, '000000'), /codeInvalid/);
  assert.throws(() => accountChange(emptyMarketplace, 'signUp', profile, '123456', false), /loginRulesRequired/);
});
test('legacy active profiles remain usable and editing cannot change account ownership', () => {
  const legacy = state();
  const changed = accountChange(legacy, 'edit', { ...profile, nickname: 'Updated' });
  assert.equal(changed.accounts[0].nickname, 'Updated');
  assert.deepEqual(changed.orders, legacy.orders);
  assert.throws(() => accountChange(changed, 'edit', { ...profile, phone: '13800138002' }), /signInRequired/);
  assert.throws(() => decode({ ...changed, accounts: [profile, profile] }), /invalidSavedData/);
  assert.throws(() => decode({ ...changed, onboardingDone: 'yes' }), /invalidSavedData/);
});

const providerDraft = { gameName: 'Teammate', gameId: 'player_02', server: 'wechat', rank: 'Ace', kd: '3.25', experience: 'Three years of squad games', playStyle: 'Patient support and clear calls', mode: 'squad' };
test('provider registration keeps a validated draft through sign-out and sign-in', () => {
  const registered = accountChange(emptyMarketplace, 'signUp', { ...profile, accountType: 'provider', providerDraft }, '123456', true);
  const restored = accountChange(decode({ ...registered, profile: null }), 'signIn', { ...profile, nickname: '' }, '123456');
  assert.equal(restored.profile.accountType, 'provider');
  assert.deepEqual(restored.profile.providerDraft, providerDraft);
  assert.equal(restored.profile.providerDraft.status, undefined);
  assert.throws(() => accountChange(emptyMarketplace, 'signUp', { ...profile, accountType: 'provider' }, '123456', true), /providerFieldsRequired/);
  assert.throws(() => decode({ ...registered, profile: { ...registered.profile, providerDraft: { ...providerDraft, kd: 'NaN' } } }), /invalidSavedData/);
});
test('players can prepare a provider draft on the same account without losing buyer history', () => {
  const buyer = state({ orders: [order()] });
  const changed = saveProviderDraft(buyer, providerDraft);
  assert.equal(changed.profile.phone, buyer.profile.phone);
  assert.deepEqual(changed.orders, buyer.orders);
  assert.equal(changed.accounts.length, 1);
  const edited = accountChange(changed, 'edit', { ...profile, nickname: 'New name', accountType: 'player' });
  assert.equal(edited.profile.accountType, 'provider');
  assert.deepEqual(edited.profile.providerDraft, providerDraft);
  assert.throws(() => saveProviderDraft({ ...buyer, profile: null }, providerDraft), /signInRequired/);
  assert.throws(() => saveProviderDraft(buyer, { ...providerDraft, mode: '' }), /providerFieldsRequired/);
  assert.deepEqual(validateProviderDraft(providerDraft), {});
  assert.equal(validateProviderDraft({ ...providerDraft, kd: '-1' }).kd, 'providerKdError');
});

test('avatar filenames persist and unsafe paths are rejected without changing the account', () => {
  const registered = accountChange(emptyMarketplace, 'signUp', { ...profile, avatarFile: 'avatar-test-123.jpg' }, '123456', true);
  assert.equal(decode(registered).profile.avatarFile, 'avatar-test-123.jpg');
  const edited = accountChange(registered, 'edit', { ...profile, avatarFile: null });
  assert.equal(edited.profile.avatarFile, null);
  assert.throws(() => accountChange(registered, 'edit', { ...profile, avatarFile: '../private.jpg' }), /checkFields/);
  assert.throws(() => decode({ ...registered, profile: { ...profile, avatarFile: 'https://example.com/photo.jpg' } }), /invalidSavedData/);
});

test('provider media is saved atomically and retained through account edits and sign-in', () => {
  const voiceIntroduction = { file: 'voice-test-123.m4a', durationMs: 12000 };
  const changed = saveProviderDraft(state({ orders: [order()] }), { ...providerDraft, voiceIntroduction }, 'avatar-test-123.jpg');
  assert.equal(changed.profile.avatarFile, 'avatar-test-123.jpg');
  assert.deepEqual(changed.profile.providerDraft.voiceIntroduction, voiceIntroduction);
  assert.deepEqual(changed.accounts[0], changed.profile);
  const edited = accountChange(changed, 'edit', { ...profile, bio: 'New bio' });
  const restored = accountChange(decode({ ...edited, profile: null }), 'signIn', profile, '123456');
  assert.deepEqual(restored.profile.providerDraft.voiceIntroduction, voiceIntroduction);
  assert.equal(restored.profile.avatarFile, 'avatar-test-123.jpg');
  assert.deepEqual(restored.orders, changed.orders);
  const removed = saveProviderDraft(restored, { ...providerDraft, voiceIntroduction: null }, null);
  assert.equal(removed.profile.providerDraft.voiceIntroduction, null);
  assert.equal(removed.profile.avatarFile, null);
});
test('voice metadata accepts only private filenames and the documented 10 to 30 second range', () => {
  for (const durationMs of [10000, 30000]) assert.equal(validVoiceIntroduction({ file: 'voice-test-123.mp3', durationMs }), true);
  for (const clip of [
    { file: '../voice-test.mp3', durationMs: 12000 }, { file: 'https://example.com/voice.mp3', durationMs: 12000 },
    { file: 'voice-test.wav', durationMs: 12000 }, { file: 'voice-test.aac', durationMs: 9999 },
    { file: 'voice-test.aac', durationMs: 30001 }, { file: 'voice-test.aac', durationMs: 10000.1 },
    { file: 'voice-test.aac', durationMs: NaN }, {}, null,
  ]) assert.equal(validVoiceIntroduction(clip), false);
  const invalid = { ...providerDraft, voiceIntroduction: { file: 'voice-test.aac', durationMs: 9999 } };
  assert.throws(() => saveProviderDraft(state(), invalid), /providerFieldsRequired/);
  assert.throws(() => decode({ ...state(), profile: { ...profile, accountType: 'provider', providerDraft: invalid } }), /invalidSavedData/);
  assert.throws(() => saveProviderDraft(state(), providerDraft, '../../photo.jpg'), /checkFields/);
  assert.deepEqual(validateProviderDraft(providerDraft), {}); // legacy drafts remain valid
});

const applicationState = () => saveProviderDraft(state({ profile: { ...profile, bio: 'Calm teammate', avatarFile: 'avatar-application.png' } }), { ...providerDraft, voiceIntroduction: { file: 'voice-application.m4a', durationMs: 12000 } });
test('provider applications require complete details and explicit agreement', () => {
  const ready = applicationState();
  assert.deepEqual(providerApplicationChecklist(ready.profile), { game: true, photoBio: true, voice: true });
  assert.throws(() => submitProviderApplication(ready, false, now), /applicationAgreementRequired/);
  assert.throws(() => submitProviderApplication({ ...ready, profile: null }, true, now), /signInRequired/);
  for (const patch of [{ avatarFile: null }, { bio: ' ' }, { providerDraft: { ...providerDraft } }, { providerDraft: { ...providerDraft, kd: 'invalid' } }]) {
    assert.throws(() => submitProviderApplication({ ...ready, profile: { ...ready.profile, ...patch } }, true, now), /applicationIncomplete/);
  }
  assert.throws(() => submitProviderApplication(ready, true, NaN), /applicationIncomplete/);
  assert.equal(ready.profile.providerApplication, undefined);
});
test('submission persists a private snapshot, deduplicates and preserves account history', () => {
  const ready = applicationState();
  const submitted = submitProviderApplication(ready, true, now);
  const application = submitted.profile.providerApplication;
  assert.equal(application.status, 'pending');
  assert.equal(application.agreementVersion, 'preview-v1');
  assert.equal(submitted.orders, ready.orders);
  assert.equal(submitted.conversations, ready.conversations);
  assert.equal(submitProviderApplication(submitted, true, now + 2000), submitted);
  assert.deepEqual(decode(submitted).profile.providerApplication, application);
  const edited = accountChange(submitted, 'edit', { ...submitted.profile, nickname: 'Updated', bio: 'New bio' });
  const changed = saveProviderDraft(edited, { ...providerDraft, rank: 'New rank', voiceIntroduction: null }, null);
  assert.deepEqual(changed.profile.providerApplication, application);
  assert.equal(application.snapshot.nickname, profile.nickname);
  assert.equal(application.snapshot.draft.rank, 'Ace');
  assert.equal(application.snapshot.draft.voiceIntroduction.file, 'voice-application.m4a');
  const signedIn = accountChange({ ...changed, profile: null }, 'signIn', profile, '123456');
  assert.deepEqual(signedIn.profile.providerApplication, application);
  assert.deepEqual(decode(changed).profile.providerApplication, application);
});
test('stored applications reject forged status, unsafe media and malformed consent metadata', () => {
  const submitted = submitProviderApplication(applicationState(), true, now);
  for (const patch of [{ status: 'approved' }, { submittedAt: -1 }, { agreementVersion: 'unknown' }, { snapshot: { ...submitted.profile.providerApplication.snapshot, avatarFile: '../private.png' } }]) {
    const corrupted = structuredClone(submitted);
    Object.assign(corrupted.profile.providerApplication, patch);
    assert.throws(() => decode(corrupted));
  }
});
