import {and,asc,eq,sql} from "drizzle-orm";
import {AppError} from "@xiongzai/contracts";
import {afterSaleCases,afterSaleFundHolds,orders,scheduledJobs,sellerProfiles,sellerIncomes,sellerLiabilities,sellerLiabilityAllocations,uuidv7,type Database,type DatabaseTransaction} from "@xiongzai/database";
import {ensureSellerLedgerAccount,postLedgerTransaction} from "./finance-ledger.js";

type Order = typeof orders.$inferSelect;
/** Encumbrance is not a channel refund or an advance. All callers hold the case's order lock. */
export class AfterSaleFunds {
  async reserve(tx:DatabaseTransaction,caseId:string,order:Order,target:bigint,traceId?:string){
    await tx.select({id:sellerProfiles.id}).from(sellerProfiles).where(eq(sellerProfiles.id,order.sellerId)).for("update");
    const existing=await tx.select().from(afterSaleFundHolds).where(and(eq(afterSaleFundHolds.caseId,caseId),eq(afterSaleFundHolds.status,"HELD"))).for("update");
    let held=existing.reduce((sum,row)=>sum+row.amountCent,0n);
    const incomes=await tx.select().from(sellerIncomes).where(eq(sellerIncomes.sellerId,order.sellerId)).orderBy(asc(sellerIncomes.createdAt),asc(sellerIncomes.id)).for("update");
    // The original commission is still platform cash. It is waived only on actual refund,
    // never credited as merchant available funds or posted as a refund in advance.
    const original=incomes.find(row=>row.orderId===order.id);
    const commission=original?min(original.platformFeeCent,target):0n;
    let remaining=target-commission-held;
    for(const initial of incomes){
      if(remaining<=0n)break;
      // Do not pledge another disputed order's funds to this case.
      if(initial.orderId!==order.id){const [source]=await tx.select({afterSale:orders.afterSaleStatus,payment:orders.paymentStatus}).from(orders).where(eq(orders.id,initial.orderId));if(!source||source.afterSale==="IN_PROGRESS"||source.payment==="REFUNDING")continue;}
      let income=initial;
      for(const bucket of ["AVAILABLE","PENDING"] as const){
        const eligible=bucket==="AVAILABLE"?income.availableAmountCent:income.sellerAmountCent-income.availableAmountCent-income.lockedAmountCent-income.afterSaleHeldCent-income.withdrawnAmountCent-income.reversedAmountCent;
        const amount=min(remaining,eligible);if(amount<=0n)continue;
        const id=uuidv7();
        const source=await ensureSellerLedgerAccount(tx,order.sellerId,bucket==="AVAILABLE"?"SELLER_AVAILABLE":"SELLER_PENDING");
        const frozen=await ensureSellerLedgerAccount(tx,order.sellerId,"SELLER_AFTER_SALE_HELD");
        await postLedgerTransaction(tx,{transactionType:"ADJUSTMENT",sourceType:"REFUND",sourceId:caseId,idempotencyKey:`case:hold:${id}`,description:"特殊售后按诉求保全（非退款）",traceId,entries:[{accountId:source.id,side:"DEBIT",amountCent:amount,memo:"减少可支配收益"},{accountId:frozen.id,side:"CREDIT",amountCent:amount,memo:"案件专项保全"}]});
        const [updated]=await tx.update(sellerIncomes).set({availableAmountCent:income.availableAmountCent-(bucket==="AVAILABLE"?amount:0n),afterSaleHeldCent:income.afterSaleHeldCent+amount,version:income.version+1,updatedAt:new Date()}).where(and(eq(sellerIncomes.id,income.id),eq(sellerIncomes.status,income.status),eq(sellerIncomes.version,income.version))).returning();
        if(!updated)throw new Error("Income reservation version conflict");income=updated;
        await tx.insert(afterSaleFundHolds).values({id,caseId,incomeId:income.id,sourceBucket:bucket,amountCent:amount});held+=amount;remaining-=amount;
      }
    }
    return {held_cent:held.toString(),commission_reserved_cent:commission.toString(),funding_gap_cent:(remaining>0n?remaining:0n).toString(),target_cent:target.toString()};
  }

  async release(tx:DatabaseTransaction,caseId:string,traceId?:string){
    const rows=await tx.select().from(afterSaleFundHolds).where(and(eq(afterSaleFundHolds.caseId,caseId),eq(afterSaleFundHolds.status,"HELD"))).orderBy(asc(afterSaleFundHolds.incomeId),asc(afterSaleFundHolds.id)).for("update");
    const released:Array<{incomeId:string;bucket:"AVAILABLE"|"PENDING";amount:bigint}>=[];
    for(const hold of rows){
      const [income]=await tx.select().from(sellerIncomes).where(eq(sellerIncomes.id,hold.incomeId)).for("update");
      if(!income||income.afterSaleHeldCent<hold.amountCent)throw new Error("Case hold allocation mismatch");
      const bucket=hold.sourceBucket==="AVAILABLE"||income.availableAt!==null?"AVAILABLE":"PENDING";
      const frozen=await ensureSellerLedgerAccount(tx,income.sellerId,"SELLER_AFTER_SALE_HELD"),destination=await ensureSellerLedgerAccount(tx,income.sellerId,bucket==="AVAILABLE"?"SELLER_AVAILABLE":"SELLER_PENDING");
      await postLedgerTransaction(tx,{transactionType:"ADJUSTMENT",sourceType:"REFUND",sourceId:caseId,idempotencyKey:`case:release:${hold.id}`,description:"释放本案保全，独立冻结不变",traceId,entries:[{accountId:frozen.id,side:"DEBIT",amountCent:hold.amountCent,memo:"释放案件保全"},{accountId:destination.id,side:"CREDIT",amountCent:hold.amountCent,memo:"恢复原收益"}]});
      const updated=await tx.update(sellerIncomes).set({afterSaleHeldCent:income.afterSaleHeldCent-hold.amountCent,availableAmountCent:income.availableAmountCent+(bucket==="AVAILABLE"?hold.amountCent:0n),...(bucket==="AVAILABLE"?{status:"AVAILABLE" as const}:{}),version:income.version+1,updatedAt:new Date()}).where(and(eq(sellerIncomes.id,income.id),eq(sellerIncomes.status,income.status),eq(sellerIncomes.version,income.version))).returning({id:sellerIncomes.id});
      if(!updated.length)throw new Error("Income release version conflict");
      await tx.update(afterSaleFundHolds).set({status:"RELEASED",version:hold.version+1,updatedAt:new Date()}).where(and(eq(afterSaleFundHolds.id,hold.id),eq(afterSaleFundHolds.status,"HELD"),eq(afterSaleFundHolds.version,hold.version)));
      released.push({incomeId:income.id,bucket,amount:hold.amountCent});
      if(bucket==="PENDING"&&income.status==="PENDING_SETTLEMENT")await tx.insert(scheduledJobs).values({id:uuidv7(),jobKey:`case:released-income:${hold.id}`,jobType:"FINANCE_INCOME_AVAILABLE",targetType:"ORDER",targetId:income.orderId,payloadJson:{income_id:income.id},runAt:new Date(Math.max(Date.now(),income.settlementAvailableAt.getTime())),maxAttempts:8}).onConflictDoNothing();
    }
    return released;
  }

  /** Actual refund first creates the original-order liability. Reserved other income offsets
   * that SAME debt in the callback transaction; no second buyer payment is posted. */
  async settle(tx:DatabaseTransaction,caseId:string,released:Awaited<ReturnType<AfterSaleFunds["release"]>>,traceId?:string){
    let [liability]=await tx.select().from(sellerLiabilities).where(eq(sellerLiabilities.refundId,caseId)).for("update");
    if(!liability)return;
    const groups=new Map<string,{available:bigint;pending:bigint}>();
    for(const item of released){const group=groups.get(item.incomeId)??{available:0n,pending:0n};if(item.bucket==="AVAILABLE")group.available+=item.amount;else group.pending+=item.amount;groups.set(item.incomeId,group);}
    for(const [incomeId,reserved] of groups){
      if(liability.outstandingAmountCent<=0n)break;
      const [income]=await tx.select().from(sellerIncomes).where(eq(sellerIncomes.id,incomeId)).for("update");if(!income)throw new Error("Reserved income missing");
      const available=min(min(reserved.available,income.availableAmountCent),liability.outstandingAmountCent);
      const pendingBalance=income.sellerAmountCent-income.availableAmountCent-income.lockedAmountCent-income.afterSaleHeldCent-income.withdrawnAmountCent-income.reversedAmountCent;
      const pending=min(min(reserved.pending,pendingBalance),liability.outstandingAmountCent-available);
      const amount=available+pending;if(amount<=0n)continue;
      const debt=await ensureSellerLedgerAccount(tx,income.sellerId,"SELLER_LIABILITY");
      const entries:Array<{accountId:string;side:"DEBIT"|"CREDIT";amountCent:bigint;memo:string}>=[];
      for(const [bucket,value] of [["SELLER_AVAILABLE",available],["SELLER_PENDING",pending]] as const){if(value>0n){const source=await ensureSellerLedgerAccount(tx,income.sellerId,bucket);entries.push({accountId:source.id,side:"DEBIT",amountCent:value,memo:"消耗本案保全收益"});}}
      entries.push({accountId:debt.id,side:"CREDIT",amountCent:amount,memo:"清偿同案退款欠款"});
      const posted=await postLedgerTransaction(tx,{transactionType:"LIABILITY_OFFSET",sourceType:"REFUND",sourceId:caseId,idempotencyKey:`case:funded-offset:${caseId}:${income.id}`,description:"本案保全资金抵扣同笔已执行退款欠款",traceId,entries});
      await tx.insert(sellerLiabilityAllocations).values({id:uuidv7(),liabilityId:liability.id,incomeId:income.id,ledgerTransactionId:posted.id,amountCent:amount});
      const changed=await tx.update(sellerIncomes).set({availableAmountCent:income.availableAmountCent-available,reversedAmountCent:income.reversedAmountCent+amount,version:income.version+1,updatedAt:new Date()}).where(and(eq(sellerIncomes.id,income.id),eq(sellerIncomes.status,income.status),eq(sellerIncomes.version,income.version))).returning({id:sellerIncomes.id});
      if(!changed.length)throw new Error("Case income version conflict");
      const remaining=liability.outstandingAmountCent-amount;
      [liability]=await tx.update(sellerLiabilities).set({outstandingAmountCent:remaining,status:remaining===0n?"SETTLED":"PARTIALLY_OFFSET",riskHold:remaining>0n,settledAt:remaining===0n?new Date():null,version:liability.version+1,updatedAt:new Date()}).where(and(eq(sellerLiabilities.id,liability.id),eq(sellerLiabilities.status,liability.status),eq(sellerLiabilities.version,liability.version))).returning();
      if(!liability)throw new Error("Case liability version conflict");
    }
    if(liability.outstandingAmountCent!==0n)throw new Error("Fully funded case cannot leave an uncovered executed refund");
  }
}
function min(a:bigint,b:bigint){return a<b?a:b;}

/** Restrict new business, not existing delivery/after-sale access, while an effective debt is unfunded. */
export async function assertSellerNoPendingRecovery(tx:Database|DatabaseTransaction,sellerId:string){
  const [row]=await tx.select({id:afterSaleCases.id}).from(afterSaleCases).innerJoin(orders,eq(orders.id,afterSaleCases.orderId)).where(and(eq(orders.sellerId,sellerId),eq(afterSaleCases.kind,"SPECIAL"),eq(afterSaleCases.state,"EXECUTION_PENDING"),sql`${afterSaleCases.data}->>'award_effective' = 'true'`,sql`(${afterSaleCases.data}->'funding'->>'funding_gap_cent')::numeric > 0`)).limit(1);
  if(row)throw new AppError({code:"SELLER_PENDING_RECOVERY",message:"店铺存在生效售后追偿缺口，新增交易暂不可用；存量履约及售后仍可处理",statusCode:409});
}
