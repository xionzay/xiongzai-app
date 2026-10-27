import { and,asc,desc,eq,inArray,sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from './db.js';
import { orders,users,media } from './schema.js';
import { workflows,cases,ledger,jobs,notifications,commerceEvents,type Workflow,type CaseData } from './commerce-schema.js';
import { ApiError } from './validation.js';
export type Tx=Parameters<Parameters<Database['transaction']>[0]>[0];
export const HOUR=3600000,DAY=24*HOUR;
export const dateAfter=(ms:number)=>new Date(Date.now()+ms).toISOString();
export function initialWorkflow():Workflow{return {stage:'awaitingService',evidenceIds:[],acceptanceDue:null,extended:false,terminatedAt:null,activeCaseId:null,caseCount:0,refundedFen:0,settled:false,holds:{},availableFen:0,unsettledFen:0,frozenFen:0,commissionFen:0,startedAt:null,completedAt:null};}
export async function syncPosition(tx:Tx,order:typeof orders.$inferSelect,data:Workflow,reference:string,kind:string){
 const commission=data.settled&&data.refundedFen===0?Math.floor((order.totalFen+5)/10):0;
 const entitlement=order.totalFen-data.refundedFen-commission;
 const frozen=Math.min(entitlement,Math.max(0,...Object.values(data.holds).map(h=>h.amountFen)));
 const available=data.settled?entitlement-frozen:0,unsettled=data.settled?0:entitlement-frozen;
 const delta={availableDelta:available-data.availableFen,unsettledDelta:unsettled-data.unsettledFen,frozenDelta:frozen-data.frozenFen,commissionDelta:commission-data.commissionFen};
 if(Object.values(delta).some(Boolean))await tx.insert(ledger).values({sellerId:order.sellerId,orderId:order.id,reference,kind,...delta});
 Object.assign(data,{availableFen:available,unsettledFen:unsettled,frozenFen:frozen,commissionFen:commission});
}
export async function ensureWorkflow(tx:Tx,order:typeof orders.$inferSelect){
 const [existing]=await tx.select().from(workflows).where(eq(workflows.orderId,order.id));if(existing)return existing;
 if(!order.paidAt)throw new ApiError(409,'orderNotPaid');
 const data=initialWorkflow();await syncPosition(tx,order,data,'payment:'+order.id,'paymentHeld');
 return (await tx.insert(workflows).values({orderId:order.id,data}).returning())[0];
}
export async function lockOrder(tx:Tx,id:string){
 const [read]=await tx.select().from(orders).where(eq(orders.id,id));if(!read)throw new ApiError(404,'orderUnavailable');
 await tx.select({id:users.id}).from(users).where(inArray(users.id,[read.buyerId,read.sellerId])).orderBy(asc(users.id)).for('update');
 const [order]=await tx.select().from(orders).where(eq(orders.id,id)).for('update');
 const wf=await ensureWorkflow(tx,order);return {order,wf};
}
export async function notice(tx:Tx,userId:string,dedupeKey:string,kind:string,objectId:string,summary:string){await tx.insert(notifications).values({userId,dedupeKey,kind,objectId,summary}).onConflictDoNothing();}
export async function schedule(tx:Tx,orderId:string,version:number,data:Workflow,c?:{id:string;data:CaseData}|null){
 const due=data.activeCaseId&&c?c.data.due:data.acceptanceDue;
 if(due)await tx.insert(jobs).values({key:orderId+':clock',orderId,kind:data.activeCaseId?'case':'acceptance',version,dueAt:new Date(due)}).onConflictDoUpdate({target:jobs.key,set:{kind:data.activeCaseId?'case':'acceptance',version,dueAt:new Date(due),done:false}});
 else await tx.update(jobs).set({done:true}).where(eq(jobs.key,orderId+':clock'));
}
export function restoreWorkflow(data:Workflow,c:CaseData){
 if(c.supplementaryStage==='R01'){data.stage='inService';c.state='R01';c.due=c.ruling?.deadline??null;c.supplementaryStage=undefined;return;}
 if(c.supplementaryDispute){data.stage='awaitingAcceptance';data.acceptanceDue=dateAfter(Math.max(c.remainingMs??0,DAY));c.state='R02';c.due=data.acceptanceDue;c.supplementaryDispute=false;c.supplementaryStage=undefined;return;}
 delete data.holds[c.kind+':'+c.createdAt];data.activeCaseId=null;
 if(c.kind==='special')return;
 data.stage=c.originalStage;
 if(c.originalStage==='awaitingAcceptance'){data.acceptanceDue=dateAfter(Math.max(c.remainingMs??0,DAY));}else data.acceptanceDue=null;
}
export async function validateEvidence(tx:Tx,ownerId:string,ids:string[],recordingRequired:boolean,continuous:boolean){
 const files=ids.length?await tx.select().from(media).where(and(inArray(media.id,ids),eq(media.ownerId,ownerId),eq(media.status,'ready'))):[];
 if(files.length!==ids.length||files.some(f=>!['evidenceImage','evidenceVideo'].includes(f.kind)))throw new ApiError(403,'evidenceNotOwned');
 if(files.filter(f=>f.kind==='evidenceImage').length<5)throw new ApiError(400,'fiveImagesRequired');
 if(recordingRequired&&(!continuous||!files.some(f=>f.kind==='evidenceVideo')))throw new ApiError(400,'recordingRequired');
 const hashes=files.map(f=>f.contentHash).filter(Boolean);return {files,duplicates:new Set(hashes).size!==hashes.length};
}
export async function balances(tx:Pick<Database,'execute'>,sellerId:string){const r=await tx.execute(sql`SELECT coalesce(sum(available_delta),0)::bigint AS available,coalesce(sum(unsettled_delta),0)::bigint AS unsettled,coalesce(sum(frozen_delta),0)::bigint AS frozen,coalesce(sum(reserved_delta),0)::bigint AS reserved,coalesce(sum(commission_delta),0)::bigint AS commission FROM seller_ledger WHERE seller_id=${sellerId}`);const b=Object.fromEntries(Object.entries(r.rows[0]).map(([key,value])=>[key,Number(value)])) as Record<string,number>;if(Object.values(b).some(n=>!Number.isSafeInteger(n)))throw new ApiError(409,'financeRangeExceeded');return {available:b.available,unsettled:b.unsettled,frozen:b.frozen,reserved:b.reserved,commission:b.commission,debt:Math.max(0,-b.available),withdrawable:Math.max(0,b.available)};}
export async function runDueCommerceJobs(db:Database){
 const due=await db.select().from(jobs).where(and(eq(jobs.done,false),sql`${jobs.dueAt}<=now()`)).orderBy(asc(jobs.dueAt)).limit(50);let processed=0;
 for(const job of due)await db.transaction(async tx=>{
  const {order,wf}=await lockOrder(tx,job.orderId);const [current]=await tx.select().from(jobs).where(eq(jobs.key,job.key)).for('update');
  if(!current||current.done||current.version!==wf.version||current.dueAt.getTime()>Date.now())return;
  const data=structuredClone(wf.data);let c=data.activeCaseId?(await tx.select().from(cases).where(eq(cases.id,data.activeCaseId)).for('update'))[0]:null;
  if(c){c={...c,data:structuredClone(c.data)};const state=c.data.state;
   if(state==='S01'){c.data.state='pendingRefund';c.data.refundId=randomUUID();c.data.due=null;}
   else if(state==='S03'){c.data.state='resolved';c.data.due=null;restoreWorkflow(data,c.data);}
   else if(state==='S02'){c.data.proposal=null;c.data.state=c.data.rounds<2?'S05':'P01';c.data.due=dateAfter(DAY);}
   else if(state==='S05'||state==='R01'){if(state==='R01')c.data.supplementaryStage='R01';c.data.state='P01';c.data.due=dateAfter(DAY);}
   else if(state==='R02'){data.stage='completed';data.settled=true;data.terminatedAt??=new Date().toISOString();data.acceptanceDue=null;delete data.holds[c.data.kind+':'+c.data.createdAt];data.activeCaseId=null;c.data.state='resolved';c.data.due=null;}
   else if(state==='P02'&&c.data.ruling){if(c.data.ruling.amountFen>0){c.data.amountFen=c.data.ruling.amountFen;c.data.state='pendingRefund';c.data.refundId=randomUUID();c.data.due=null;}else{c.data.state='resolved';c.data.due=null;restoreWorkflow(data,c.data);}}
   else {c.data.reviewOverdue=true;c.data.due=dateAfter(DAY);await notice(tx,order.buyerId,`${job.key}:${job.version}:review-buyer`,'case',c.id,'Platform review deadline reached; staff decision required. / 平台审核期限已到，等待工作人员处理。');await notice(tx,order.sellerId,`${job.key}:${job.version}:review-seller`,'case',c.id,'Platform review deadline reached; staff decision required. / 平台审核期限已到，等待工作人员处理。');}
   c.data.updatedAt=new Date().toISOString();await tx.update(cases).set({data:c.data,version:c.version+1}).where(eq(cases.id,c.id));
  }else if(data.stage==='awaitingAcceptance'&&data.acceptanceDue&&Date.parse(data.acceptanceDue)<=Date.now()){data.stage='completed';data.settled=true;data.terminatedAt??=new Date().toISOString();data.acceptanceDue=null;}
  const reference=`job:${job.key}:${job.version}`;await syncPosition(tx,order,data,reference,'deadline');await tx.update(workflows).set({data,version:wf.version+1}).where(eq(workflows.orderId,order.id));await tx.update(jobs).set({done:true}).where(eq(jobs.key,job.key));await schedule(tx,order.id,wf.version+1,data,c);await tx.insert(commerceEvents).values({orderId:order.id,requestId:reference,requestHash:reference,action:'deadline',result:{version:wf.version+1,stage:data.stage,caseState:c?.data.state??null}}).onConflictDoNothing();processed++;
 });
 return {processed};
}
