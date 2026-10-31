import { createHmac } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { mockTransferResults, uuidv7, type DatabaseClient, type DatabaseTransaction } from "@xiongzai/database";
import { AppError } from "@xiongzai/contracts";
import type { TransferResult } from "./durable-transfers.js";

export interface MockTransferStore {
  create(kind:"REFUND"|"PAYOUT",channel:string,key:string,request:unknown,reference:string):Promise<TransferResult>;
  query(kind:"REFUND"|"PAYOUT",channel:string,key:string):Promise<TransferResult>;
}

export class DrizzleMockTransferStore implements MockTransferStore {
  constructor(private readonly database:DatabaseClient,private readonly secret:string){}
  async create(kind:"REFUND"|"PAYOUT",channel:string,key:string,request:unknown,reference:string){
    const hash=createHmac("sha256",this.secret).update(JSON.stringify(request,(_,v)=>typeof v==="bigint"?v.toString():v)).digest("hex");
    await this.database.db.insert(mockTransferResults).values({id:uuidv7(),kind,channel,idempotencyKey:key,requestHash:hash,providerReference:reference}).onConflictDoNothing();
    const [row]=await this.database.db.select().from(mockTransferResults).where(this.key(kind,channel,key));
    if(!row||row.requestHash!==hash)throw new AppError({code:"TRANSFER_IDEMPOTENCY_CONFLICT",message:"资金请求幂等标识与原请求不一致",statusCode:409});
    return {status:row.status,providerReference:row.providerReference};
  }
  async query(kind:"REFUND"|"PAYOUT",channel:string,key:string):Promise<TransferResult>{
    const [row]=await this.database.db.select().from(mockTransferResults).where(this.key(kind,channel,key));
    return row?{status:row.status,providerReference:row.providerReference}:{status:"NOT_FOUND"};
  }
  async setResult(kind:"REFUND"|"PAYOUT",channel:string,key:string,status:"PROCESSING"|"UNKNOWN"|"SUCCEEDED"|"FAILED",executor?:DatabaseTransaction){
    const apply=async(tx:DatabaseTransaction)=>{
      const [row]=await tx.select().from(mockTransferResults).where(this.key(kind,channel,key)).for("update");
      if(!row)throw new AppError({code:"MOCK_TRANSFER_NOT_SUBMITTED",message:"模拟渠道尚未收到该资金请求",statusCode:409});
      if(["SUCCEEDED","FAILED"].includes(row.status)&&row.status!==status)throw new AppError({code:"MOCK_TRANSFER_RESULT_FINAL",message:"模拟渠道终态不可覆盖",statusCode:409});
      if(row.status!==status)await tx.update(mockTransferResults).set({status,version:sql`${mockTransferResults.version}+1`,updatedAt:new Date()}).where(and(eq(mockTransferResults.id,row.id),eq(mockTransferResults.status,row.status),eq(mockTransferResults.version,row.version)));
      return {status,providerReference:row.providerReference};
    };
    return executor?apply(executor):this.database.db.transaction(apply);
  }
  private key(kind:"REFUND"|"PAYOUT",channel:string,key:string){return and(eq(mockTransferResults.kind,kind),eq(mockTransferResults.channel,channel),eq(mockTransferResults.idempotencyKey,key));}
}
