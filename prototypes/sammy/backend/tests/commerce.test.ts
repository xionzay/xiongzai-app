import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { ObjectStorage } from '../src/storage.js';
import { createDatabase } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { createSession } from '../src/auth.js';
import { orders,users,listings,media,applications } from '../src/schema.js';
import { workflows,cases,jobs,ledger } from '../src/commerce-schema.js';
import { ensureWorkflow,runDueCommerceJobs } from '../src/commerce-core.js';
import { orderRules } from '../src/orders.js';
test('remaining simulation lifecycle, evidence, finance, cases, jobs, private conversations and assistance',async()=>{
 process.env.SAMMY_SIMULATED_PAYMENTS='true';const {db,pool}=createDatabase(process.env.TEST_DATABASE_URL!);const app=buildApp({db,logger:false,storage:{downloadUrl:async(key:string)=>'https://private-storage.test/'+key} as unknown as ObjectStorage});
 const req=async(method:any,url:string,payload?:any,token?:string)=>{const r=await app.inject({method,url,payload,headers:token?{authorization:`Bearer ${token}`}:{}});return {status:r.statusCode,data:r.json()};};
 try{
  const person=async(phone:string,isAdmin=false)=>{const [u]=await db.insert(users).values({phone,passwordHash:'not-a-real-hash',nickname:'Commerce QA',isAdmin,isSupervisor:isAdmin}).returning();return {...u,token:await createSession(db,u.id)};};
  const buyer=await person('13800138081'),seller=await person('13800138082'),staff=await person('13800138083',true),other=await person('13800138084');
  await db.insert(applications).values({userId:seller.id,status:'approved',reviewedAt:new Date(),reviewerId:staff.id,agreementVersion:'fixture',snapshot:{nickname:seller.nickname,bio:'Approved seller',avatarMediaId:randomUUID(),draft:{gameName:'Seller',gameId:'seller-123',server:'wechat',rank:'Ace',kd:'3',experience:'Years',playStyle:'Calm',mode:'duo',voiceMediaId:randomUUID()}}});
  const [listing]=await db.insert(listings).values({id:randomUUID(),ownerId:seller.id,title:'Evidence service',description:'A complete test listing',game:'peaceElite',mode:'duo',category:'relaxed',priceFen:10000}).returning();
  const makeOrder=async(amount:number)=>{const [o]=await db.insert(orders).values({buyerId:buyer.id,sellerId:seller.id,listingId:listing.id,requestId:randomUUID(),requestHash:'fixture',service:{id:listing.id,revision:1,title:listing.title,description:listing.description,providerName:seller.nickname,mode:'duo',category:'relaxed',game:'peaceElite',unitPriceFen:amount,photoMediaIds:[]},rules:orderRules,delivery:{gameName:'Player',gameId:'player-123',server:'wechat',note:''},quantity:1,totalFen:amount,status:'awaitingService',paidAt:new Date()}).returning();await db.transaction(tx=>ensureWorkflow(tx,o));return o;};
  const imageIds=Array.from({length:5},()=>randomUUID()),videoId=randomUUID();await db.insert(media).values([...imageIds.map((id,i)=>({id,ownerId:seller.id,kind:'evidenceImage' as const,status:'ready' as const,key:'verified/'+id+'.png',mime:'image/png',bytes:100,contentHash:'unique-'+i})),{id:videoId,ownerId:seller.id,kind:'evidenceVideo',status:'ready',key:'verified/'+videoId+'.mp4',mime:'video/mp4',bytes:100,contentHash:'video',durationMs:1000}]);
  const view=async(id:string,token=buyer.token,admin=false)=>(await req('GET',`/v1/${admin?'admin/':''}orders/${id}/workflow`,undefined,token)).data;
  const act=async(id:string,action:string,token:string,fields:any={},admin=false)=>{const v=await view(id,token,admin);return req('POST',`/v1/${admin?'admin/':''}orders/${id}/actions`,{requestId:randomUUID(),version:v.workflow.version,action,...fields},token);};
  const first=await makeOrder(19999);assert.equal((await req('POST','/v1/orders/'+first.id+'/actions',{requestId:randomUUID(),version:1,action:'start'},other.token)).status,404);assert.equal((await act(first.id,'start',seller.token)).status,200);
  assert.equal((await act(first.id,'complete',seller.token,{evidenceIds:imageIds.slice(0,4)})).data.error,'fiveImagesRequired');assert.equal((await act(first.id,'complete',seller.token,{evidenceIds:imageIds})).status,200);
  const complete=await view(first.id);assert.equal(complete.workflow.data.stage,'awaitingAcceptance');const originalDue=Date.parse(complete.workflow.data.acceptanceDue);
  assert.equal((await act(first.id,'extend',buyer.token)).status,200);assert.equal(Date.parse((await view(first.id)).workflow.data.acceptanceDue)-originalDue,86400000);assert.equal((await act(first.id,'extend',buyer.token)).status,409);
  const frozen=await act(first.id,'requestRefund',buyer.token,{amountFen:1000,reason:'Partial quality issue'});assert.equal(frozen.status,200);let c=frozen.data.cases.find((r:any)=>r.id===frozen.data.workflow.data.activeCaseId);assert.equal(c.data.state,'S01');assert.equal(frozen.data.workflow.data.frozenFen,19999);
  assert.equal((await act(first.id,'withdrawRefund',buyer.token,{caseId:c.id})).status,200);assert.equal((await view(first.id)).workflow.data.extended,true);
  assert.equal((await act(first.id,'confirm',buyer.token)).status,200);let settled=await view(first.id);assert.equal(settled.workflow.data.commissionFen,2000);assert.equal(settled.workflow.data.availableFen,17999);
  const ticket=(await req('POST','/v1/tickets',{requestId:randomUUID(),kind:'support',category:'Special claim',text:'Order issue after receipt',orderId:first.id},buyer.token)).data.ticket;
  const special=await act(first.id,'specialOpen',staff.token,{ticketId:ticket.id,amountFen:2000,reason:'Verified in-window report'},true);assert.equal(special.status,200);c=special.data.cases.find((r:any)=>r.id===special.data.workflow.data.activeCaseId);
  const rule=await act(first.id,'ruling',staff.token,{caseId:c.id,amountFen:2000,findings:'Verified defect',evidenceSummary:'Reviewed supplied materials',ruleReference:'Agreed prototype resolution',reasoning:'Explicit facts; no invented percentages',obligations:'Terminate remaining obligations'},true);assert.equal(rule.status,200);c=rule.data.cases.find((r:any)=>r.id===c.id);
  assert.equal((await act(first.id,'acceptRuling',buyer.token,{caseId:c.id,rulingVersion:c.data.ruling.version})).status,200);assert.equal((await act(first.id,'acceptRuling',seller.token,{caseId:c.id,rulingVersion:c.data.ruling.version})).status,200);
  assert.equal((await act(first.id,'refundDispatch',staff.token,{caseId:c.id},true)).status,200);const refunded=await act(first.id,'refundOutcome',staff.token,{caseId:c.id,outcome:'success'},true);assert.equal(refunded.status,200);assert.equal(refunded.data.workflow.data.refundedFen,2000);assert.equal(refunded.data.workflow.data.commissionFen,0);assert.equal(refunded.data.workflow.data.availableFen,17999);assert.equal((await act(first.id,'refundOutcome',staff.token,{caseId:c.id,outcome:'success'},true)).status,409);
  const large=await makeOrder(20000);await act(large.id,'start',seller.token);assert.equal((await act(large.id,'complete',seller.token,{evidenceIds:imageIds})).data.error,'recordingRequired');assert.equal((await act(large.id,'complete',seller.token,{evidenceIds:[...imageIds,videoId],continuous:true})).status,200);
  let w=(await view(large.id)).workflow;w.data.acceptanceDue=new Date(Date.now()-1000).toISOString();await db.update(workflows).set({data:w.data}).where(eq(workflows.orderId,large.id));await db.update(jobs).set({dueAt:new Date(Date.now()-1000)}).where(eq(jobs.orderId,large.id));await runDueCommerceJobs(db);await runDueCommerceJobs(db);assert.equal((await view(large.id)).workflow.data.stage,'completed');assert.equal((await db.select().from(ledger).where(eq(ledger.orderId,large.id))).filter(l=>l.kind==='deadline').length,1);
  const risk=await act(large.id,'riskFreeze',staff.token,{holdId:'risk-test',amountFen:10000,reason:'Independent risk hold'},true);assert.equal(risk.status,200);assert.equal(risk.data.workflow.data.frozenFen,10000);
  const payout=(await req('POST','/v1/payouts',{requestId:randomUUID(),label:'SYNTHETIC TEST DESTINATION',acknowledgeSimulation:true},seller.token)).data.payout;
  assert.equal((await req('POST',`/v1/admin/payouts/${payout.id}/verify`,{requestId:randomUUID(),verified:true,reason:'Synthetic fixture only'},staff.token)).status,200);
  const money=(await req('GET','/v1/funds',undefined,seller.token)).data.balances;
  const withdrawals=await Promise.all([req('POST','/v1/withdrawals',{requestId:randomUUID(),accountId:payout.id,amountFen:money.withdrawable,acknowledgeSimulation:true},seller.token),req('POST','/v1/withdrawals',{requestId:randomUUID(),accountId:payout.id,amountFen:money.withdrawable,acknowledgeSimulation:true},seller.token)]);assert.deepEqual(withdrawals.map(r=>r.status).sort(),[200,409]);const withdrawal=withdrawals.find(r=>r.status===200)!.data.withdrawal;
  assert.equal((await req('POST',`/v1/admin/withdrawals/${withdrawal.id}/outcome`,{requestId:randomUUID(),status:'processing',reason:'Simulated dispatch'},staff.token)).status,200);assert.equal((await req('POST',`/v1/admin/withdrawals/${withdrawal.id}/outcome`,{requestId:randomUUID(),status:'failed',reason:'Confirmed no synthetic payout'},staff.token)).status,200);
  const conv=(await req('POST','/v1/conversations',{orderId:first.id},buyer.token)).data.conversation;
  const sent={requestId:randomUUID(),kind:'order',objectId:first.id};const message=await req('POST',`/v1/conversations/${conv.id}/messages`,sent,buyer.token);assert.equal(message.status,200);assert.equal((await req('POST',`/v1/conversations/${conv.id}/messages`,sent,buyer.token)).data.message.id,message.data.message.id);assert.equal((await req('GET',`/v1/conversations/${conv.id}/messages`,undefined,other.token)).status,404);
  // Text replies persist for both parties; unread acknowledgements only cover fetched messages.
  const [approvedApplication]=await db.select().from(applications).where(eq(applications.userId,seller.id));
  await db.update(listings).set({status:'published',reviewStatus:'approved',applicationId:approvedApplication.id,publicationConsentAt:new Date()}).where(eq(listings.id,listing.id));
  assert.equal((await req('POST','/v1/conversations',{listingId:listing.id},buyer.token)).data.conversation.id,conv.id);
  assert.equal((await req('POST','/v1/conversations',{listingId:listing.id},seller.token)).status,409);
  assert.equal((await req('GET',`/v1/conversations/${conv.id}/messages`)).status,401);
  const textPayload={requestId:randomUUID(),kind:'text',text:'Hello, are you available?'};
  const textMessage=await req('POST',`/v1/conversations/${conv.id}/messages`,textPayload,buyer.token);
  assert.equal(textMessage.status,200);
  assert.equal((await req('POST',`/v1/conversations/${conv.id}/messages`,textPayload,buyer.token)).data.message.id,textMessage.data.message.id);
  assert.equal((await req('POST',`/v1/conversations/${conv.id}/messages`,{...textPayload,text:'Changed'},buyer.token)).status,409);
  const inbox=(await req('GET','/v1/conversations',undefined,seller.token)).data.conversations;
  assert.equal(inbox.find((c:any)=>c.id===conv.id).latestBody,textPayload.text);
  assert.equal(inbox.find((c:any)=>c.id===conv.id).unreadCount,2);
  assert.equal((await req('POST',`/v1/conversations/${conv.id}/read`,{messageIds:[message.data.message.id]},other.token)).status,404);
  await req('POST',`/v1/conversations/${conv.id}/read`,{messageIds:[message.data.message.id]},seller.token);
  assert.equal((await req('GET','/v1/conversations',undefined,seller.token)).data.conversations.find((c:any)=>c.id===conv.id).unreadCount,1);
  const replyMessage=await req('POST',`/v1/conversations/${conv.id}/messages`,{requestId:randomUUID(),kind:'text',text:'Yes, welcome!'},seller.token);
  assert.equal(replyMessage.status,200);
  assert.ok((await req('GET',`/v1/conversations/${conv.id}/messages`,undefined,buyer.token)).data.messages.some((m:any)=>m.id===replyMessage.data.message.id));
  // Historical product snapshots survive edits and retries after delisting.
  const productPayload={requestId:randomUUID(),kind:'product',objectId:listing.id};
  const productMessage=await req('POST',`/v1/conversations/${conv.id}/messages`,productPayload,seller.token);
  assert.equal(productMessage.status,200);
  await db.update(listings).set({title:'Updated title',priceFen:12000}).where(eq(listings.id,listing.id));
  assert.equal((await req('POST',`/v1/conversations/${conv.id}/messages`,productPayload,seller.token)).data.message.id,productMessage.data.message.id);
  assert.equal((await req('POST',`/v1/conversations/${conv.id}/messages`,{...productPayload,requestId:randomUUID()},seller.token)).status,403);
  const cards=(await req('GET',`/v1/conversations/${conv.id}/messages`,undefined,buyer.token)).data.messages;
  const historical=cards.find((m:any)=>m.id===productMessage.data.message.id).card;
  assert.equal(historical.title,listing.title);assert.equal(historical.priceFen,10000);assert.equal(historical.available,false);
  const orderCard=cards.find((m:any)=>m.id===message.data.message.id).card;
  assert.equal(orderCard.quantity,first.quantity);assert.equal(orderCard.totalFen,first.totalFen);assert.equal(orderCard.paid,true);
  assert.equal(orderCard.refundedFen,(await view(first.id)).workflow.data.refundedFen);
  assert.equal(JSON.stringify(orderCard).includes('player-123'),false);
  // Chat must remain usable when payment simulation is disabled.
  process.env.SAMMY_SIMULATED_PAYMENTS='false';const chatApp=buildApp({db,logger:false});
  try{
   assert.equal((await chatApp.inject({method:'POST',url:`/v1/conversations/${conv.id}/messages`,headers:{authorization:`Bearer ${buyer.token}`},payload:{requestId:randomUUID(),kind:'text',text:'Messaging independently of payments'}})).statusCode,200);
   for(const kind of ['support','feedback']){
    const created=await chatApp.inject({method:'POST',url:'/v1/tickets',headers:{authorization:`Bearer ${buyer.token}`},payload:{requestId:randomUUID(),kind,category:'Help',text:'Assistance without payment simulation'}});
    assert.equal(created.statusCode,200);const id=created.json().ticket.id;
    assert.equal((await chatApp.inject({method:'POST',url:`/v1/admin/tickets/${id}/reply`,headers:{authorization:`Bearer ${staff.token}`},payload:{requestId:randomUUID(),status:'replied',text:'We can help'}})).statusCode,200);
    if(kind==='support')assert.equal((await chatApp.inject({method:'POST',url:`/v1/tickets/${id}/replies`,headers:{authorization:`Bearer ${buyer.token}`},payload:{requestId:randomUUID(),text:'More information'}})).statusCode,200);
   }
   for(const kind of ['support','feedback']){
    const list=await chatApp.inject({method:'GET',url:'/v1/tickets?kind='+kind,headers:{authorization:`Bearer ${buyer.token}`}});
    assert.equal(list.statusCode,200);assert.ok(list.json().tickets.length>0);assert.ok(list.json().tickets.every((t:any)=>t.kind===kind));
   }
  }finally{await chatApp.close();process.env.SAMMY_SIMULATED_PAYMENTS='true';}
  const feedback=(await req('POST','/v1/tickets',{requestId:randomUUID(),kind:'feedback',category:'Suggestion',text:'Please improve search'},buyer.token)).data.ticket;const before=(await view(first.id)).workflow.version;const reply={requestId:randomUUID(),status:'replied',text:'Thanks, recorded for review.'};assert.equal((await req('POST',`/v1/admin/tickets/${feedback.id}/reply`,reply,staff.token)).status,200);await req('POST',`/v1/admin/tickets/${feedback.id}/reply`,reply,staff.token);assert.equal((await view(first.id)).workflow.version,before);const notices=(await req('GET','/v1/notifications',undefined,buyer.token)).data.notifications;assert.equal(notices.filter((n:any)=>n.objectId===feedback.id).length,1);

  assert.equal((await req('GET',`/v1/orders/${first.id}/evidence/${imageIds[0]}`,undefined,buyer.token)).data.error,'redactedEvidencePending');assert.equal((await req('GET',`/v1/orders/${first.id}/evidence/${imageIds[0]}`,undefined,other.token)).status,404);
  const redacted=randomUUID();await db.insert(media).values({id:redacted,ownerId:staff.id,kind:'evidenceImage',status:'ready',key:'verified/'+redacted+'.png',mime:'image/png',bytes:100,contentHash:'redacted-copy'});const redaction=await req('POST',`/v1/admin/orders/${first.id}/evidence/${imageIds[0]}/redact`,{requestId:randomUUID(),redactedMediaId:redacted,reason:'Removed sensitive account identifiers'},staff.token);assert.equal(redaction.status,200);const shared=await req('GET',`/v1/orders/${first.id}/evidence/${imageIds[0]}`,undefined,buyer.token);assert.equal(shared.status,200);assert.equal(shared.data.redacted,true);assert.ok(shared.data.url.includes(redacted));
  // Duplicate materials require manual verification and cannot start acceptance early.
  const duplicates=await makeOrder(10000);await act(duplicates.id,'start',seller.token);await db.update(media).set({contentHash:'unique-0'}).where(eq(media.id,imageIds[1]));
  const duplicateResult=await act(duplicates.id,'complete',seller.token,{evidenceIds:imageIds});assert.equal(duplicateResult.data.workflow.data.stage,'inService');assert.equal(duplicateResult.data.workflow.data.evidenceReview.status,'pending');assert.equal(duplicateResult.data.workflow.data.acceptanceDue,null);
  await act(duplicates.id,'evidenceApprove',staff.token,{reason:'Reviewed original files for relevance'},true);assert.equal((await act(duplicates.id,'complete',seller.token,{evidenceIds:imageIds})).data.workflow.data.stage,'awaitingAcceptance');await db.update(media).set({contentHash:'unique-1'}).where(eq(media.id,imageIds[1]));
  // Two appeal levels require independent reviewers and new evidence at level two.
  const reviewer2=await person('13800138085',true),reviewer3=await person('13800138086',true),appealed=await makeOrder(10000);
  await act(appealed.id,'riskFreeze',staff.token,{holdId:'independent',amountFen:5000,reason:'Separate risk concern'},true);
  let disputed=await act(appealed.id,'requestRefund',buyer.token,{amountFen:1000,reason:'Quality issue'});let dispute=disputed.data.cases.find((r:any)=>r.id===disputed.data.workflow.data.activeCaseId);
  await act(appealed.id,'intervene',buyer.token,{caseId:dispute.id,reason:'Need staff assessment'});
  const rulingBody={caseId:dispute.id,amountFen:0,findings:'Delivery documented',evidenceSummary:'Files examined',ruleReference:'Prototype explicit decision',reasoning:'No unsupported liability percentage',obligations:'Continue original agreed service'};
  let ruling=await act(appealed.id,'ruling',staff.token,rulingBody,true);dispute=ruling.data.cases.find((r:any)=>r.id===dispute.id);
  assert.equal((await act(appealed.id,'appeal',buyer.token,{caseId:dispute.id,rulingVersion:dispute.data.ruling.version,reason:'Evidence misunderstood'})).status,200);
  assert.equal((await act(appealed.id,'ruling',staff.token,rulingBody,true)).data.error,'independentReviewerRequired');
  ruling=await act(appealed.id,'ruling',reviewer2.token,rulingBody,true);dispute=ruling.data.cases.find((r:any)=>r.id===dispute.id);
  assert.equal((await act(appealed.id,'appeal',buyer.token,{caseId:dispute.id,rulingVersion:dispute.data.ruling.version,reason:'Still disputed'})).data.error,'newEvidenceRequired');
  const newEvidence=randomUUID();await db.insert(media).values({id:newEvidence,ownerId:buyer.id,kind:'evidenceImage',status:'ready',key:'verified/'+newEvidence+'.png',mime:'image/png',bytes:100,contentHash:'new-appeal-evidence'});
  await act(appealed.id,'appeal',buyer.token,{caseId:dispute.id,rulingVersion:dispute.data.ruling.version,reason:'New original screenshot',evidenceIds:[newEvidence]});
  const finalRuling=await act(appealed.id,'ruling',reviewer3.token,rulingBody,true);assert.equal(finalRuling.data.workflow.data.activeCaseId,null);assert.equal(finalRuling.data.workflow.data.frozenFen,5000);assert.equal(finalRuling.data.workflow.data.holds['risk:independent'].amountFen,5000);
  // A denied supplementary-acceptance dispute restores R02 and its original freeze.
  const supplementary=await makeOrder(10000);await act(supplementary.id,'start',seller.token);const request=await act(supplementary.id,'requestRefund',buyer.token,{amountFen:1000,reason:'Need additional delivery'});let sc=request.data.cases.find((r:any)=>r.id===request.data.workflow.data.activeCaseId);
  const proposal=await act(supplementary.id,'propose',seller.token,{caseId:sc.id,kind:'supplement',description:'Provide the missing agreed hour; five screenshots and buyer acceptance required.',deadline:new Date(Date.now()+7200000).toISOString()});sc=proposal.data.cases.find((r:any)=>r.id===sc.id);
  await act(supplementary.id,'respondProposal',buyer.token,{caseId:sc.id,proposalVersion:sc.data.proposal.version,accept:true});await act(supplementary.id,'complete',seller.token,{evidenceIds:imageIds});
  await act(supplementary.id,'intervene',buyer.token,{caseId:sc.id,reason:'Dispute supplemental completion'});await act(supplementary.id,'evidenceExtension',staff.token,{caseId:sc.id,reason:'One permitted review-level extension'},true);const supplementalRuling=await act(supplementary.id,'ruling',staff.token,{...rulingBody,caseId:sc.id},true);sc=supplementalRuling.data.cases.find((r:any)=>r.id===sc.id);
  await act(supplementary.id,'acceptRuling',buyer.token,{caseId:sc.id,rulingVersion:sc.data.ruling.version});const restored=await act(supplementary.id,'acceptRuling',seller.token,{caseId:sc.id,rulingVersion:sc.data.ruling.version});assert.equal(restored.data.cases.find((r:any)=>r.id===sc.id).data.state,'R02');assert.equal(restored.data.workflow.data.activeCaseId,sc.id);assert.equal(restored.data.workflow.data.frozenFen,10000);
  await act(supplementary.id,'intervene',buyer.token,{caseId:sc.id,reason:'Additional disputed fact in the same review level'});assert.equal((await act(supplementary.id,'evidenceExtension',staff.token,{caseId:sc.id,reason:'Cannot reuse the level extension'},true)).status,409);
  const secondSupplemental=await act(supplementary.id,'ruling',reviewer2.token,{...rulingBody,caseId:sc.id},true);sc=secondSupplemental.data.cases.find((r:any)=>r.id===sc.id);await act(supplementary.id,'acceptRuling',buyer.token,{caseId:sc.id,rulingVersion:sc.data.ruling.version});await act(supplementary.id,'acceptRuling',seller.token,{caseId:sc.id,rulingVersion:sc.data.ruling.version});
  assert.equal((await act(supplementary.id,'confirm',buyer.token)).data.workflow.data.commissionFen,1000);
  // Seller silence accepts the requested amount, but never fabricates channel success.
  const silence=await makeOrder(10000);const silentCase=await act(silence.id,'requestRefund',buyer.token,{amountFen:100,reason:'Small disputed portion'});let silent=silentCase.data.cases.find((r:any)=>r.id===silentCase.data.workflow.data.activeCaseId);silent.data.due=new Date(Date.now()-1000).toISOString();await db.update(cases).set({data:silent.data}).where(eq(cases.id,silent.id));await db.update(jobs).set({dueAt:new Date(Date.now()-1000)}).where(eq(jobs.orderId,silence.id));await runDueCommerceJobs(db);const afterSilence=await view(silence.id);assert.equal(afterSilence.cases.find((r:any)=>r.id===silent.id).data.state,'pendingRefund');assert.equal(afterSilence.workflow.data.refundedFen,0);
  // Freeze and withdrawal share the seller lock; a later funding gap cannot be dispatched.
  const beforeRace=(await req('GET','/v1/funds',undefined,seller.token)).data.balances.withdrawable;
  const raceResults=await Promise.all([req('POST','/v1/withdrawals',{requestId:randomUUID(),accountId:payout.id,amountFen:beforeRace,acknowledgeSimulation:true},seller.token),act(large.id,'riskFreeze',staff.token,{holdId:'race-hold',amountFen:18000,reason:'Independent concurrent risk hold'},true)]);assert.equal(raceResults[1].status,200);assert.ok([200,409].includes(raceResults[0].status));
  if(raceResults[0].status===200){const pendingWithdrawal=raceResults[0].data.withdrawal;assert.equal((await req('POST',`/v1/admin/withdrawals/${pendingWithdrawal.id}/outcome`,{requestId:randomUUID(),status:'processing',reason:'Must not dispatch across a funding gap'},staff.token)).data.error,'fundsFrozen');assert.equal((await req('POST',`/v1/admin/withdrawals/${pendingWithdrawal.id}/outcome`,{requestId:randomUUID(),status:'failed',reason:'Confirmed not dispatched; release reservation'},staff.token)).status,200);}
  const afterRace=(await req('GET','/v1/funds',undefined,seller.token)).data.balances;assert.equal(afterRace.debt,0);assert.equal((await view(large.id)).workflow.data.holds['risk:race-hold'].amountFen,18000);
 }finally{await app.close();await pool.end();}
});
