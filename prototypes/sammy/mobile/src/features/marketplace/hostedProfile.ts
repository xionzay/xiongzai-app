import type { Profile, ProviderDraft } from './domain';
export type RemoteDraft = Omit<ProviderDraft, 'voiceIntroduction'> & { voiceMediaId: string | null };
export type RemoteFile = { id: string; kind: 'avatar' | 'voice'; file: string; durationMs: number | null; url: string | null };
export type AccountResponse = {
  token?: string;
  profile: {suspended?:boolean; id: string; phone: string; nickname: string; bio: string; avatarMediaId: string | null; draft: RemoteDraft | null;
    application: null | { id: string; status: 'pending' | 'approved' | 'changes_requested'; submittedAt: string; agreementVersion: 'prototype-hosted-v1'; reason: string | null;
      snapshot: { nickname: string; bio: string; avatarMediaId: string; draft: RemoteDraft } } };
  files: RemoteFile[];
};
export function accountProfile(data: AccountResponse): Profile {
  const file = (id: string | null) => data.files.find(item => item.id === id);
  const draft = (value: RemoteDraft): ProviderDraft => {
    // Preserve historical snapshot shape: a missing game is read as Peace Elite
    // by validators/UI, without inserting a field into the submitted snapshot.
    const { voiceMediaId, ...fields } = value, voice = file(voiceMediaId);
    return { ...fields, voiceIntroduction: voice && voice.durationMs ? { file: voice.file, durationMs: voice.durationMs } : null };
  };
  const user = data.profile, a = user.application;
  return { accountRestricted:user.suspended??false,phone: user.phone, nickname: user.nickname, bio: user.bio, avatarFile: file(user.avatarMediaId)?.file ?? null,
    accountType: user.draft ? 'provider' : 'player', ...(user.draft ? { providerDraft: draft(user.draft) } : {}),
    ...(a ? { providerApplication: { id: a.id, status: a.status, submittedAt: Date.parse(a.submittedAt), agreementVersion: a.agreementVersion, reason: a.reason,
      snapshot: { nickname: a.snapshot.nickname, bio: a.snapshot.bio, avatarFile: file(a.snapshot.avatarMediaId)?.file ?? '', draft: draft(a.snapshot.draft) } } } : {}) };
}
export function remoteDraft(value: ProviderDraft, voiceMediaId: string | null): RemoteDraft {
  const { voiceIntroduction, ...fields } = value;
  return { ...fields, voiceMediaId };
}
