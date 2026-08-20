import { Body, Controller, Delete, Get, Headers, Param, Post, Query, Req } from "@nestjs/common";
import { AppError, errorCodes } from "@xiongzai/contracts";
import { requestContext } from "@xiongzai/observability";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { Public, RequireMfa, RequirePermissions, type AuthenticatedRequest } from "./auth.guard.js";
import { FinanceService } from "./finance.service.js";
import { ZodValidationPipe } from "./http.js";
import type { RequestMetadata } from "./identity-user.service.js";

const uuid=z.uuid();const bigintCent=z.string().regex(/^\d+$/u).transform(BigInt);const version=z.object({version:z.number().int().nonnegative()});
const payoutCreate=z.object({account_type:z.enum(["WECHAT","ALIPAY"]),holder_name:z.string().trim().min(2).max(64),account_token:z.string().trim().min(3).max(128),is_default:z.boolean().default(false)});
const withdrawalCreate=z.object({payout_account_id:uuid,amount_cent:bigintCent});
const adminDecision=z.object({version:z.number().int().nonnegative(),reason:z.string().trim().min(2).max(1000)});
const payoutCallback=z.object({event_id:uuid,event_type:z.enum(["PAYOUT_SUCCEEDED","PAYOUT_FAILED"]),withdrawal_no:z.string().min(8).max(64),provider_payout_no:z.string().min(8).max(128),amount_cent:z.string().regex(/^\d+$/u),failure_reason:z.string().max(1000).optional()});
const reconciliationRun=z.object({provider:z.string().trim().min(2).max(64),statement_date:z.coerce.date(),reason:z.string().trim().min(2).max(1000),items:z.array(z.object({business_type:z.enum(["PAYMENT","WITHDRAWAL"]),provider_reference:z.string().trim().min(2).max(160),amount_cent:bigintCent,status:z.string().trim().min(2).max(64)})).max(5000)});
const reconciliationResolve=z.object({action:z.enum(["RESOLVE","IGNORE"]),reason:z.string().trim().min(2).max(2000)});

@Controller("api/v1/seller/finance")
export class SellerFinanceController {constructor(private readonly service:FinanceService){}@Get("summary")summary(@Req()r:UserRequest){return this.service.sellerSummary(principal(r));}@Get("incomes")incomes(@Req()r:UserRequest){return this.service.listIncomes(principal(r));}@Get("liabilities")liabilities(@Req()r:UserRequest){return this.service.listLiabilities(principal(r));}}

@Controller("api/v1/seller/payout-accounts")
export class SellerPayoutAccountController {constructor(private readonly service:FinanceService){}@Get()list(@Req()r:UserRequest){return this.service.listPayoutAccounts(principal(r));}@Post()create(@Req()r:UserRequest,@Body(new ZodValidationPipe(payoutCreate))b:z.infer<typeof payoutCreate>){return this.service.createPayoutAccount(principal(r),{accountType:b.account_type,holderName:b.holder_name,accountToken:b.account_token,isDefault:b.is_default});}@Post(":id/default")setDefault(@Req()r:UserRequest,@Param("id",new ZodValidationPipe(uuid))id:string,@Body(new ZodValidationPipe(version))b:z.infer<typeof version>){return this.service.setDefaultPayoutAccount(principal(r),id,b.version);}@Delete(":id")remove(@Req()r:UserRequest,@Param("id",new ZodValidationPipe(uuid))id:string,@Query(new ZodValidationPipe(version))q:z.infer<typeof version>){return this.service.deletePayoutAccount(principal(r),id,q.version);}}

@Controller("api/v1/seller/withdrawals")
export class SellerWithdrawalController {constructor(private readonly service:FinanceService){}@Post()create(@Req()r:UserRequest,@Headers("idempotency-key")key:string|undefined,@Body(new ZodValidationPipe(withdrawalCreate))b:z.infer<typeof withdrawalCreate>){return this.service.createWithdrawal(principal(r),{payoutAccountId:b.payout_account_id,amountCent:b.amount_cent,idempotencyKey:idempotencyKey(key)},metadata(r));}@Get()list(@Req()r:UserRequest){return this.service.listWithdrawals(principal(r));}@Get(":id")detail(@Req()r:UserRequest,@Param("id",new ZodValidationPipe(uuid))id:string){return this.service.withdrawalDetail(principal(r),id);}}

@Controller("admin-api/v1/finance") @RequireMfa()
export class AdminFinanceController {constructor(private readonly service:FinanceService){}@Get("ledger-transactions")@RequirePermissions("finance.read")ledger(){return this.service.adminLedgerTransactions();}@Get("ledger-transactions/:id")@RequirePermissions("finance.read")ledgerDetail(@Param("id",new ZodValidationPipe(uuid))id:string){return this.service.ledgerDetail(id);}@Post("ledger-transactions/:id/reverse")@RequirePermissions("finance.manage")reverse(@Req()r:UserRequest,@Param("id",new ZodValidationPipe(uuid))id:string,@Body(new ZodValidationPipe(z.object({reason:z.string().trim().min(2).max(1000)})))b:{reason:string}){return this.service.reverseLedger(principal(r),id,b.reason,metadata(r));}@Get("reconciliation-runs")@RequirePermissions("finance.read")runs(){return this.service.listReconciliationRuns();}@Post("reconciliation-runs")@RequirePermissions("finance.manage")run(@Req()r:UserRequest,@Body(new ZodValidationPipe(reconciliationRun))b:z.infer<typeof reconciliationRun>){return this.service.createReconciliationRun(principal(r),{provider:b.provider,statementDate:b.statement_date,items:b.items.map(v=>({businessType:v.business_type,providerReference:v.provider_reference,amountCent:v.amount_cent,status:v.status}))},b.reason,metadata(r));}@Get("reconciliation-runs/:id")@RequirePermissions("finance.read")runDetail(@Param("id",new ZodValidationPipe(uuid))id:string){return this.service.reconciliationDetail(id);}@Post("reconciliation-items/:id/resolve")@RequirePermissions("finance.manage")resolve(@Req()r:UserRequest,@Param("id",new ZodValidationPipe(uuid))id:string,@Body(new ZodValidationPipe(reconciliationResolve))b:z.infer<typeof reconciliationResolve>){return this.service.resolveReconciliationItem(principal(r),id,b,metadata(r));}}

@Controller("admin-api/v1/withdrawals") @RequireMfa()
export class AdminWithdrawalController {constructor(private readonly service:FinanceService){}@Get()@RequirePermissions("withdrawal.read")list(){return this.service.adminListWithdrawals();}@Post(":id/approve")@RequirePermissions("withdrawal.manage")approve(@Req()r:UserRequest,@Param("id",new ZodValidationPipe(uuid))id:string,@Body(new ZodValidationPipe(adminDecision))b:z.infer<typeof adminDecision>){return this.service.approveWithdrawal(principal(r),id,b.version,b.reason,metadata(r));}}

@Controller("callbacks/v1/payouts")
export class PayoutCallbackController {constructor(private readonly service:FinanceService){}@Post("mock")@Public()callback(@Req()r:FastifyRequest,@Headers("x-payout-signature")signature:string|undefined,@Body(new ZodValidationPipe(payoutCallback))b:z.infer<typeof payoutCallback>){return this.service.processPayoutCallback(b,signature,metadata(r));}}

type UserRequest=FastifyRequest&AuthenticatedRequest;function principal(request:UserRequest){if(!request.principal)throw new AppError({code:errorCodes.AUTH_REQUIRED,message:"请先登录",statusCode:401});return request.principal.sub;}function idempotencyKey(value:string|undefined){if(!value||value.length<8||value.length>128)throw new AppError({code:errorCodes.VALIDATION_FAILED,message:"Idempotency-Key 必须为 8 到 128 个字符",statusCode:400});return value;}function metadata(request:FastifyRequest):RequestMetadata{const context=requestContext.get();return {ip:request.ip.slice(0,64),userAgent:String(request.headers["user-agent"]??"unknown").slice(0,2000),requestId:context?.requestId??"unknown",traceId:context?.traceId};}
