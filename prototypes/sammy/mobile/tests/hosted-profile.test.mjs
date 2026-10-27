import test from 'node:test';
import assert from 'node:assert/strict';
import { accountProfile, remoteDraft } from '../src/features/marketplace/hostedProfile.ts';
import { applicationStatusKey, emptyProviderDraft } from '../src/features/marketplace/domain.ts';

test('hosted decisions retain submitted media and text independently of the edited profile', () => {
  const draft = { ...emptyProviderDraft, gameName: 'Current', voiceMediaId: 'new-voice' };
  const data = { profile: { id: 'user', phone: '13800138019', nickname: 'Current', bio: 'Edited', avatarMediaId: 'new-photo', draft,
    application: { id: 'app', status: 'changes_requested', submittedAt: '2026-10-18T00:00:00Z', agreementVersion: 'prototype-hosted-v1', reason: 'Please clarify your experience.',
      snapshot: { nickname: 'Submitted', bio: 'Original', avatarMediaId: 'old-photo', draft: { ...draft, gameName: 'Original', voiceMediaId: 'old-voice' } } } },
    files: [ { id: 'new-photo', kind: 'avatar', file: 'avatar-new.png' }, { id: 'old-photo', kind: 'avatar', file: 'avatar-old.png' },
      { id: 'new-voice', kind: 'voice', file: 'voice-new.m4a', durationMs: 12000 }, { id: 'old-voice', kind: 'voice', file: 'voice-old.m4a', durationMs: 15000 } ] };
  const profile = accountProfile(data);
  assert.equal(profile.avatarFile, 'avatar-new.png');
  assert.equal(profile.providerDraft.voiceIntroduction.file, 'voice-new.m4a');
  assert.equal(profile.providerApplication.snapshot.avatarFile, 'avatar-old.png');
  assert.equal(profile.providerApplication.snapshot.draft.voiceIntroduction.file, 'voice-old.m4a');
  assert.equal(profile.providerApplication.snapshot.bio, 'Original');
  assert.equal(profile.providerApplication.reason, data.profile.application.reason);
  assert.equal(applicationStatusKey(profile, true), 'hostedReviewChanges');
  for (const [status, key] of [['approved', 'hostedReviewApproved'], ['pending', 'hostedReviewPending']]) {
    data.profile.application.status = status;
    assert.equal(applicationStatusKey(accountProfile(data), true), key);
  }
  assert.equal(applicationStatusKey(profile, false), 'applicationPending');
});

test('outgoing drafts replace local voice filenames with server media IDs', () => {
  const draft = { ...emptyProviderDraft, voiceIntroduction: { file: 'voice-local.m4a', durationMs: 12000 } };
  const outgoing = remoteDraft(draft, 'uploaded-id');
  assert.equal(outgoing.voiceMediaId, 'uploaded-id');
  assert.equal('voiceIntroduction' in outgoing, false);
  assert.equal(remoteDraft(draft, null).voiceMediaId, null);
  assert.equal(draft.voiceIntroduction.file, 'voice-local.m4a');
});
