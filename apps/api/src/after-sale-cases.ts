import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { AppError, toApiJson, afterSaleLocalRules as rules, type AfterSaleCaseData, type AfterSaleCaseState, type AfterSaleOffer, type AfterSaleDecision, type ErrorCode } from "@xiongzai/contracts";
import { afterSaleCases, afterSaleCaseEvents, adminOperationLogs, financialTransferOperations, files, fileUsages, notifications, orders, refunds, payments, uuidv7, type DatabaseClient, type DatabaseTransaction } from "@xiongzai/database";
import { AfterSaleFunds, IdempotencyService, OutboxService, ScheduledJobService, ORDER_JOB_TYPES, FinanceLedgerEngine } from "@xiongzai/application";
import type { RequestMetadata } from "./identity-user.service.js";

export const AFTER_SALE_CASE_DEADLINE = "AFTER_SALE_CASE_DEADLINE";
type CaseRow = typeof afterSaleCases.$inferSelect;
type OrderRow = typeof orders.$inferSelect;
type RefundRow = typeof refunds.$inferSelect;
export type CaseActor = {userId:string} | {adminId:string; supervisor:boolean};
export type CaseAction =
  | {action:"MODIFY"; amountCent:bigint; reasonCode:string; reasonText:string}
  | {action:"WITHDRAW"|"APPROVE"|"ESCALATE"; reason:string}
  | {action:"REJECT"; reason:string; fileIds:string[]}
  | {action:"OFFER"; offer:Omit<AfterSaleOffer,"id"|"proposer_id"|"expires_at">}
  | {action:"RESPOND"; offerId:string; accept:boolean}
  | {action:"ADD_EVIDENCE"; fileIds:string[]}
  | {action:"SUBMIT_REMEDY"|"APPEND_REMEDY"; fileIds:string[]}
  | {action:"CONFIRM_REMEDY"|"EXTEND_REMEDY"|"MATERIALS_COMPLETE"}
  | {action:"EXTEND_MATERIALS"; seconds:number; reason:string}
  | {action:"RECHECK_FUNDING"|"CLOSE_SPECIAL"|"RETRY_REFUND";reason:string}
  | {action:"MARK_EVIDENCE_SHAREABLE";reason:string;fileIds:string[]}
  | {action:"DECIDE"; decision:Omit<AfterSaleDecision,"id"|"level"|"reviewer_id"|"issued_at"|"appeal_deadline_at">}
  | {action:"ACCEPT_DECISION"; decisionId:string}
  | {action:"APPEAL"; decisionId:string; reason:string; fileIds:string[]}
  | {action:"TIMEOUT"};
interface ApprovalBridge {
  approve(tx:DatabaseTransaction,refund:RefundRow,order:OrderRow,amount:bigint,metadata:RequestMetadata):Promise<void>;
  validateRemedy(tx:DatabaseTransaction,order:OrderRow,fileIds:string[]):Promise<void>;
  completeRemedy(tx:DatabaseTransaction,order:OrderRow,metadata:RequestMetadata):Promise<void>;
}

/** Persistent case transitions. Channel calls are deliberately not made here. */
export class AfterSaleCaseEngine {
  private readonly jobs = new ScheduledJobService();
  private readonly outbox = new OutboxService();
  private readonly idempotency = new IdempotencyService();
  private readonly funds = new AfterSaleFunds();
  constructor(private readonly database:DatabaseClient,private readonly bridge:ApprovalBridge) {}

  async create(userId:string,input:{orderId:string;amountCent:bigint;reasonCode:string;reasonText:string},key:string,metadata:RequestMetadata) {
    return this.database.db.transaction(async tx=>{
      const reservation=await this.idempotency.reserve(tx,{scope:`case:create:${userId}`,key,request:input,expiresAt:new Date(Date.now()+86400000)});
      if(reservation.replay?.body)return reservation.replay.body;
      const [order]=await tx.select().from(orders).where(eq(orders.id,input.orderId)).for("update");
      if(!order||order.buyerId!==userId)throw fail("ORDER_NOT_FOUND","订单不存在",404);
      if(order.ruleVersion!=="V3.1"||order.fulfillmentSecondsSnapshot===null)throw fail("CASE_LEGACY_ORDER","历史预约订单继续使用原退款流程");
      if(!["PENDING_SERVICE","IN_SERVICE","PENDING_BUYER_CONFIRM"].includes(order.status)||order.completedAt)throw fail("CASE_SUPPORT_REQUIRED","首次终结后须由客服核验特殊受理资格");
      const active=await tx.select().from(refunds).where(and(eq(refunds.orderId,order.id),inArray(refunds.status,["REQUESTED","SELLER_APPROVED","SELLER_REJECTED","NEGOTIATING","PLATFORM_REVIEW","REFUND_PROCESSING"]))).limit(1);
      if(active.length){const [existing]=await tx.select().from(afterSaleCases).where(eq(afterSaleCases.id,active[0]!.id));if(existing){const view=await this.view(tx,existing);await this.idempotency.complete(tx,reservation.id,{statusCode:201,body:view,resourceType:"REFUND",resourceId:existing.id});return view;}throw fail("REFUND_ACTIVE_EXISTS","已有历史退款正在处理");}
      if(order.afterSaleStatus==="IN_PROGRESS")throw fail("CASE_FREEZE_CONFLICT","订单已有其他售后冻结，请联系平台核验");
      const previous=await tx.select({id:refunds.id}).from(refunds).where(eq(refunds.orderId,order.id));
      if(previous.length>=rules.applicationLimit)throw fail("CASE_APPLICATION_LIMIT","每单最多三次买家自助售后，请联系平台");
      validAmount(input.amountCent,order);
      const [payment]=await tx.select().from(payments).where(and(eq(payments.orderId,order.id),inArray(payments.status,["PAID","PARTIALLY_REFUNDED"]))).for("update");
      if(!payment)throw fail("REFUND_PAYMENT_UNAVAILABLE","无可退款支付记录");
      const now=new Date(),id=uuidv7();
      const data:AfterSaleCaseData={original_status:order.status,paused_at:now.toISOString(),original_fulfillment_due_at:order.fulfillmentDueAt?.toISOString()??null,receipt_remaining_ms:order.autoConfirmAt?Math.max(0,order.autoConfirmAt.getTime()-now.getTime()):null,modifications:0,negotiation_rounds:0,platform_entered:false,review_level:0,offer:null,evidence_file_ids:[]};
      await tx.insert(refunds).values({id,refundNo:`RF${randomUUID().replaceAll("-","")}`,orderId:order.id,paymentId:payment.id,applicantId:userId,requestedAmountCent:input.amountCent,reasonCode:input.reasonCode,reasonText:input.reasonText});
      const [created]=await tx.insert(afterSaleCases).values({id,orderId:order.id,state:"S01",kind:"NORMAL",deadlineAt:after(now,rules.responseSeconds),data:json(data)}).returning();
      await tx.update(orders).set({afterSaleStatus:"IN_PROGRESS",version:order.version+1,updatedAt:now}).where(and(eq(orders.id,order.id),eq(orders.status,order.status),eq(orders.version,order.version)));
      await this.record(tx,created!,"CREATE",{userId},null,metadata);
      const view=await this.view(tx,created!);
      await this.idempotency.complete(tx,reservation.id,{statusCode:201,body:view,resourceType:"REFUND",resourceId:id});
      return view;
    });
  }

  async get(actor:CaseActor,id:string) {
    const [row]=await this.database.db.select().from(afterSaleCases).where(eq(afterSaleCases.id,id));
    if(!row)throw fail("CASE_NOT_FOUND","案件不存在",404);
    const [order]=await this.database.db.select().from(orders).where(eq(orders.id,row.orderId));
    this.authorize(actor,order!);
    return this.view(this.database.db,row,actor);
  }

  async history(actor:CaseActor,id:string,afterVersion=-1){
    await this.get(actor,id);
    const rows=await this.database.db.select().from(afterSaleCaseEvents).where(and(eq(afterSaleCaseEvents.caseId,id),gt(afterSaleCaseEvents.version,afterVersion))).orderBy(asc(afterSaleCaseEvents.version)).limit(101);
    const items=rows.slice(0,100).map(row=>({version:row.version,action:row.action,data:row.data,created_at:row.createdAt}));
    return {items,next_after_version:rows.length>100?items.at(-1)!.version:null};
  }

  async list(actor:CaseActor,input:{afterId?:string;limit:number;state?:AfterSaleCaseState}){
    const rows=await this.database.db.select({row:afterSaleCases}).from(afterSaleCases).innerJoin(orders,eq(orders.id,afterSaleCases.orderId)).where(and("userId"in actor?or(eq(orders.buyerId,actor.userId),eq(orders.sellerUserId,actor.userId)):undefined,input.afterId?gt(afterSaleCases.id,input.afterId):undefined,input.state?eq(afterSaleCases.state,input.state):undefined)).orderBy(asc(afterSaleCases.id)).limit(input.limit+1);
    const items=rows.slice(0,input.limit).map(({row})=>({id:row.id,order_id:row.orderId,state:row.state,case_type:row.kind,version:row.version,deadline_at:row.deadlineAt,detail_path:`/api/v1/after-sale/cases/${row.id}`}));
    return {items,next_after_id:rows.length>input.limit?items.at(-1)!.id:null};
  }

  async createSpecial(adminId:string,input:{orderId:string;amountCent:bigint;reasonCode:string;reasonText:string;contactAt:Date;fileIds:string[]},key:string,metadata:RequestMetadata){
    return this.database.db.transaction(async tx=>{
      const reservation=await this.idempotency.reserve(tx,{scope:`case:special:${adminId}`,key,request:input,expiresAt:new Date(Date.now()+86400000)});
      if(reservation.replay?.body)return reservation.replay.body;
      const [order]=await tx.select().from(orders).where(eq(orders.id,input.orderId)).for("update");
      if(!order)throw fail("ORDER_NOT_FOUND","订单不存在",404);
      if(order.ruleVersion!=="V3.1"||order.fulfillmentSecondsSnapshot===null||!order.completedAt||!["COMPLETED","REFUNDED"].includes(order.status))throw fail("CASE_SPECIAL_INELIGIBLE","特殊受理仅用于新规则已首次终结交易");
      const now=new Date();
      if(!Number.isFinite(input.contactAt.getTime())||input.contactAt<order.completedAt||input.contactAt>now||input.contactAt.getTime()>order.completedAt.getTime()+604800000)throw fail("CASE_SPECIAL_CONTACT_EXPIRED","须核验首次终结后七天内首次明确联系平台的证据");
      const active=await tx.select({id:refunds.id}).from(refunds).where(and(eq(refunds.orderId,order.id),inArray(refunds.status,["REQUESTED","SELLER_APPROVED","SELLER_REJECTED","NEGOTIATING","PLATFORM_REVIEW","REFUND_PROCESSING"])));
      if(order.afterSaleStatus==="IN_PROGRESS"||active.length)throw fail("REFUND_ACTIVE_EXISTS","已有未结束售后");
      validAmount(input.amountCent,order);
      const [payment]=await tx.select().from(payments).where(and(eq(payments.orderId,order.id),inArray(payments.status,["PAID","PARTIALLY_REFUNDED"]))).for("update");if(!payment)throw fail("REFUND_PAYMENT_UNAVAILABLE","无可退款支付");
      const id=uuidv7();
      const data:AfterSaleCaseData={original_status:order.status,paused_at:now.toISOString(),original_fulfillment_due_at:order.fulfillmentDueAt?.toISOString()??null,receipt_remaining_ms:null,modifications:0,negotiation_rounds:0,platform_entered:true,review_level:0,review_phase:"MATERIALS",offer:null,evidence_file_ids:input.fileIds,special_contact_at:input.contactAt.toISOString(),special_contact_evidence_ids:input.fileIds};
      await tx.insert(refunds).values({id,refundNo:`RF${randomUUID().replaceAll("-","")}`,orderId:order.id,paymentId:payment.id,applicantId:order.buyerId,requestedAmountCent:input.amountCent,reasonCode:input.reasonCode,reasonText:input.reasonText,status:"PLATFORM_REVIEW",assignedAdminId:adminId,escalatedAt:now});
      await tx.insert(afterSaleCases).values({id,orderId:order.id,state:"P01",kind:"SPECIAL",deadlineAt:after(now,86400),data:json(data)});
      await this.bindEvidence(tx,id,order.buyerId,input.fileIds);
      data.funding=await this.funds.reserve(tx,id,order,input.amountCent,metadata.traceId);data.funding_updated_at=now.toISOString();
      // Initial state is already versioned; persist funding through the same CAS path.
      const [created]=await tx.update(afterSaleCases).set({data:json(data),version:1}).where(and(eq(afterSaleCases.id,id),eq(afterSaleCases.state,"P01"),eq(afterSaleCases.version,0))).returning();
      await tx.update(orders).set({afterSaleStatus:"IN_PROGRESS",version:order.version+1,updatedAt:now}).where(and(eq(orders.id,order.id),eq(orders.status,order.status),eq(orders.version,order.version)));
      await this.record(tx,created!,"SPECIAL_INTAKE",{adminId,supervisor:false},null,metadata,input.reasonText);
      const result=await this.view(tx,created!);await this.idempotency.complete(tx,reservation.id,{statusCode:201,body:result,resourceType:"REFUND",resourceId:id});return result;
    });
  }

  async act(actor:CaseActor,id:string,version:number,command:CaseAction,metadata:RequestMetadata,now=new Date(),key?:string) {
    return this.database.db.transaction(async tx=>{
      const reservation=key?await this.idempotency.reserve(tx,{scope:`case:action:${"userId"in actor?actor.userId:actor.adminId}`,key,request:{case_id:id,version,command},expiresAt:new Date(now.getTime()+86400000)}):undefined;
      if(reservation?.replay?.body)return reservation.replay.body;
      const locked=await this.lock(tx,id);this.authorize(actor,locked.order);
      if(locked.row.version!==version)throw fail("RESOURCE_VERSION_CONFLICT","案件已更新，请重新读取");
      if(!["TIMEOUT","DECIDE","MATERIALS_COMPLETE","CONFIRM_REMEDY","RECHECK_FUNDING","ADD_EVIDENCE","MARK_EVIDENCE_SHAREABLE"].includes(command.action)&&locked.row.deadlineAt&&locked.row.deadlineAt<=now)throw fail("CASE_DEADLINE_EXPIRED","当前阶段已到期，请等待后台处理后重新读取");
      const result=await this.transition(tx,locked,actor,command,metadata,now);
      if(reservation)await this.idempotency.complete(tx,reservation.id,{statusCode:201,body:result,resourceType:"REFUND",resourceId:id});
      return result;
    });
  }

  async timeout(id:string,payload:{case_version?:unknown;deadline_at?:unknown;reminder_hours?:unknown},now=new Date()) {
    return this.database.db.transaction(async tx=>{
      const locked=await this.lock(tx,id);
      if(locked.row.version!==payload.case_version||locked.row.deadlineAt?.toISOString()!==payload.deadline_at||!locked.row.deadlineAt)return false;
      if(payload.reminder_hours!==undefined){
        if(locked.row.state!=="R02"||![24,2].includes(Number(payload.reminder_hours))||locked.row.deadlineAt<=now||now.getTime()<locked.row.deadlineAt.getTime()-Number(payload.reminder_hours)*3600000)return false;
        const inserted=await tx.insert(notifications).values({id:uuidv7(),userId:locked.order.buyerId,category:"ORDER",notificationType:"AFTER_SALE_REMEDY_REMINDER",title:"补充履约验收即将到期",contentTemplateId:"after_sale_remedy_reminder",contentVariablesJson:{case_id:id,order_id:locked.order.id,deadline_at:payload.deadline_at,hours:payload.reminder_hours},relatedType:"REFUND",relatedId:id,idempotencyKey:`case:${id}:v${locked.row.version}:reminder:${payload.reminder_hours}`}).onConflictDoNothing().returning({id:notifications.id});return inserted.length>0;
      }
      if(locked.row.deadlineAt>now)return false;
      if(locked.row.state==="R02"&&locked.order.evidenceReviewPending){
        // A pending review is not a failed job or permission to settle. Keep the
        // original deadline; schedule a fenced recheck rather than exhaust retries.
        const runAt=new Date((Math.floor(now.getTime()/60000)+1)*60000);
        await this.jobs.schedule(tx,{jobKey:`case:${id}:v${locked.row.version}:review-recheck:${runAt.getTime()}`,jobType:AFTER_SALE_CASE_DEADLINE,targetType:"REFUND",targetId:id,runAt,payload:{case_version:locked.row.version,deadline_at:locked.row.deadlineAt.toISOString()}});
        return false;
      }
      await this.transition(tx,locked,null,{action:"TIMEOUT"},{ip:"127.0.0.1",userAgent:"case-scheduler",requestId:`case:${id}:v${locked.row.version}`},now);
      return true;
    });
  }

  async synchronizeRefund(tx:DatabaseTransaction,id:string,state:"F01"|"F02"|"EXECUTION_PENDING",metadata:RequestMetadata){
    const [row]=await tx.select().from(afterSaleCases).where(eq(afterSaleCases.id,id)).for("update");
    if(!row||row.state===state)return;
    if(!["EXECUTION_PENDING","F01"].includes(row.state))throw fail("CASE_STATE_INVALID","案件尚未进入退款执行阶段");
    const data=structuredClone(row.data) as unknown as AfterSaleCaseData;
    if(state==="F02"&&data.funding){data.funding={...data.funding,held_cent:"0",commission_reserved_cent:"0",funding_gap_cent:"0"};data.funding_updated_at=new Date().toISOString();}
    const [updated]=await tx.update(afterSaleCases).set({state,data:json(data),deadlineAt:null,version:row.version+1,updatedAt:new Date()}).where(and(eq(afterSaleCases.id,id),eq(afterSaleCases.state,row.state),eq(afterSaleCases.version,row.version))).returning();
    if(!updated)throw fail("RESOURCE_VERSION_CONFLICT","案件已更新");await this.record(tx,updated,"CHANNEL_RESULT",null,row.state,metadata);
  }

  private async transition(tx:DatabaseTransaction,locked:{row:CaseRow;order:OrderRow;refund:RefundRow},actor:CaseActor|null,command:CaseAction,metadata:RequestMetadata,now:Date) {
    const {row,order}=locked;let refund=locked.refund;
    const data=structuredClone(row.data) as unknown as AfterSaleCaseData;
    let state=row.state as AfterSaleCaseState,kind=row.kind,deadline=row.deadlineAt;
    const userId=actor&&"userId" in actor?actor.userId:null;
    const buyer=userId===order.buyerId,seller=userId===order.sellerUserId;
    const requireState=(states:readonly string[])=>{if(!states.includes(state))throw fail("CASE_STATE_INVALID","当前阶段不允许此操作");};
    const platform=()=>{state="P01";data.platform_entered=true;data.offer=null;data.review_phase="MATERIALS";data.review_extension_used=false;deadline=after(now,rules.responseSeconds);};
    const approve=async(amount:bigint)=>{
      validAmount(amount,order);state="EXECUTION_PENDING";deadline=null;data.offer=null;
      if(kind==="SPECIAL"){
        data.execution_amount_cent=amount.toString();
        if(!data.award_effective){await this.funds.release(tx,row.id,metadata.traceId);data.award_effective=true;}
        data.funding=await this.funds.reserve(tx,row.id,order,amount,metadata.traceId);data.funding_updated_at=now.toISOString();
        if(BigInt(data.funding.funding_gap_cent)>0n){deadline=after(now,86400);return;}
      }
      await this.bridge.approve(tx,refund,order,amount,metadata);
    };
    const closeSpecial=async()=>{
      await this.funds.release(tx,row.id,metadata.traceId);state="F06";deadline=null;data.offer=null;
      if(data.funding)data.funding={...data.funding,held_cent:"0",commission_reserved_cent:"0",funding_gap_cent:"0"};
      await tx.update(refunds).set({status:"REJECTED",version:refund.version+1,updatedAt:now}).where(and(eq(refunds.id,refund.id),eq(refunds.status,refund.status),eq(refunds.version,refund.version)));
      await tx.update(orders).set({afterSaleStatus:"RESOLVED",version:order.version+1,updatedAt:now}).where(and(eq(orders.id,order.id),eq(orders.status,order.status),eq(orders.version,order.version)));
      await new FinanceLedgerEngine(this.database.db).resumePendingIncome(tx,order.id,`case:${row.id}:close`);
    };
    const restore=async()=>{state="S04";deadline=null;data.offer=null;await this.restoreOrder(tx,order,data,now);await tx.update(refunds).set({status:"CANCELLED",version:refund.version+1,updatedAt:now}).where(and(eq(refunds.id,refund.id),eq(refunds.status,refund.status),eq(refunds.version,refund.version)));};
    const closeRemedy=async()=>{if(order.evidenceReviewPending)throw fail("ORDER_EVIDENCE_REVIEW_PENDING","凭证核查尚未完成");await this.bridge.completeRemedy(tx,order,metadata);state="REMEDY_COMPLETED";deadline=null;await tx.update(refunds).set({status:"CANCELLED",version:refund.version+1,updatedAt:now}).where(and(eq(refunds.id,refund.id),eq(refunds.status,refund.status),eq(refunds.version,refund.version)));};
    const executeDecision=async()=>{
      if(!data.decision)throw fail("CASE_DECISION_REQUIRED","缺少裁决版本");
      if(data.decision.outcome==="REFUND"){
        await approve(parseCent(data.decision.amount_cent));
      }else if(kind==="REMEDY"){state="R02";deadline=new Date(now.getTime()+Math.max(data.remedy_remaining_ms??0,86400000));data.offer=null;}
      else if(kind==="SPECIAL")await closeSpecial();
      else await restore();
    };
    switch(command.action){
      case "RETRY_REFUND": {
        if(!actor||!("adminId"in actor))throw fail("CASE_ROLE_FORBIDDEN","须授权人员确认明确失败后重试",403);requireState(["EXECUTION_PENDING"]);
        const [operation]=await tx.select().from(financialTransferOperations).where(eq(financialTransferOperations.refundId,row.id)).orderBy(desc(financialTransferOperations.createdAt),desc(financialTransferOperations.id)).limit(1);
        if(!operation||operation.status!=="FAILED"||refund.status!=="PLATFORM_REVIEW"||!refund.approvedAmountCent)throw fail("CASE_REFUND_RETRY_UNSAFE","只有明确失败的原退款可重试；未知结果必须续查原执行意图");
        await approve(refund.approvedAmountCent);break;
      }
      case "MARK_EVIDENCE_SHAREABLE":
        if(!actor||!("adminId"in actor))throw fail("CASE_ROLE_FORBIDDEN","须平台确认材料已经遮挡敏感信息",403);
        if(!command.fileIds.length||command.fileIds.some(id=>!data.evidence_file_ids.includes(id)))throw fail("CASE_EVIDENCE_INVALID","只能确认本案已经保全的材料");
        data.counterparty_visible_evidence_ids=[...new Set([...(data.counterparty_visible_evidence_ids??[]),...command.fileIds])];break;
      case "RECHECK_FUNDING":
        if(!actor||!("adminId"in actor))throw fail("CASE_ROLE_FORBIDDEN","仅授权财务人员可复查资金",403);
        requireState(["EXECUTION_PENDING"]);if(kind!=="SPECIAL"||!data.award_effective||!data.execution_amount_cent)throw fail("CASE_STATE_INVALID","不是待执行特殊结论");
        if(refund.status==="SELLER_APPROVED"||refund.status==="REFUND_PROCESSING")throw fail("CASE_CHANNEL_ALREADY_PREPARED","已经生成渠道执行意图，请使用原退款恢复流程");
        await approve(parseCent(data.execution_amount_cent));break;
      case "CLOSE_SPECIAL":
        if(!actor||!("adminId"in actor))throw fail("CASE_ROLE_FORBIDDEN","仅授权客服可核验撤回",403);
        requireState(["P01","P02","P03","P04"]);if(kind!=="SPECIAL"||data.award_effective)throw fail("CASE_STATE_INVALID","存在生效裁决或不是特殊案件");
        await closeSpecial();break;
      case "ADD_EVIDENCE":
        requireState(["S01","S02","S03","S05","R01","R02","P01","P02","P03","P04"]);
        if(!userId)throw fail("CASE_ROLE_FORBIDDEN","此入口只接收交易双方的材料",403);
        if(data.evidence_file_ids.length+command.fileIds.length>30)throw fail("CASE_EVIDENCE_LIMIT","本地测试案件证据最多30个文件");
        await this.bindEvidence(tx,row.id,userId,command.fileIds);data.evidence_file_ids=[...new Set([...data.evidence_file_ids,...command.fileIds])];break;
      case "MODIFY": {
        if(!buyer||data.platform_entered)throw fail("CASE_MODIFY_FORBIDDEN","介入后或非买家不能修改申请");requireState(["S01","S02","S03","S05"]);
        if(data.modifications>=rules.modificationLimit)throw fail("CASE_MODIFICATION_LIMIT","每案最多修改两次");validAmount(command.amountCent,order);
        const [changed]=await tx.update(refunds).set({requestedAmountCent:command.amountCent,reasonCode:command.reasonCode,reasonText:command.reasonText,status:"REQUESTED",version:refund.version+1,updatedAt:now}).where(and(eq(refunds.id,refund.id),eq(refunds.status,refund.status),eq(refunds.version,refund.version))).returning();
        if(!changed)throw fail("RESOURCE_VERSION_CONFLICT","退款已更新");refund=changed;
        data.modifications++;data.offer=null;state="S01";deadline=after(now,rules.responseSeconds);break;
      }
      case "WITHDRAW":
        if(!buyer||data.platform_entered)throw fail("CASE_WITHDRAW_FORBIDDEN","当前不能自行撤销");requireState(["S01","S02","S03","S05"]);await restore();break;
      case "APPROVE":
        if(!seller)throw fail("CASE_ROLE_FORBIDDEN","仅商家可以同意申请",403);requireState(["S01","S05"]);await approve(refund.requestedAmountCent);break;
      case "REJECT":
        if(!seller)throw fail("CASE_ROLE_FORBIDDEN","仅商家可以驳回申请",403);requireState(["S01"]);
        await this.bindEvidence(tx,row.id,userId!,command.fileIds);data.evidence_file_ids.push(...command.fileIds);state="S03";deadline=after(now,rules.rejectionSeconds);break;
      case "ESCALATE":
        requireState(["S01","S02","S03","S05","R01","R02"]);
        if(!buyer&&!seller)throw fail("CASE_ROLE_FORBIDDEN","仅交易双方可使用此入口",403);
        if(seller&&!data.evidence_file_ids.length)throw fail("CASE_EVIDENCE_REQUIRED","卖家申请介入前须提交争议说明和相关证据");
        if(state==="R02")data.remedy_remaining_ms=Math.max(0,(deadline?.getTime()??now.getTime())-now.getTime());platform();break;
      case "OFFER": {
        requireState(["S01","S05","P01","P03","P04"]);
        if(kind==="SPECIAL"&&command.offer.kind!=="REFUND")throw fail("CASE_SPECIAL_REMEDY_UNAVAILABLE","终结后特殊案件不能通过普通补充履约重开原交易");
        if(!userId||(!data.platform_entered&&!seller))throw fail("CASE_ROLE_FORBIDDEN","当前无提案权限",403);
        if(data.offer&&new Date(data.offer.expires_at)>now)throw fail("CASE_OFFER_ACTIVE","已有待回应方案");
        if(!data.platform_entered&&data.negotiation_rounds>=rules.negotiationLimit)throw fail("CASE_NEGOTIATION_LIMIT","介入前最多两轮方案");
        const offered=command.offer;
        if(offered.kind==="REFUND"){
          const amount=parseCent(offered.amount_cent),retained=parseCent(offered.retained_amount_cent);validAmount(amount,order);
          if(amount+retained!==order.paidAmountCent-order.refundedAmountCent||!offered.recognized_delivery?.trim()||offered.remaining_obligations_terminated!==true)throw fail("CASE_REFUND_OFFER_INVALID","须明确退款、保留金额、认可交付及终止剩余义务");
        }else if(!offered.content?.trim()||!offered.quantity?.trim()||!offered.standard?.trim()||!Number.isInteger(offered.fulfillment_seconds)||offered.fulfillment_seconds!<1||offered.fulfillment_seconds!>rules.remedyMaximumSeconds)throw fail("CASE_REMEDY_OFFER_INVALID","补充履约须有内容、数量、标准及七天内期限");
        data.offer={...offered,id:uuidv7(),proposer_id:userId,expires_at:after(now,rules.responseSeconds).toISOString()};
        if(!data.platform_entered){data.negotiation_rounds++;state="S02";deadline=new Date(data.offer.expires_at);}break;
      }
      case "RESPOND": {
        requireState(["S02","P01","P03","P04"]);const offer=data.offer;
        if(!offer||offer.id!==command.offerId||new Date(offer.expires_at)<=now)throw fail("CASE_OFFER_EXPIRED","方案不存在或已过期");
        if(!userId||userId===offer.proposer_id)throw fail("CASE_ROLE_FORBIDDEN","只有对方可以回应方案",403);
        if(command.accept){
          if(offer.kind==="REFUND")await approve(parseCent(offer.amount_cent));
          else {state="R01";kind="REMEDY";deadline=after(now,offer.fulfillment_seconds!);data.offer=null;}
        }else {data.offer=null;if(!data.platform_entered){if(data.negotiation_rounds>=rules.negotiationLimit)platform();else{state="S05";deadline=after(now,rules.responseSeconds);}}}break;
      }
      case "SUBMIT_REMEDY":
      case "APPEND_REMEDY": {
        if(!seller)throw fail("CASE_ROLE_FORBIDDEN","仅商家可以提交补充履约凭证",403);
        requireState(command.action==="SUBMIT_REMEDY"?["R01"]:["R02"]);
        const ids=[...new Set([...(data.remedy_evidence_file_ids??[]),...command.fileIds])];
        if(!command.fileIds.length||new Set(command.fileIds).size!==command.fileIds.length)throw fail("ORDER_EVIDENCE_INVALID","凭证不能为空或重复");
        await this.bridge.validateRemedy(tx,order,ids);
        data.remedy_evidence_file_ids=ids;
        if(command.action==="SUBMIT_REMEDY"){state="R02";deadline=after(now,rules.receiptSeconds);}break;
      }
      case "CONFIRM_REMEDY":
        if(!buyer)throw fail("CASE_ROLE_FORBIDDEN","仅买家可以验收补充履约",403);requireState(["R02"]);await closeRemedy();break;
      case "EXTEND_REMEDY": {
        if(!buyer)throw fail("CASE_ROLE_FORBIDDEN","仅买家可以延期",403);requireState(["R02"]);
        if(order.receiptExtensionUsed)throw fail("ORDER_EXTENSION_EXHAUSTED","每单共享一次24小时延期");
        if(!deadline)throw fail("CASE_STATE_INVALID","缺少验收时限");
        const changed=await tx.update(orders).set({receiptExtensionUsed:true,version:order.version+1,updatedAt:now}).where(and(eq(orders.id,order.id),eq(orders.status,order.status),eq(orders.version,order.version))).returning({id:orders.id});
        if(!changed.length)throw fail("RESOURCE_VERSION_CONFLICT","订单已更新");deadline=after(deadline,86400);break;
      }
      case "MATERIALS_COMPLETE":
        if(!actor||!("adminId"in actor))throw fail("CASE_ROLE_FORBIDDEN","须平台确认材料齐全",403);requireState(["P01","P03","P04"]);
        if(data.review_phase!=="MATERIALS")throw fail("CASE_STATE_INVALID","已经进入审核");data.review_phase="REVIEW";deadline=after(deadline&&deadline<now?deadline:now,86400);break;
      case "EXTEND_MATERIALS":
        if(!actor||!("adminId"in actor)||!actor.supervisor)throw fail("CASE_SUPERVISOR_REQUIRED","须主管批准补证延期",403);requireState(["P01","P03","P04"]);
        if(data.review_phase!=="MATERIALS"||data.review_extension_used||!deadline||!Number.isInteger(command.seconds)||command.seconds<1||command.seconds>86400)throw fail("CASE_EXTENSION_INVALID","每级补证仅可延长一次且最多24小时");
        data.review_extension_used=true;deadline=after(deadline,command.seconds);break;
      case "DECIDE": {
        if(!actor||!("adminId"in actor))throw fail("CASE_ROLE_FORBIDDEN","须平台审核人员",403);requireState(["P01","P03","P04"]);
        if(data.review_phase!=="REVIEW")throw fail("CASE_MATERIALS_PENDING","请先确认补证阶段已结束");
        if(data.review_level===1&&actor.adminId===data.initial_reviewer_id)throw fail("CASE_REVIEWER_SEPARATION","复核人与初判人必须分离",403);
        const amount=parseCent(command.decision.amount_cent);
        if((data.review_level===2||amount>10000n)&&!actor.supervisor)throw fail("CASE_SUPERVISOR_REQUIRED","二级复核或累计批准超过100元须主管权限",403);
        if(command.decision.outcome==="REFUND"){validAmount(amount,order);if(amount>refund.requestedAmountCent)throw fail("REFUND_AMOUNT_EXCEEDS_REMAINING","裁决不得超过当前申请金额");}
        else if(amount!==0n)throw fail("CASE_AMOUNT_INVALID","不支持退款金额必须为零");
        for(const value of [command.decision.facts,command.decision.rule_basis,command.decision.liability,command.decision.reason,command.decision.remaining_obligations,command.decision.execution_conditions])if(!value.trim())throw fail("CASE_DECISION_INVALID","须完整保存事实、规则、责任、理由、义务及执行条件");
        if(command.decision.evidence_file_ids.some(id=>!data.evidence_file_ids.includes(id)&&!data.remedy_evidence_file_ids?.includes(id)))throw fail("CASE_EVIDENCE_INVALID","裁决只能引用本案已保全证据");
        data.decision={...command.decision,id:uuidv7(),level:data.review_level,reviewer_id:actor.adminId,issued_at:now.toISOString(),appeal_deadline_at:data.review_level===2?null:after(now,86400).toISOString()};
        data.offer=null;
        if(data.review_level===0)data.initial_reviewer_id=actor.adminId;
        data.accepted_by=[];data.appealed_by=[];
        if(data.review_level===2)await executeDecision();else{state="P02";deadline=after(now,86400);}break;
      }
      case "ACCEPT_DECISION": {
        requireState(["P02"]);if(!userId||command.decisionId!==data.decision?.id)throw fail("CASE_DECISION_STALE","请针对当前裁决版本回应");
        data.accepted_by=[...new Set([...(data.accepted_by??[]),userId])];
        if(data.accepted_by.includes(order.buyerId)&&data.accepted_by.includes(order.sellerUserId))await executeDecision();break;
      }
      case "APPEAL": {
        requireState(["P02","P03","P04"]);
        if(!userId||!data.decision||data.decision.id!==command.decisionId||!data.decision.appeal_deadline_at||new Date(data.decision.appeal_deadline_at)<=now)throw fail("CASE_DECISION_STALE","裁决不存在、已失效或申诉期限已结束");
        const level=data.decision.level+1;if(level>2)throw fail("CASE_APPEAL_LIMIT","最多两级平台申诉");
        if(level===2&&(!command.fileIds.length||command.fileIds.some(id=>data.evidence_file_ids.includes(id)||data.remedy_evidence_file_ids?.includes(id))))throw fail("CASE_NEW_EVIDENCE_REQUIRED","第二级申诉必须提交新证据");
        if(command.fileIds.length){await this.bindEvidence(tx,row.id,userId,command.fileIds);data.evidence_file_ids.push(...command.fileIds);}
        data.appealed_by=[...new Set([...(data.appealed_by??[]),userId])];
        if(state==="P02"){data.offer=null;data.review_level=level;state=level===1?"P03":"P04";data.review_phase="MATERIALS";data.review_extension_used=false;deadline=after(now,86400);}break;
      }
      case "TIMEOUT":
        if(actor)throw fail("CASE_ROLE_FORBIDDEN","到期仅由调度器执行",403);
        requireState(["S01","S02","S03","S05","R01","R02","P01","P02","P03","P04","EXECUTION_PENDING"]);
        if(state==="S01")await approve(refund.requestedAmountCent);
        else if(state==="EXECUTION_PENDING"){
          if(kind!=="SPECIAL"||!data.award_effective||!data.execution_amount_cent)throw fail("CASE_STATE_INVALID","缺少生效的待执行结论");
          await approve(parseCent(data.execution_amount_cent));
          await this.outbox.enqueue(tx,{aggregateType:"REFUND",aggregateId:row.id,eventType:"AfterSaleFundingProgress",payload:{case_id:row.id,requires_finance_followup:BigInt(data.funding?.funding_gap_cent??"0")>0n},traceId:metadata.traceId});
        }
        else if(state==="S03")await restore();
        else if(state==="R02")await closeRemedy();
        else if(state==="P02")await executeDecision();
        else if(["P01","P03","P04"].includes(state)){
          if(data.review_phase==="MATERIALS"){data.review_phase="REVIEW";deadline=after(deadline??now,86400);}
          else {deadline=null;await this.outbox.enqueue(tx,{aggregateType:"REFUND",aggregateId:row.id,eventType:"AfterSaleReviewOverdue",payload:{case_id:row.id,review_level:data.review_level},traceId:metadata.traceId});}
        }
        else if(state==="S02"&&data.negotiation_rounds<rules.negotiationLimit){state="S05";data.offer=null;deadline=after(now,rules.responseSeconds);}
        else platform();break;
    }
    const [updated]=await tx.update(afterSaleCases).set({state,kind,deadlineAt:deadline,data:json(data),version:row.version+1,updatedAt:now}).where(and(eq(afterSaleCases.id,row.id),eq(afterSaleCases.state,row.state),eq(afterSaleCases.version,row.version))).returning();
    if(!updated)throw fail("RESOURCE_VERSION_CONFLICT","案件已更新");
    await this.record(tx,updated,command.action,actor,row.state,metadata,"reason"in command?command.reason:command.action==="DECIDE"?command.decision.reason:undefined,toApiJson(command) as Record<string,unknown>);
    return this.view(tx,updated,actor??undefined);
  }

  private async restoreOrder(tx:DatabaseTransaction,order:OrderRow,data:AfterSaleCaseData,now:Date){
    const confirm=data.original_status==="PENDING_BUYER_CONFIRM"?new Date(now.getTime()+Math.max(data.receipt_remaining_ms??0,86400000)):null;
    const due=data.original_fulfillment_due_at?new Date(new Date(data.original_fulfillment_due_at).getTime()+Math.max(0,now.getTime()-new Date(data.paused_at).getTime())):null;
    const [updated]=await tx.update(orders).set({afterSaleStatus:"RESOLVED",...(confirm?{autoConfirmAt:confirm}:{}),...(due?{fulfillmentDueAt:due}:{}),version:order.version+1,updatedAt:now}).where(and(eq(orders.id,order.id),eq(orders.status,order.status),eq(orders.version,order.version))).returning();
    if(!updated)throw fail("RESOURCE_VERSION_CONFLICT","订单已更新");
    if(confirm){await this.jobs.schedule(tx,{jobKey:`case:${order.id}:restore-confirm:${updated.version}`,jobType:ORDER_JOB_TYPES.AUTO_CONFIRM,targetType:"ORDER",targetId:order.id,payload:{order_version:updated.version,deadline_at:confirm.toISOString()},runAt:confirm});
      for(const hours of [24,2]){const runAt=new Date(confirm.getTime()-hours*3600000);if(runAt>now)await this.jobs.schedule(tx,{jobKey:`case:${order.id}:reminder:${updated.version}:${hours}`,jobType:ORDER_JOB_TYPES.RECEIPT_REMINDER,targetType:"ORDER",targetId:order.id,payload:{order_version:updated.version,deadline_at:confirm.toISOString(),hours},runAt});}}
    if(due&&["PENDING_SERVICE","IN_SERVICE"].includes(order.status))await this.jobs.schedule(tx,{jobKey:`case:${order.id}:restore-due:${updated.version}`,jobType:ORDER_JOB_TYPES.FULFILLMENT_DUE,targetType:"ORDER",targetId:order.id,payload:{deadline_at:due.toISOString()},runAt:due>now?due:now});
  }

  private async bindEvidence(tx:DatabaseTransaction,id:string,userId:string,ids:string[]){
    if(!ids.length||ids.length>30||new Set(ids).size!==ids.length)throw fail("CASE_EVIDENCE_REQUIRED","必须提供不重复的相关已审核证据");
    const existing=await tx.select({id:fileUsages.fileId}).from(fileUsages).where(and(eq(fileUsages.targetType,"REFUND"),eq(fileUsages.targetId,id),eq(fileUsages.usageType,"EVIDENCE"),isNull(fileUsages.deletedAt)));
    if(new Set([...existing.map(row=>row.id),...ids]).size>30)throw fail("CASE_EVIDENCE_LIMIT","本地测试案件累计证据最多30个文件");
    const rows=await tx.select().from(files).where(and(inArray(files.id,ids),eq(files.ownerUserId,userId),isNull(files.deletedAt))).orderBy(asc(files.id)).for("update");
    if(rows.length!==ids.length||rows.some(file=>file.fileType!=="COMPLAINT_EVIDENCE"||file.visibility!=="PRIVATE"||file.uploadStatus!=="VERIFIED"||file.moderationStatus!=="APPROVED"))throw fail("CASE_EVIDENCE_INVALID","证据用途、归属或审核不满足要求");
    for(const fileId of ids)await tx.insert(fileUsages).values({id:uuidv7(),fileId,targetType:"REFUND",targetId:id,usageType:"EVIDENCE"}).onConflictDoNothing();
  }

  private async lock(tx:DatabaseTransaction,id:string){
    const [lookup]=await tx.select({orderId:afterSaleCases.orderId}).from(afterSaleCases).where(eq(afterSaleCases.id,id));if(!lookup)throw fail("CASE_NOT_FOUND","案件不存在",404);
    const [order]=await tx.select().from(orders).where(eq(orders.id,lookup.orderId)).for("update");
    const [refund]=await tx.select().from(refunds).where(eq(refunds.id,id)).for("update");
    const [row]=await tx.select().from(afterSaleCases).where(eq(afterSaleCases.id,id)).for("update");
    if(!order||!refund||!row)throw fail("CASE_NOT_FOUND","案件不存在",404);return {row,order,refund};
  }
  private authorize(actor:CaseActor,order:OrderRow){if("userId"in actor&&actor.userId!==order.buyerId&&actor.userId!==order.sellerUserId)throw fail("CASE_NOT_FOUND","案件不存在",404);}
  private async record(tx:DatabaseTransaction,row:CaseRow,action:string,actor:CaseActor|null,from:string|null,metadata:RequestMetadata,reason?:string,command?:Record<string,unknown>){
    await tx.insert(afterSaleCaseEvents).values({id:uuidv7(),caseId:row.id,version:row.version,action,actorUserId:actor&&"userId"in actor?actor.userId:null,actorAdminId:actor&&"adminId"in actor?actor.adminId:null,data:{from,to:row.state,deadline_at:row.deadlineAt?.toISOString()??null,case_data:row.data,...(reason?{reason}:{}),...(command?{command}:{})}});
    if(actor&&"adminId"in actor)await tx.insert(adminOperationLogs).values({id:uuidv7(),adminId:actor.adminId,action:`AFTER_SALE_${action}`,targetType:"REFUND",targetId:row.id,reason:reason??"案件材料阶段处理",beforeJson:{state:from,version:row.version-1},afterJson:{state:row.state,version:row.version},ip:metadata.ip,userAgent:metadata.userAgent,requestId:metadata.requestId});
    await this.outbox.enqueue(tx,{aggregateType:"REFUND",aggregateId:row.id,eventType:"AfterSaleCaseChanged",payload:{case_id:row.id,order_id:row.orderId,version:row.version,state:row.state,action},traceId:metadata.traceId});
    const [order]=await tx.select({buyer:orders.buyerId,seller:orders.sellerUserId}).from(orders).where(eq(orders.id,row.orderId));
    if(order)for(const userId of [order.buyer,order.seller])await tx.insert(notifications).values({id:uuidv7(),userId,category:"ORDER",notificationType:"AFTER_SALE_CASE_CHANGED",title:"售后案件进度更新",contentTemplateId:"after_sale_case_changed",contentVariablesJson:{case_id:row.id,order_id:row.orderId,state:row.state,action,deadline_at:row.deadlineAt?.toISOString()??null},relatedType:"REFUND",relatedId:row.id,idempotencyKey:`case:${row.id}:v${row.version}:${userId}`}).onConflictDoNothing();
    if(row.deadlineAt)await this.jobs.schedule(tx,{jobKey:`case:${row.id}:v${row.version}:deadline`,jobType:AFTER_SALE_CASE_DEADLINE,targetType:"REFUND",targetId:row.id,runAt:row.deadlineAt,payload:{case_version:row.version,deadline_at:row.deadlineAt.toISOString()}});
    if(row.state==="R02"&&row.deadlineAt)for(const hours of [24,2]){const runAt=new Date(row.deadlineAt.getTime()-hours*3600000);if(runAt>new Date())await this.jobs.schedule(tx,{jobKey:`case:${row.id}:v${row.version}:reminder:${hours}`,jobType:AFTER_SALE_CASE_DEADLINE,targetType:"REFUND",targetId:row.id,runAt,payload:{case_version:row.version,deadline_at:row.deadlineAt.toISOString(),reminder_hours:hours}});}
  }
  private async view(tx:DatabaseTransaction|DatabaseClient["db"],row:CaseRow,actor?:CaseActor){
    const [refund]=await tx.select().from(refunds).where(eq(refunds.id,row.id));const [order]=await tx.select().from(orders).where(eq(orders.id,row.orderId));
    const actions=caseActions(row,order!,actor);
    if(actor&&"adminId"in actor&&row.state==="EXECUTION_PENDING"&&refund?.status==="PLATFORM_REVIEW"){
      const [operation]=await tx.select({status:financialTransferOperations.status}).from(financialTransferOperations).where(eq(financialTransferOperations.refundId,row.id)).orderBy(desc(financialTransferOperations.createdAt),desc(financialTransferOperations.id)).limit(1);if(operation?.status==="FAILED")actions.push("RETRY_REFUND");
    }
    return {id:row.id,order_id:row.orderId,state:row.state,case_type:row.kind,version:row.version,deadline_at:row.deadlineAt,requested_amount_cent:refund!.requestedAmountCent.toString(),...row.data,available_actions:actions};
  }
}

function caseActions(row:CaseRow,order:OrderRow,actor?:CaseActor){
  if(!actor)return [];
  const data=row.data as unknown as AfterSaleCaseData,state=row.state,active=["S01","S02","S03","S05","R01","R02","P01","P02","P03","P04"].includes(state),actions:string[]=[];
  if("adminId"in actor){
    if(data.evidence_file_ids.some(id=>!data.counterparty_visible_evidence_ids?.includes(id)))actions.push("MARK_EVIDENCE_SHAREABLE");
    if(["P01","P03","P04"].includes(state))actions.push(data.review_phase==="MATERIALS"?"MATERIALS_COMPLETE":"DECIDE");
    if(actor.supervisor&&data.review_phase==="MATERIALS"&&!data.review_extension_used)actions.push("EXTEND_MATERIALS");
    if(row.kind==="SPECIAL"&&state==="EXECUTION_PENDING"&&data.award_effective&&BigInt(data.funding?.funding_gap_cent??"0")>0n)actions.push("RECHECK_FUNDING");
    if(row.kind==="SPECIAL"&&active&&!data.award_effective)actions.push("CLOSE_SPECIAL");return actions;
  }
  const buyer=actor.userId===order.buyerId;
  if(active)actions.push("ADD_EVIDENCE");
  if(row.deadlineAt&&row.deadlineAt<=new Date())return actions;
  if(!data.platform_entered&&buyer&&["S01","S02","S03","S05"].includes(state)){actions.push("WITHDRAW");if(data.modifications<2)actions.push("MODIFY");}
  if(["S01","S02","S03","S05","R01","R02"].includes(state))actions.push("ESCALATE");
  if(!buyer&&["S01","S05"].includes(state)){actions.push("APPROVE");if(data.negotiation_rounds<2)actions.push("OFFER");if(state==="S01")actions.push("REJECT");}
  if(["P01","P03","P04"].includes(state))actions.push("OFFER");
  if(data.offer&&data.offer.proposer_id!==actor.userId&&new Date(data.offer.expires_at)>new Date()&&["S02","P01","P03","P04"].includes(state))actions.push("RESPOND");
  if(!buyer&&state==="R01")actions.push("SUBMIT_REMEDY");if(!buyer&&state==="R02")actions.push("APPEND_REMEDY");
  if(buyer&&state==="R02"){if(!order.evidenceReviewPending)actions.push("CONFIRM_REMEDY");if(!order.receiptExtensionUsed)actions.push("EXTEND_REMEDY");}
  if(state==="P02")actions.push("ACCEPT_DECISION","APPEAL");return actions;
}

function after(now:Date,seconds:number){return new Date(now.getTime()+seconds*1000);}
function json(value:AfterSaleCaseData){return value as unknown as Record<string,unknown>;}
function validAmount(amount:bigint,order:OrderRow){if(amount<=0n||amount>order.paidAmountCent-order.refundedAmountCent)throw fail("REFUND_AMOUNT_EXCEEDS_REMAINING","退款金额超出剩余可退金额");}
function parseCent(value:string|undefined){if(!value||!/^\d{1,19}$/u.test(value))throw fail("CASE_AMOUNT_INVALID","金额须为整数分字符串");return BigInt(value);}
function fail(code:ErrorCode,message:string,statusCode=409){return new AppError({code,message,statusCode});}
