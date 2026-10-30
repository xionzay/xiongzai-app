import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProviderDraft, emptyMarketplace, saveProviderDraft, submitProviderApplication, decodeMarketplace } from '../src/features/marketplace/domain.ts';
import { accountProfile, remoteDraft } from '../src/features/marketplace/hostedProfile.ts';

const legacy={gameName:'小熊',gameId:'player_01',server:'wechat',rank:'Ace',kd:'3.25',experience:'Two years',playStyle:'Patient coaching',mode:'duo',voiceIntroduction:{file:'voice-original.m4a',durationMs:12000}};
const valorant={...legacy,game:'valorant',gameId:'熊崽队长#CN一',server:'china',rank:'Diamond',kd:''};

test('provider validation accepts four games and requires K/D only for Peace Elite and Delta Force',()=>{
 for(const game of ['peaceElite','deltaForce','honorOfKings','valorant']){
  const draft=game==='valorant'?valorant:{...legacy,game,kd:game==='honorOfKings'?'':legacy.kd};
  assert.deepEqual(validateProviderDraft(draft),{},game);
 }
 assert.deepEqual(validateProviderDraft(legacy),{});
 for(const game of [undefined,'peaceElite','deltaForce'])assert.equal(validateProviderDraft({...legacy,game,kd:''}).kd,'providerKdError');
 assert.equal(validateProviderDraft({...valorant,server:'qq'}).server,'valorantServerRequired');
 assert.equal(validateProviderDraft({...valorant,gameId:'missing-tag'}).gameId,'invalidValorantGameId');
 assert.equal(validateProviderDraft({...legacy,game:'honorOfKings',kd:'bad'}).kd,'providerKdError');
 assert.equal(validateProviderDraft({...legacy,game:'unknown'}).game,'checkFields');
});

test('editing provider game preserves submitted snapshots and both shapes survive storage',()=>{
 const profile={phone:'13800138186',nickname:'Provider',bio:'Patient coaching',avatarFile:'avatar-original.png',accountType:'provider',providerDraft:valorant};
 const submitted=submitProviderApplication({...structuredClone(emptyMarketplace),profile},true,Date.now());
 const original=structuredClone(submitted.profile.providerApplication.snapshot);
 const edited=saveProviderDraft(submitted,{...legacy,game:'honorOfKings',kd:''});
 assert.equal(edited.profile.providerDraft.game,'honorOfKings');assert.deepEqual(edited.profile.providerApplication.snapshot,original);
 const restored=decodeMarketplace(JSON.stringify(edited));assert.equal(restored.profile.providerDraft.game,'honorOfKings');assert.equal(restored.profile.providerApplication.snapshot.draft.game,'valorant');assert.equal(restored.profile.providerApplication.snapshot.draft.server,'china');
 const oldSubmitted=submitProviderApplication({...structuredClone(emptyMarketplace),profile:{...profile,providerDraft:legacy}},true,Date.now());
 const oldRestored=decodeMarketplace(JSON.stringify(oldSubmitted));assert.equal(Object.hasOwn(oldRestored.profile.providerApplication.snapshot.draft,'game'),false);
});

test('hosted provider mapping retains selected game without adding it to legacy snapshots',()=>{
 const outgoing=remoteDraft(valorant,'voice-id');assert.equal(outgoing.game,'valorant');assert.equal(outgoing.server,'china');assert.equal(outgoing.kd,'');assert.equal(outgoing.voiceMediaId,'voice-id');
 const old=remoteDraft(legacy,'voice-id');assert.equal(Object.hasOwn(old,'game'),false);
 const mapped=accountProfile({profile:{id:'provider',phone:'13800138186',nickname:'Provider',bio:'Profile',avatarMediaId:null,draft:outgoing,application:{id:'application',status:'pending',submittedAt:new Date().toISOString(),agreementVersion:'prototype-hosted-v1',reason:null,snapshot:{nickname:'Submitted',bio:'Original',avatarMediaId:'old-avatar',draft:old}}},files:[]});
 assert.equal(mapped.providerDraft.game,'valorant');assert.equal(mapped.providerDraft.gameId,'熊崽队长#CN一');assert.equal(Object.hasOwn(mapped.providerApplication.snapshot.draft,'game'),false);
});
