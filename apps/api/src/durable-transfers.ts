import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { financialTransferOperations, uuidv7, type DatabaseClient, type DatabaseTransaction } from "@xiongzai/database";
import { OutboxService, ScheduledJobService } from "@xiongzai/application";
import { AppError } from "@xiongzai/contracts";

export const TRANSFER_RECOVERY_JOB = "FINANCIAL_TRANSFER_RECOVER";
export type TransferOperation = typeof financialTransferOperations.$inferSelect;
export type TransferResult = {status:"NOT_FOUND"|"PROCESSING"|"UNKNOWN"|"SUCCEEDED"|"FAILED";providerReference?:string};
export interface TransferAdapter {
  submit(operation:TransferOperation):Promise<TransferResult>;
  query(operation:TransferOperation):Promise<TransferResult>;
  bind(tx:DatabaseTransaction,operation:TransferOperation,reference:string):Promise<void>;
  apply(tx:DatabaseTransaction,operation:TransferOperation,result:TransferResult):Promise<void>;
}

export class DurableTransfers {
  private readonly jobs=new ScheduledJobService();
  private readonly outbox=new OutboxService();
  constructor(private readonly database:DatabaseClient){}

  async enqueue(tx:DatabaseTransaction,input:{kind:"REFUND"|"PAYOUT";targetId:string;channel:string;businessNo:string;amountCent:bigint}){
    const [row]=await tx.insert(financialTransferOperations).values({
      id:uuidv7(),kind:input.kind,refundId:input.kind==="REFUND"?input.targetId:null,
      withdrawalId:input.kind==="PAYOUT"?input.targetId:null,channel:input.channel,
      businessNo:input.businessNo,amountCent:input.amountCent,nextRunAt:new Date(),
    }).returning();
    await this.schedule(tx,row!,new Date(),"initial");
    await this.outbox.enqueue(tx,{aggregateType:input.kind==="REFUND"?"REFUND":"WITHDRAWAL",aggregateId:input.targetId,eventType:"FinancialTransferRequested",payload:{operation_id:row!.id,channel:input.channel}});
    return row!;
  }

  async latest(kind:"REFUND"|"PAYOUT",targetId:string){
    const [row]=await this.database.db.select().from(financialTransferOperations).where(and(eq(financialTransferOperations.kind,kind),kind==="REFUND"?eq(financialTransferOperations.refundId,targetId):eq(financialTransferOperations.withdrawalId,targetId))).orderBy(sql`${financialTransferOperations.createdAt} DESC,${financialTransferOperations.id} DESC`).limit(1);
    return row;
  }

  async callback<T>(tx:DatabaseTransaction,kind:"REFUND"|"PAYOUT",businessNo:string,reference:string,status:"SUCCEEDED"|"FAILED",apply:()=>Promise<T>):Promise<T>{
    // Same lock order as recovery: operation first, then business row. Legacy callbacks have no intent.
    const [operation]=await tx.select().from(financialTransferOperations).where(and(eq(financialTransferOperations.kind,kind),eq(financialTransferOperations.businessNo,businessNo))).orderBy(sql`${financialTransferOperations.createdAt} DESC,${financialTransferOperations.id} DESC`).limit(1).for("update");
    const expected=operation?`mock-${kind==="REFUND"?"refund":"payout"}-${operation.id}`:null;
    if(operation&&reference===expected&&["SUCCEEDED","FAILED"].includes(operation.status)&&operation.status!==status)
      throw new AppError({code:"TRANSFER_RESULT_CONFLICT",message:"资金终态冲突，需核对渠道结果",statusCode:409});
    const value=await apply();
    if(operation&&reference===expected&&operation.status!==status){
      await tx.update(financialTransferOperations).set({status,providerReference:reference,leaseToken:null,leaseUntil:null,lastError:null,version:operation.version+1,updatedAt:new Date()}).where(this.cas(operation));
    }
    return value;
  }

  async run(id:string,adapter:TransferAdapter):Promise<void>{
    const claim=await this.database.db.transaction(async tx=>{
      const [row]=await tx.select().from(financialTransferOperations).where(eq(financialTransferOperations.id,id)).for("update");
      if(!row||["SUCCEEDED","FAILED","MANUAL_REVIEW"].includes(row.status))return;
      const now=new Date();
      if(row.nextRunAt>now||(row.leaseUntil&&row.leaseUntil>now))return;
      if(row.attempts>=row.maxAttempts){
        const [manual]=await tx.update(financialTransferOperations).set({status:"MANUAL_REVIEW",leaseToken:null,leaseUntil:null,lastError:"recovery_attempts_exhausted",version:row.version+1,updatedAt:now}).where(this.cas(row)).returning();
        if(manual)await this.outbox.enqueue(tx,{aggregateType:row.kind==="REFUND"?"REFUND":"WITHDRAWAL",aggregateId:(row.refundId??row.withdrawalId)!,eventType:"FinancialTransferManualReviewRequired",payload:{operation_id:row.id,channel:row.channel}});
        return;
      }
      const leaseUntil=new Date(now.getTime()+30_000);
      const [owned]=await tx.update(financialTransferOperations).set({status:"PROCESSING",attempts:row.attempts+1,leaseToken:randomUUID(),leaseUntil,version:row.version+1,updatedAt:now}).where(this.cas(row)).returning();
      if(owned)await this.schedule(tx,owned,leaseUntil,"watchdog");
      return owned?{row:owned,first:row.status==="READY"&&row.attempts===0}:undefined;
    });
    if(!claim)return;
    let result:TransferResult;
    try{
      // No open DB transaction while the provider executes. A replay queries first.
      result=claim.first?await adapter.submit(claim.row):await adapter.query(claim.row);
      if(result.status==="NOT_FOUND")result=await adapter.submit(claim.row);
      if((result.status==="SUCCEEDED"||result.status==="FAILED")&&!result.providerReference)result={status:"UNKNOWN"};
    }catch{
      // Transport timeout/exception is NEVER a definitive channel failure.
      result={status:"UNKNOWN"};
    }
    await this.database.db.transaction(async tx=>{
      const [current]=await tx.select().from(financialTransferOperations).where(eq(financialTransferOperations.id,id)).for("update");
      if(!current||current.status!=="PROCESSING"||current.version!==claim.row.version||current.leaseToken!==claim.row.leaseToken)return;
      if(result.providerReference){
        if(current.providerReference&&current.providerReference!==result.providerReference)result={status:"UNKNOWN"};
        else await adapter.bind(tx,current,result.providerReference);
      }
      const terminal=result.status==="SUCCEEDED"||result.status==="FAILED";
      if(terminal)await adapter.apply(tx,current,result);
      const now=new Date(),nextRunAt=new Date(now.getTime()+Math.min(300_000,2_000*2**Math.min(current.attempts-1,7)));
      const [updated]=await tx.update(financialTransferOperations).set({
        status:terminal?(result.status as "SUCCEEDED"|"FAILED"):result.status==="PROCESSING"?"PROCESSING":"UNKNOWN",
        providerReference:result.providerReference??current.providerReference,leaseToken:null,leaseUntil:null,
        nextRunAt,lastError:result.status==="UNKNOWN"?"provider_result_unknown":null,version:current.version+1,updatedAt:now,
      }).where(this.cas(current)).returning();
      if(updated&&!terminal)await this.schedule(tx,updated,nextRunAt,"query");
    });
  }

  async enqueueDue():Promise<void>{
    await this.database.db.transaction(async tx=>{
      const rows=await tx.select().from(financialTransferOperations).where(sql`${financialTransferOperations.status} IN ('READY','PROCESSING','UNKNOWN') AND ${financialTransferOperations.nextRunAt} <= statement_timestamp() AND (${financialTransferOperations.leaseUntil} IS NULL OR ${financialTransferOperations.leaseUntil} <= statement_timestamp())`).orderBy(financialTransferOperations.nextRunAt).limit(100).for("update",{skipLocked:true});
      // A fresh bounded sweep key also recovers jobs which exhausted their own retries.
      for(const row of rows)await this.schedule(tx,row,new Date(),`sweep:${Math.floor(Date.now()/60_000)}`);
    });
  }

  private cas(row:TransferOperation){return and(eq(financialTransferOperations.id,row.id),eq(financialTransferOperations.status,row.status),eq(financialTransferOperations.version,row.version));}
  private async schedule(tx:DatabaseTransaction,row:TransferOperation,runAt:Date,phase:string){
    await this.jobs.schedule(tx,{jobKey:`transfer:${row.id}:v${row.version}:${phase}`,jobType:TRANSFER_RECOVERY_JOB,targetType:"PLATFORM",targetId:row.id,runAt,maxAttempts:8,payload:{kind:row.kind}});
  }
}
