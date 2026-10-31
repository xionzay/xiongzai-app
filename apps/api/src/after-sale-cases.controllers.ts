import { Body, Controller, Get, Headers, Param, Post, Query, Req } from "@nestjs/common";
import { z } from "zod";
import type { FastifyRequest } from "fastify";
import { AppError, afterSaleCaseStates } from "@xiongzai/contracts";
import { requestContext } from "@xiongzai/observability";
import { AfterSaleService } from "./after-sale.service.js";
import { RequireMfa, RequirePermissions, type AuthenticatedRequest } from "./auth.guard.js";
import { SessionAuthorizationService } from "./session-authorization.service.js";
import { ZodValidationPipe } from "./http.js";
import type { CaseAction } from "./after-sale-cases.js";

const id=z.uuid(),cent=z.string().regex(/^\d{1,19}$/u),reason=z.string().trim().min(2).max(1000),version=z.number().int().nonnegative(),fileIds=z.array(id).max(30);
const list=z.object({after_id:id.optional(),limit:z.coerce.number().int().min(1).max(100).default(20),state:z.enum(afterSaleCaseStates).optional()}).strict();
const create=z.object({order_id:id,amount_cent:cent,reason_code:z.string().trim().min(2).max(64),reason_text:reason}).strict();
const specialCreate=create.extend({first_platform_contact_at:z.iso.datetime({offset:true}),contact_evidence_file_ids:fileIds.min(1),serious_issue_verified:z.literal(true)}).strict();
const refundOffer=z.object({kind:z.literal("REFUND"),amount_cent:cent,retained_amount_cent:cent,recognized_delivery:reason,remaining_obligations_terminated:z.literal(true)}).strict();
const remedyOffer=z.object({kind:z.literal("REMEDY"),content:reason,quantity:z.string().trim().min(1).max(200),standard:reason,fulfillment_seconds:z.number().int().min(1).max(604800)}).strict();
const userAction=z.discriminatedUnion("action",[
  z.object({action:z.literal("MODIFY"),version,amount_cent:cent,reason_code:z.string().trim().min(2).max(64),reason_text:reason}).strict(),
  ...["WITHDRAW","APPROVE","ESCALATE"].map(action=>z.object({action:z.literal(action),version,reason}).strict()),
  z.object({action:z.literal("REJECT"),version,reason,file_ids:fileIds.min(1)}).strict(),
  z.object({action:z.literal("OFFER"),version,offer:z.discriminatedUnion("kind",[refundOffer,remedyOffer])}).strict(),
  z.object({action:z.literal("RESPOND"),version,offer_id:id,accept:z.boolean()}).strict(),
  z.object({action:z.literal("ADD_EVIDENCE"),version,file_ids:fileIds.min(1)}).strict(),
  ...["SUBMIT_REMEDY","APPEND_REMEDY"].map(action=>z.object({action:z.literal(action),version,file_ids:fileIds.min(1)}).strict()),
  ...["CONFIRM_REMEDY","EXTEND_REMEDY"].map(action=>z.object({action:z.literal(action),version}).strict()),
  z.object({action:z.literal("ACCEPT_DECISION"),version,decision_id:id}).strict(),
  z.object({action:z.literal("APPEAL"),version,decision_id:id,reason,file_ids:fileIds}).strict(),
]);
const adminAction=z.discriminatedUnion("action",[
  z.object({action:z.literal("RECHECK_FUNDING"),version,reason}).strict(),
  z.object({action:z.literal("RETRY_REFUND"),version,reason}).strict(),
  z.object({action:z.literal("CLOSE_SPECIAL"),version,reason}).strict(),
  z.object({action:z.literal("MARK_EVIDENCE_SHAREABLE"),version,reason,file_ids:fileIds.min(1),sensitive_information_obscured:z.literal(true)}).strict(),
  z.object({action:z.literal("MATERIALS_COMPLETE"),version,reason}).strict(),
  z.object({action:z.literal("EXTEND_MATERIALS"),version,reason,seconds:z.number().int().min(1).max(86400)}).strict(),
  z.object({action:z.literal("DECIDE"),version,decision:z.object({outcome:z.enum(["REFUND","NO_REFUND"]),amount_cent:cent,facts:reason,evidence_file_ids:fileIds,rule_basis:reason,liability:reason,reason,remaining_obligations:reason,execution_conditions:reason}).strict()}).strict(),
]);
type Request=FastifyRequest&AuthenticatedRequest;

@Controller("api/v1/after-sale/cases")
export class UserAfterSaleCaseController {
  constructor(private readonly service:AfterSaleService){}
  @Get() list(@Req()request:Request,@Query(new ZodValidationPipe(list))query:z.infer<typeof list>){return this.service.cases.list({userId:principal(request)},{afterId:query.after_id,limit:query.limit,state:query.state});}
  @Post() create(@Req()request:Request,@Headers("idempotency-key")key:string|undefined,@Body(new ZodValidationPipe(create))body:z.infer<typeof create>){return this.service.cases.create(principal(request),{orderId:body.order_id,amountCent:BigInt(body.amount_cent),reasonCode:body.reason_code,reasonText:body.reason_text},requireKey(key),metadata(request));}
  @Get(":caseId") get(@Req()request:Request,@Param("caseId",new ZodValidationPipe(id))caseId:string){return this.service.cases.get({userId:principal(request)},caseId);}
  @Get(":caseId/history") history(@Req()request:Request,@Param("caseId",new ZodValidationPipe(id))caseId:string,@Query("after_version",new ZodValidationPipe(z.coerce.number().int().min(-1).default(-1)))afterVersion:number){return this.service.cases.history({userId:principal(request)},caseId,afterVersion);}
  @Post(":caseId/actions") async act(@Req()request:Request,@Param("caseId",new ZodValidationPipe(id))caseId:string,@Headers("idempotency-key")key:string|undefined,@Body(new ZodValidationPipe(userAction))body:z.infer<typeof userAction>){
    const actor={userId:principal(request)};
    const result=await this.service.cases.act(actor,caseId,body.version,mapAction(body),metadata(request),undefined,requireKey(key));
    await this.service.driveCaseRefund(caseId);
    return {operation_result:result,current_case:await this.service.cases.get(actor,caseId)};
  }
}

@Controller("admin-api/v1/after-sale/cases")
@RequireMfa()
export class AdminAfterSaleCaseController {
  constructor(private readonly service:AfterSaleService,private readonly sessions:SessionAuthorizationService){}
  @Get() @RequirePermissions("refund.read") list(@Req()request:Request,@Query(new ZodValidationPipe(list))query:z.infer<typeof list>){return this.service.cases.list({adminId:principal(request),supervisor:false},{afterId:query.after_id,limit:query.limit,state:query.state});}
  @Post("special") @RequirePermissions("refund.manage") createSpecial(@Req()request:Request,@Headers("idempotency-key")key:string|undefined,@Body(new ZodValidationPipe(specialCreate))body:z.infer<typeof specialCreate>){return this.service.cases.createSpecial(principal(request),{orderId:body.order_id,amountCent:BigInt(body.amount_cent),reasonCode:body.reason_code,reasonText:body.reason_text,contactAt:new Date(body.first_platform_contact_at),fileIds:body.contact_evidence_file_ids},requireKey(key),metadata(request));}
  @Get(":caseId") @RequirePermissions("refund.read") async get(@Req()request:Request,@Param("caseId",new ZodValidationPipe(id))caseId:string){const grants=await this.sessions.authorize(request.principal!);const result=await this.service.cases.get({adminId:principal(request),supervisor:grants.permissions.includes("refund.review.supervisor")},caseId);return {...result,available_actions:grants.permissions.includes("refund.manage")?result.available_actions:[]};}
  @Get(":caseId/history") @RequirePermissions("refund.read") history(@Req()request:Request,@Param("caseId",new ZodValidationPipe(id))caseId:string,@Query("after_version",new ZodValidationPipe(z.coerce.number().int().min(-1).default(-1)))afterVersion:number){return this.service.cases.history({adminId:principal(request),supervisor:false},caseId,afterVersion);}
  @Post(":caseId/actions") @RequirePermissions("refund.manage") async act(@Req()request:Request,@Param("caseId",new ZodValidationPipe(id))caseId:string,@Headers("idempotency-key")key:string|undefined,@Body(new ZodValidationPipe(adminAction))body:z.infer<typeof adminAction>){
    const grants=await this.sessions.authorize(request.principal!);
    const actor={adminId:principal(request),supervisor:grants.permissions.includes("refund.review.supervisor")};
    const result=await this.service.cases.act(actor,caseId,body.version,mapAction(body),metadata(request),undefined,requireKey(key));
    await this.service.driveCaseRefund(caseId);
    return {operation_result:result,current_case:await this.service.cases.get(actor,caseId)};
  }
}

function mapAction(value:Record<string,unknown>):CaseAction {
  const {version:_,...body}=value;void _;
  if(body.action==="MODIFY")return {action:"MODIFY",amountCent:BigInt(body.amount_cent as string),reasonCode:body.reason_code as string,reasonText:body.reason_text as string};
  if(body.action==="ADD_EVIDENCE"||body.action==="REJECT"||body.action==="SUBMIT_REMEDY"||body.action==="APPEND_REMEDY"||body.action==="APPEAL"||body.action==="MARK_EVIDENCE_SHAREABLE")return {action:body.action,fileIds:body.file_ids as string[],reason:body.reason as string,decisionId:body.decision_id as string} as CaseAction;
  if(body.action==="RESPOND")return {action:"RESPOND",offerId:body.offer_id as string,accept:body.accept as boolean};
  if(body.action==="ACCEPT_DECISION")return {action:"ACCEPT_DECISION",decisionId:body.decision_id as string};
  return body as CaseAction;
}
function principal(request:Request){if(!request.principal)throw new AppError({code:"AUTH_REQUIRED",message:"请先登录",statusCode:401});return request.principal.sub;}
function requireKey(value:string|undefined){if(!value||value.length<8||value.length>128)throw new AppError({code:"VALIDATION_FAILED",message:"Idempotency-Key必须为8到128字符",statusCode:400});return value;}
function metadata(request:Request){const context=requestContext.get();return {ip:request.ip.slice(0,64),userAgent:String(request.headers["user-agent"]??"unknown").slice(0,2000),requestId:context?.requestId??"unknown",traceId:context?.traceId};}
