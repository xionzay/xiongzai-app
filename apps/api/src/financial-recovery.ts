import { Body, Controller, Get, Inject, Injectable, Param, Post, Req } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import { adminOperationLogs, financialTransferOperations, uuidv7, type DatabaseClient } from "@xiongzai/database";
import { OutboxService, ScheduledJobService } from "@xiongzai/application";
import { AppError, type FinancialTransferRecovery } from "@xiongzai/contracts";
import { z } from "zod";
import { requestContext } from "@xiongzai/observability";
import type { RequestMetadata } from "./identity-user.service.js";
import type { FastifyRequest } from "fastify";
import { RequireMfa, RequirePermissions, type AuthenticatedRequest } from "./auth.guard.js";
import { ZodValidationPipe } from "./http.js";
import { API_CONFIG, DATABASE_CLIENT } from "./tokens.js";
import type { ApiConfig } from "./config.js";
import { AfterSaleService } from "./after-sale.service.js";
import { FinanceService } from "./finance.service.js";
import { DrizzleMockTransferStore } from "./mock-transfer-store.js";
import { TRANSFER_RECOVERY_JOB, type TransferOperation } from "./durable-transfers.js";

export function transferRecoveryView(row:TransferOperation):FinancialTransferRecovery{
  return {id:row.id,kind:row.kind,refund_id:row.refundId,withdrawal_id:row.withdrawalId,channel:row.channel,status:row.status,amount_cent:row.amountCent.toString(),attempts:row.attempts,max_attempts:row.maxAttempts,next_run_at:row.nextRunAt.toISOString(),last_error:row.lastError,version:row.version};
}

@Injectable()
export class FinancialRecoveryService {
  constructor(@Inject(DATABASE_CLIENT)private readonly database:DatabaseClient,@Inject(API_CONFIG)private readonly config:ApiConfig,private readonly finance:FinanceService,private readonly afterSale:AfterSaleService){}
  async list(){
    return (await this.database.db.select().from(financialTransferOperations).where(inArray(financialTransferOperations.status,["READY","PROCESSING","UNKNOWN","MANUAL_REVIEW"])).orderBy(desc(financialTransferOperations.createdAt)).limit(100)).map(transferRecoveryView);
  }
  async detail(id:string){return transferRecoveryView(await this.get(id));}
  async dispatch(id:string){
    const row=await this.get(id);
    if(row.kind==="REFUND")await this.afterSale.recoverRefund(id);else await this.finance.recoverPayout(id);
  }
  async recover(adminId:string,id:string,version:number,reason:string,metadata:RequestMetadata){
    this.localOnly();
    await this.database.db.transaction(async tx=>{
      const [row]=await tx.select().from(financialTransferOperations).where(eq(financialTransferOperations.id,id)).for("update");
      if(!row)throw missing();
      if(row.version!==version)throw versionError();
      if(["SUCCEEDED","FAILED"].includes(row.status))throw new AppError({code:"TRANSFER_ALREADY_FINAL",message:"资金执行已有明确终态，请勿重发",statusCode:409});
      if(row.leaseUntil&&row.leaseUntil>new Date())throw new AppError({code:"TRANSFER_RECOVERY_IN_PROGRESS",message:"渠道查询正在执行，请稍后读取结果",statusCode:409});
      const [updated]=await tx.update(financialTransferOperations).set({status:"UNKNOWN",maxAttempts:row.status==="MANUAL_REVIEW"?row.attempts+8:row.maxAttempts,nextRunAt:new Date(),leaseToken:null,leaseUntil:null,version:row.version+1,updatedAt:new Date()}).where(and(eq(financialTransferOperations.id,id),eq(financialTransferOperations.status,row.status),eq(financialTransferOperations.version,version))).returning();
      if(!updated)throw versionError();
      await tx.insert(adminOperationLogs).values({id:uuidv7(),adminId,...metadata,action:"FINANCIAL_TRANSFER_RECOVERY_REQUESTED",targetType:row.kind==="REFUND"?"REFUND":"WITHDRAWAL",targetId:(row.refundId??row.withdrawalId)!,reason,beforeJson:{status:row.status,version:row.version},afterJson:{status:updated.status,version:updated.version,operation_id:id}});
      await new ScheduledJobService().schedule(tx,{jobKey:`transfer:${id}:manual:v${updated.version}`,jobType:TRANSFER_RECOVERY_JOB,targetType:"PLATFORM",targetId:id,runAt:new Date(),payload:{kind:row.kind}});
      await new OutboxService().enqueue(tx,{aggregateType:row.kind==="REFUND"?"REFUND":"WITHDRAWAL",aggregateId:(row.refundId??row.withdrawalId)!,eventType:"FinancialTransferRecoveryRequested",payload:{operation_id:id}});
    });
    await this.dispatch(id);
    return this.detail(id);
  }
  async mockResult(adminId:string,id:string,version:number,status:"PROCESSING"|"UNKNOWN"|"SUCCEEDED"|"FAILED",reason:string,metadata:RequestMetadata){
    this.localOnly();
    return this.database.db.transaction(async tx=>{
      const [row]=await tx.select().from(financialTransferOperations).where(eq(financialTransferOperations.id,id)).for("update");
      if(!row)throw missing();
      if(row.version!==version)throw versionError();
      if(["SUCCEEDED","FAILED"].includes(row.status)&&row.status!==status)throw new AppError({code:"TRANSFER_ALREADY_FINAL",message:"业务已终结，不能改变模拟渠道结果",statusCode:409});
      const result=await new DrizzleMockTransferStore(this.database,this.config.authHmacKey).setResult(row.kind,row.channel,id,status,tx);
      await new OutboxService().enqueue(tx,{aggregateType:row.kind==="REFUND"?"REFUND":"WITHDRAWAL",aggregateId:(row.refundId??row.withdrawalId)!,eventType:"MockTransferResultRecorded",payload:{operation_id:id,status},traceId:metadata.traceId});
      // This updates only the Mock channel ledger, deliberately simulating a lost callback.
      await tx.insert(adminOperationLogs).values({id:uuidv7(),adminId,...metadata,action:"MOCK_TRANSFER_RESULT_SET",targetType:row.kind==="REFUND"?"REFUND":"WITHDRAWAL",targetId:(row.refundId??row.withdrawalId)!,reason,afterJson:{operation_id:id,status}});
      return {operation_id:id,provider_result:result.status,business_result_applied:false};
    });
  }
  private localOnly(){if(!["development","test"].includes(this.config.environment))throw new AppError({code:"MOCK_TRANSFER_DISABLED",message:"本地资金模拟未启用",statusCode:404});}
  private async get(id:string){const [row]=await this.database.db.select().from(financialTransferOperations).where(eq(financialTransferOperations.id,id));if(!row)throw missing();return row;}
}
function missing(){return new AppError({code:"TRANSFER_NOT_FOUND",message:"资金执行记录不存在",statusCode:404});}
function versionError(){return new AppError({code:"RESOURCE_VERSION_CONFLICT",message:"资金执行记录已更新，请刷新后重试",statusCode:409});}
const command=z.object({version:z.number().int().nonnegative(),reason:z.string().trim().min(2).max(1000)}).strict();
const mockCommand=command.extend({status:z.enum(["PROCESSING","UNKNOWN","SUCCEEDED","FAILED"])});
@Controller("admin-api/v1/finance/transfers") @RequireMfa()
export class FinancialRecoveryController {
  constructor(private readonly service:FinancialRecoveryService){}
  @Get() @RequirePermissions("finance.read") list(){return this.service.list();}
  @Get(":id") @RequirePermissions("finance.read") detail(@Param("id",new ZodValidationPipe(z.uuid()))id:string){return this.service.detail(id);}
  @Post(":id/recover") @RequirePermissions("finance.manage") recover(@Req()r:FastifyRequest&AuthenticatedRequest,@Param("id",new ZodValidationPipe(z.uuid()))id:string,@Body(new ZodValidationPipe(command))b:z.infer<typeof command>){return this.service.recover(r.principal!.sub,id,b.version,b.reason,requestMetadata(r));}
  @Post(":id/mock-result") @RequirePermissions("finance.manage") mock(@Req()r:FastifyRequest&AuthenticatedRequest,@Param("id",new ZodValidationPipe(z.uuid()))id:string,@Body(new ZodValidationPipe(mockCommand))b:z.infer<typeof mockCommand>){return this.service.mockResult(r.principal!.sub,id,b.version,b.status,b.reason,requestMetadata(r));}
}

function requestMetadata(request:FastifyRequest):RequestMetadata{const context=requestContext.get();return {ip:request.ip.slice(0,64),userAgent:String(request.headers["user-agent"]??"unknown").slice(0,2000),requestId:context?.requestId??"unknown",traceId:context?.traceId};}
