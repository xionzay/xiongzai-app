"use client";
import { PRODUCT_GAMES, publicGames } from '../product-decisions';
import { CartoonIcon } from "../ui/CartoonIcon";
import { useEffect, useRef, useState } from 'react';
import { CatalogImage } from '../CatalogImage';
import { ImagePicker } from './ImagePicker';
import { errorMessage, fieldLabels, fieldLimits, profileFields, revisionPayload, validateProfile, type Profile, type ProfileFields, type Request, type Revision } from './model';
type VoicePolicy = { id: string; title: string; content: string; version_no: number };
const statusText: Record<string, string> = { DRAFT: '草稿已保存', SUBMITTED: '资料已提交，等待审核', UNDER_REVIEW: '资料审核中', NEEDS_SUPPLEMENT: '需要补充资料', REJECTED: '资料审核未通过', APPROVED: '资料已生效' };
export function ProfileEditor({ request, onBack, onPreview, onLogin, registerNavigationGuard, notify }: { request: Request; onBack: () => void; onPreview: (id: string) => void; onLogin: () => void; registerNavigationGuard: (guard: ((next: () => void) => void) | null) => void; notify: (message: string) => void }) {
  const [profile, setProfile] = useState<Profile | null>(null), [draft, setDraft] = useState<ProfileFields | null>(null), [revision, setRevision] = useState<Revision | null>(null);
  const [baseline, setBaseline] = useState(''), [error, setError] = useState(''), [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<'SELLER_AVATAR' | null>(null), [leave, setLeave] = useState<(() => void) | null>(null);
  const lock = useRef(false), form = useRef<HTMLFormElement>(null), leaveDialog = useRef<HTMLDialogElement>(null);
  const [voicePolicies, setVoicePolicies] = useState<VoicePolicy[]>([]), [voiceSelected, setVoiceSelected] = useState<string[]>([]), [policyReady, setPolicyReady] = useState(false), [policyError, setPolicyError] = useState('');
  const loadPolicies = async () => { setPolicyReady(false); setPolicyError(''); try { const [policies, accepted] = await Promise.all([request<VoicePolicy[]>('/policies/current?scene=VOICE_SAMPLE_UPLOAD'), request<{ policy_version_id: string; acceptance_scene: string }[]>('/policies/acceptances')]); if (!policies.length) throw new Error('声音名片授权协议尚未配置'); setVoicePolicies(policies.filter(p => !accepted.some(a => a.policy_version_id === p.id && a.acceptance_scene === 'VOICE_SAMPLE_UPLOAD'))); setPolicyReady(true); } catch (e) { setPolicyError(errorMessage(e)); } };
  useEffect(() => { void Promise.resolve().then(loadPolicies); }, [request]);
  const dirty = Boolean(draft && JSON.stringify(draft) !== baseline);
  const reviewed = profile && ['APPROVED', 'SUSPENDED'].includes(profile.status);
  const locked = ['SUBMITTED', 'UNDER_REVIEW'].includes(revision?.status ?? '') || ['PENDING_REVIEW', 'BANNED'].includes(profile?.status ?? '');
  const load = async () => { setError(''); try { const row = await request<Profile>('/seller/profile'); const pending = row.pending_profile_revision ?? null; const value = profileFields(pending?.snapshot ?? row); setProfile(row); setDraft(value); setRevision(pending); setBaseline(JSON.stringify(value)); } catch (e) { setError(errorMessage(e)); } };
  useEffect(() => { void Promise.resolve().then(load); }, [request]);
  useEffect(() => { if (!dirty) return; const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [dirty]);
  useEffect(() => { if (leave) leaveDialog.current?.showModal(); }, [leave]);
  const exit = (next: () => void) => { if (lock.current) return; const proceed = () => { registerNavigationGuard(null); next(); }; if (dirty) setLeave(() => proceed); else proceed(); };
  useEffect(() => { registerNavigationGuard(exit); return () => { registerNavigationGuard(null); }; }, [dirty, busy, registerNavigationGuard]);
  const update = (key: keyof ProfileFields, value: string | null) => { setDraft(s => s ? { ...s, [key]: value } : s); setFieldErrors(s => { const next = { ...s }; delete next[key]; return next; }); };
  const invalid = (errors: Record<string, string>) => { setFieldErrors(errors); requestAnimationFrame(() => { const field = form.current?.querySelector<HTMLElement>(`[data-field="${Object.keys(errors)[0]}"]`); field?.scrollIntoView({ block: 'center' }); field?.querySelector<HTMLElement>('input,textarea,button')?.focus(); }); };
  const save = async (submit: boolean) => {
    if (!profile || !draft || lock.current || locked) return;
    const errors = validateProfile(draft, Boolean(reviewed)); if (draft.voice_file_id && (!policyReady || voicePolicies.some(p => !voiceSelected.includes(p.id)))) errors.voice_file_id = policyError || '请阅读并确认声音名片公开试听授权'; if (Object.keys(errors).length) return invalid(errors);
    lock.current = true; setBusy(true); setError('');
    try {
      if (draft.voice_file_id && voicePolicies.length) { await request('/policies/acceptances', { method: 'POST', body: JSON.stringify({ acceptance_scene: 'VOICE_SAMPLE_UPLOAD', confirmation_method: 'ONLINE_CONFIRM', policy_version_ids: voiceSelected }) }); setVoicePolicies([]); setVoiceSelected([]); }
      if (reviewed) {
        let saved = revision;
        if (dirty || !saved || saved.status !== 'DRAFT') saved = await request<Revision>('/seller/profile-revisions/draft', { method: 'PUT', body: JSON.stringify(revisionPayload(draft, profile, revision)) });
        setRevision(saved); setBaseline(JSON.stringify(draft));
        if (submit) { saved = await request<Revision>(`/seller/profile-revisions/${saved!.id}/submit`, { method: 'POST', body: JSON.stringify({ version: saved!.version }) }); setRevision(saved); }
        notify(submit ? '已提交资料审核，公开主页暂不改变' : '草稿已保存，尚未公开');
      } else {
        const row = await request<Profile>('/seller/profile', { method: 'PATCH', body: JSON.stringify({ ...draft, version: profile.version }) });
        setProfile(row); setBaseline(JSON.stringify(draft)); notify('资料已保存；公开展示仍以入驻审核结果为准');
      }
    } catch (e) { setError(errorMessage(e)); const errors = (e as { fieldErrors?: { field: string; message: string }[] }).fieldErrors; if (errors?.length) invalid(Object.fromEntries(errors.map(f => [f.field, f.message]))); }
    finally { lock.current = false; setBusy(false); }
  };
  const toggleAvailability = async () => {
    if (!profile || lock.current) return; lock.current = true; setBusy(true); setError('');
    try { const row = await request<Profile>('/seller/profile', { method: 'PATCH', body: JSON.stringify({ seller_nickname: profile.seller_nickname, accepting_orders: !profile.accepting_orders, version: profile.version }) }); setProfile(p => p ? { ...p, ...row } : row); notify('接待状态已更新，原有订单仍需正常履约'); }
    catch (e) { setError(errorMessage(e)); } finally { lock.current = false; setBusy(false); }
  };
  return <div className="app-screen sf-screen sf-editor"><header className="sf-header"><button aria-label="返回卖家我的" disabled={busy} onClick={() => exit(onBack)}><CartoonIcon kind="back" /></button><h1>主页资料</h1><button disabled={busy || profile?.status !== 'APPROVED'} onClick={() => exit(() => onPreview(profile!.id))}>预览主页</button></header>
    {!profile || !draft ? <div className="sf-empty">{error ? <><p role="alert">{error}</p><button onClick={() => void load()}>重试</button><button onClick={onLogin}>登录账号</button></> : '正在读取卖家资料…'}</div> : <>
      <div className="sf-notice"><b>{revision ? statusText[revision.status] ?? revision.status : '管理买家看到的主页'}</b><p>{reviewed ? '修改公开资料需审核，通过前继续展示原有资料。接待状态单独生效。' : '当前尚未通过入驻审核，资料保存不会直接公开。'}</p>{revision?.rejection_reason && <p className="sf-error">原因：{revision.rejection_reason}</p>}{revision?.required_fields?.length ? <p>需补充：{revision.required_fields.map(k => fieldLabels[k as keyof ProfileFields] ?? k).join('、')}</p> : null}{locked && <button onClick={() => void load()}>刷新审核进度</button>}</div>
      <form ref={form} onSubmit={e => { e.preventDefault(); void save(true); }}>
        <div className="sf-row sf-edit-avatar" data-field="seller_avatar_file_id"><CatalogImage kind="avatar" fileId={draft.seller_avatar_file_id} alt="当前头像" /><button type="button" disabled={busy || locked} onClick={() => setPicker('SELLER_AVATAR')}>更换头像</button>{fieldErrors.seller_avatar_file_id && <small className="sf-error">{fieldErrors.seller_avatar_file_id}</small>}</div>
        {(['seller_nickname', 'introduction', 'play_style', 'game_rank', 'kd', 'game_experience'] as const).map(key => <label className="sf-field" data-field={key} key={key}><span>{fieldLabels[key]}{fieldLimits[key] && <small>{String(draft[key] ?? '').length}/{fieldLimits[key]}</small>}</span>{['introduction', 'game_experience'].includes(key) ? <textarea aria-invalid={Boolean(fieldErrors[key])} aria-describedby={`sf-error-${key}`} disabled={busy || locked} maxLength={fieldLimits[key]} value={draft[key] ?? ''} onChange={e => update(key, e.target.value)} rows={key === 'introduction' ? 4 : 3} /> : <input aria-invalid={Boolean(fieldErrors[key])} aria-describedby={`sf-error-${key}`} disabled={busy || locked} maxLength={fieldLimits[key]} value={draft[key] ?? ''} onChange={e => update(key, e.target.value)} />}{fieldErrors[key] && <small id={`sf-error-${key}`} className="sf-error">{fieldErrors[key]}</small>}{key === 'introduction' && <small>首页展示前两行，买家可展开查看完整介绍。</small>}</label>)}
        <fieldset className="sf-field"><legend>店铺主营游戏（可多选）</legend>{PRODUCT_GAMES.map(game=><label key={game} className="sf-row"><input type="checkbox" disabled={busy||locked} checked={publicGames(draft.preferred_mode??'').includes(game)} onChange={e=>{const current=publicGames(draft.preferred_mode??'');update('preferred_mode',(e.target.checked?[...current,game]:current.filter(g=>g!==game)).join('、'))}}/>{game}</label>)}{fieldErrors.preferred_mode&&<small className="sf-error">{fieldErrors.preferred_mode}</small>}<small>店铺展示名称与账号昵称分别保存。游戏选择沿用店铺公开资料字段，历史游戏/模式信息会在主动修改后替换。</small></fieldset>
        <div className="sf-field" data-field="voice_file_id"><b>声音名片</b><p>{draft.voice_file_id ? `已绑定 · ${(draft.voice_duration_ms ?? 0) / 1000} 秒` : '尚未绑定声音名片'}</p><small>沿用现有声音名片；当前版本授权需由本人明确确认。</small><small>本页保留已审核的声音名片；暂不提供重新录音。</small>{policyError && <p className="sf-error">{policyError}<button type="button" onClick={() => void loadPolicies()}>重新加载授权</button></p>}{voicePolicies.map(policy => <div className="sf-policy" key={policy.id}><details><summary>{policy.title} · V{policy.version_no}</summary><p>{policy.content}</p></details><label><input type="checkbox" disabled={busy || locked} checked={voiceSelected.includes(policy.id)} onChange={e => setVoiceSelected(ids => e.target.checked ? [...ids, policy.id] : ids.filter(id => id !== policy.id))} />我已阅读并同意《{policy.title}》</label></div>)}{fieldErrors.voice_file_id && <small className="sf-error">{fieldErrors.voice_file_id}</small>}</div>
        <div className="sf-field"><div className="sf-row"><b>接待状态</b><button type="button" className="sf-outline" disabled={busy || ['PENDING_REVIEW', 'BANNED'].includes(profile.status)} aria-pressed={profile.accepting_orders} onClick={() => void toggleAvailability()}>{profile.accepting_orders ? '接待中 · 点击暂停' : '暂停接待 · 点击开启'}</button></div><small>此项独立保存，不代表实时在线，不改变已有订单的义务。</small></div>
        {error && <p className="sf-error" role="alert">{error}</p>}
        <div className="sf-save-bar"><button type="button" className="sf-outline" disabled={busy || locked || (!dirty && revision?.status === 'DRAFT')} onClick={() => void save(false)}>保存草稿</button><button type="submit" className="sf-primary" disabled={busy || locked}>{busy ? '处理中…' : locked ? (profile.status === 'BANNED' ? '当前不可修改' : '审核中') : reviewed ? '提交审核' : '保存资料'}</button></div>
      </form>
    </>}
    {picker && <ImagePicker kind={picker} request={request} onClose={() => setPicker(null)} onSelect={id => { update('seller_avatar_file_id', id); setPicker(null); }} />}
    {leave && <dialog className="sf-dialog" ref={leaveDialog} onCancel={e => { e.preventDefault(); setLeave(null); }} aria-label="未保存修改"><h2>有尚未保存的修改</h2><p>离开后会放弃本次未保存内容，已保存的草稿会保留。</p><div className="sf-row"><button className="sf-primary" onClick={() => setLeave(null)}>继续编辑</button><button onClick={() => { const next = leave; setLeave(null); next(); }}>放弃修改</button></div></dialog>}
  </div>;
}
