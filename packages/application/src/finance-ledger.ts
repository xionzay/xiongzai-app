import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
  platformConfigs,
  scheduledJobs,
  sellerIncomes,
  sellerLiabilities,
  sellerLiabilityAllocations,
  uuidv7,
  type Database,
  type DatabaseTransaction,
  orders,
  type refunds,
} from "@xiongzai/database";

type Executor = Database | DatabaseTransaction;
type OrderRow = typeof orders.$inferSelect;
type RefundRow = typeof refunds.$inferSelect;
type AccountType = typeof ledgerAccounts.$inferInsert.accountType;
type TransactionType = typeof ledgerTransactions.$inferInsert.transactionType;
type SourceType = typeof ledgerTransactions.$inferInsert.sourceType;
export type LedgerTemplateEntry = { accountId: string; side: "DEBIT" | "CREDIT"; amountCent: bigint; memo: string };

export const FINANCE_JOB_TYPES = { INCOME_AVAILABLE: "FINANCE_INCOME_AVAILABLE" } as const;

export class FinanceLedgerEngine {
  constructor(private readonly database: Database) {}

  async recordOrderCompleted(executor: DatabaseTransaction, order: OrderRow, traceId?: string): Promise<typeof sellerIncomes.$inferSelect> {
    if (order.afterSaleStatus === "IN_PROGRESS" || order.paymentStatus === "REFUNDING") throw new Error("Active after-sale blocks normal settlement");
    const existing = await executor.select().from(sellerIncomes).where(eq(sellerIncomes.orderId, order.id)).limit(1);
    if (existing[0]) return existing[0];
    const settlementSeconds = await configInteger(executor, "finance.settlement_delay_seconds");
    const completedAt = order.completedAt ?? new Date();
    const availableAt = new Date(completedAt.getTime() + settlementSeconds * 1_000);
    const receivable = await ensureSystemAccount(executor, "platform-receivable", "PLATFORM_RECEIVABLE", "PLATFORM");
    const commission = await ensureSystemAccount(executor, "platform-commission", "PLATFORM_COMMISSION", "PLATFORM");
    const pending = await ensureSellerAccount(executor, order.sellerId, "SELLER_PENDING");
    const transaction = await post(executor, {
      transactionType: "ORDER_COMPLETED", sourceType: "ORDER", sourceId: order.id,
      idempotencyKey: `finance:order-completed:${order.id}`, description: `订单 ${order.orderNo} 完成收益入账`, traceId,
      entries: [
        { accountId: receivable.id, side: "DEBIT", amountCent: order.paidAmountCent, memo: "订单实付应收" },
        ...(order.platformFeeCent > 0n ? [{ accountId: commission.id, side: "CREDIT" as const, amountCent: order.platformFeeCent, memo: "平台佣金" }] : []),
        { accountId: pending.id, side: "CREDIT", amountCent: order.sellerIncomeCent, memo: "陪玩待结算收益" },
      ],
    });
    const [income] = await executor.insert(sellerIncomes).values({
      id: uuidv7(), sellerId: order.sellerId, orderId: order.id, ledgerTransactionId: transaction.id,
      orderAmountCent: order.paidAmountCent, platformFeeCent: order.platformFeeCent, sellerAmountCent: order.sellerIncomeCent,
      settlementAvailableAt: availableAt,
    }).onConflictDoNothing().returning();
    const row = income ?? (await executor.select().from(sellerIncomes).where(eq(sellerIncomes.orderId, order.id)).limit(1))[0];
    if (!row) throw new Error("Order income could not be created.");
    await executor.insert(scheduledJobs).values({ id: uuidv7(), jobKey: `finance:income-available:${row.id}`, jobType: FINANCE_JOB_TYPES.INCOME_AVAILABLE, targetType: "ORDER", targetId: order.id, payloadJson: { income_id: row.id }, runAt: availableAt, maxAttempts:8 }).onConflictDoNothing();
    return row;
  }

  async makeIncomeAvailable(incomeId: string, traceId?: string): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      // Use the same order -> income lock ordering as refund execution.
      const [lookup] = await tx.select({ orderId: sellerIncomes.orderId }).from(sellerIncomes).where(eq(sellerIncomes.id, incomeId)).limit(1);
      if (!lookup) return false;
      const [order] = await tx.select().from(orders).where(eq(orders.id, lookup.orderId)).limit(1).for("update");
      if (!order || order.afterSaleStatus === "IN_PROGRESS" || order.paymentStatus === "REFUNDING") return false;
      const [income] = await tx.select().from(sellerIncomes).where(eq(sellerIncomes.id, incomeId)).limit(1).for("update");
      if (!income || income.status !== "PENDING_SETTLEMENT" || income.settlementAvailableAt > new Date()) return false;
      const remaining = income.sellerAmountCent - income.reversedAmountCent - income.availableAmountCent - income.lockedAmountCent - income.withdrawnAmountCent;
      if (remaining <= 0n) return false;
      const pending = await ensureSellerAccount(tx, income.sellerId, "SELLER_PENDING");
      const available = await ensureSellerAccount(tx, income.sellerId, "SELLER_AVAILABLE");
      await post(tx, { transactionType:"INCOME_AVAILABLE", sourceType:"ORDER", sourceId:income.orderId, idempotencyKey:`finance:income-available:${income.id}`, description:"待结算收益转为可提现", traceId, entries:[{accountId:pending.id,side:"DEBIT",amountCent:remaining,memo:"减少待结算"},{accountId:available.id,side:"CREDIT",amountCent:remaining,memo:"增加可提现"}] });
      await tx.update(sellerIncomes).set({ status:"AVAILABLE", availableAmountCent:income.availableAmountCent + remaining, availableAt:new Date(), version:sql`${sellerIncomes.version} + 1`, updatedAt:new Date() }).where(and(eq(sellerIncomes.id,income.id),eq(sellerIncomes.version,income.version)));
      await this.offsetLiabilitiesTx(tx, income.id, traceId);
      return true;
    });
  }

  async resumePendingIncome(executor: DatabaseTransaction, orderId: string, resolutionKey: string) {
    const [income] = await executor.select().from(sellerIncomes).where(eq(sellerIncomes.orderId, orderId)).limit(1).for("update");
    if (!income || income.status !== "PENDING_SETTLEMENT") return;
    await executor.insert(scheduledJobs).values({ id: uuidv7(), jobKey: `finance:income-resume:${income.id}:${resolutionKey}`, jobType: FINANCE_JOB_TYPES.INCOME_AVAILABLE, targetType: "ORDER", targetId: orderId, payloadJson: { income_id: income.id }, runAt: new Date(Math.max(Date.now(), income.settlementAvailableAt.getTime())), maxAttempts: 8 }).onConflictDoNothing();
  }

  async recordRefund(executor: DatabaseTransaction, refund: RefundRow, order: OrderRow, amountCent: bigint, previousOrderRefundedCent: bigint, traceId?: string): Promise<{ liabilityCent: bigint }> {
    if (refund.status !== "REFUNDED" || !refund.completedAt || refund.orderId !== order.id || amountCent !== (refund.approvedAmountCent ?? refund.requestedAmountCent)) throw new Error("Only a confirmed order refund can adjust the ledger");
    await executor.select({id:orders.id}).from(orders).where(eq(orders.id,order.id)).for("update");
    const [postedRefund] = await executor.select({id:ledgerTransactions.id}).from(ledgerTransactions).where(and(eq(ledgerTransactions.sourceId,refund.id),inArray(ledgerTransactions.idempotencyKey,[`finance:refund:${refund.id}`,`finance:liability:${refund.id}`]))).limit(1);
    if (postedRefund) {
      const [liability] = await executor.select().from(sellerLiabilities).where(eq(sellerLiabilities.refundId,refund.id)).limit(1);
      return {liabilityCent:liability?.originalAmountCent ?? 0n};
    }
    let [income] = await executor.select().from(sellerIncomes).where(eq(sellerIncomes.orderId, order.id)).limit(1).for("update");
    // A V3.1 refund terminates the remaining obligation, including refunds before first settlement.
    // Post the original gross split and explicit adjustments in this same transaction; never rewrite ledger entries.
    if (!income && order.ruleVersion === "V3.1") income = await this.recordOrderCompleted(executor, {...order,afterSaleStatus:"RESOLVED",paymentStatus:"PAID",completedAt:order.completedAt ?? refund.completedAt},traceId);
    if (!income) return { liabilityCent: 0n };
    const v31 = order.ruleVersion === "V3.1";
    if (v31 && income.platformFeeCent > 0n) {
      const fee = income.platformFeeCent;
      const commission = await ensureSystemAccount(executor,"platform-commission","PLATFORM_COMMISSION","PLATFORM");
      const wasAvailable = income.availableAt !== null;
      const seller = await ensureSellerAccount(executor,income.sellerId,wasAvailable ? "SELLER_AVAILABLE" : "SELLER_PENDING");
      await post(executor,{transactionType:"ADJUSTMENT",sourceType:"REFUND",sourceId:refund.id,idempotencyKey:`finance:fee-waiver:${order.id}`,description:"V3.1 真实订单退款：整单佣金冲正",traceId,entries:[{accountId:commission.id,side:"DEBIT",amountCent:fee,memo:"冲回整单佣金"},{accountId:seller.id,side:"CREDIT",amountCent:fee,memo:"返还商家原佣金"}]});
      [income] = await executor.update(sellerIncomes).set({status:wasAvailable ? "AVAILABLE" : income.status,platformFeeCent:0n,sellerAmountCent:income.sellerAmountCent+fee,availableAmountCent:income.availableAmountCent+(wasAvailable?fee:0n),version:sql`${sellerIncomes.version} + 1`,updatedAt:new Date()}).where(eq(sellerIncomes.id,income.id)).returning();
    }
    const cumulativeSellerRefund = (previousOrderRefundedCent + amountCent) * order.sellerIncomeCent / order.paidAmountCent;
    const priorSellerRefund = previousOrderRefundedCent * order.sellerIncomeCent / order.paidAmountCent;
    let sellerRefund = v31 ? amountCent : cumulativeSellerRefund - priorSellerRefund;
    const platformRefund = amountCent - sellerRefund;
    const clearing = await ensureSystemAccount(executor, "refund-clearing", "REFUND_CLEARING", "CLEARING");
    const debitEntries: LedgerTemplateEntry[] = [];
    if (platformRefund > 0n) { const commission = await ensureSystemAccount(executor,"platform-commission","PLATFORM_COMMISSION","PLATFORM"); debitEntries.push({accountId:commission.id,side:"DEBIT",amountCent:platformRefund,memo:"退回平台佣金"}); }
    const availableTaken = min(sellerRefund, income.availableAmountCent); sellerRefund -= availableTaken;
    if (availableTaken > 0n) { const account=await ensureSellerAccount(executor,income.sellerId,"SELLER_AVAILABLE"); debitEntries.push({accountId:account.id,side:"DEBIT",amountCent:availableTaken,memo:"扣减可提现收益"}); }
    const implicitPending = income.sellerAmountCent - income.availableAmountCent - income.lockedAmountCent - income.withdrawnAmountCent - income.reversedAmountCent;
    const pendingTaken = min(sellerRefund, implicitPending); sellerRefund -= pendingTaken;
    if (pendingTaken > 0n) { const account=await ensureSellerAccount(executor,income.sellerId,"SELLER_PENDING"); debitEntries.push({accountId:account.id,side:"DEBIT",amountCent:pendingTaken,memo:"扣减待结算收益"}); }
    const liabilityCent = sellerRefund;
    const immediatelyReversed = availableTaken + pendingTaken;
    if (platformRefund + immediatelyReversed > 0n) await post(executor,{transactionType:"REFUND",sourceType:"REFUND",sourceId:refund.id,idempotencyKey:`finance:refund:${refund.id}`,description:`退款 ${refund.refundNo} 财务冲减`,traceId,entries:[...debitEntries,{accountId:clearing.id,side:"CREDIT",amountCent:platformRefund+immediatelyReversed,memo:"退款清算"}]});
    if (immediatelyReversed > 0n) await executor.update(sellerIncomes).set({ availableAmountCent:income.availableAmountCent-availableTaken, reversedAmountCent:income.reversedAmountCent+immediatelyReversed, status:income.sellerAmountCent === income.reversedAmountCent+immediatelyReversed ? "REVERSED" : income.status, reversedAt:new Date(), version:sql`${sellerIncomes.version} + 1`, updatedAt:new Date() }).where(eq(sellerIncomes.id,income.id));
    if (liabilityCent > 0n) await this.createLiabilityTx(executor, refund, income.sellerId, liabilityCent, clearing.id, traceId);
    return { liabilityCent };
  }

  async reverse(executor: DatabaseTransaction, transactionId: string, reason: string, traceId?: string) {
    const [original] = await executor.select().from(ledgerTransactions).where(eq(ledgerTransactions.id,transactionId)).limit(1).for("update");
    if (!original || original.status !== "POSTED") throw new Error("Only a posted ledger transaction can be reversed.");
    const entries = await executor.select().from(ledgerEntries).where(eq(ledgerEntries.transactionId,transactionId));
    const reversal = await post(executor,{transactionType:"REVERSAL",sourceType:original.sourceType,sourceId:original.sourceId,idempotencyKey:`finance:reversal:${transactionId}`,description:reason,traceId,reversalOfTransactionId:transactionId,entries:entries.map((entry)=>({accountId:entry.accountId,side:entry.side==="DEBIT"?"CREDIT":"DEBIT",amountCent:entry.amountCent,memo:`冲正：${entry.memo??original.description}`}))});
    await executor.update(ledgerTransactions).set({status:"REVERSED"}).where(and(eq(ledgerTransactions.id,transactionId),eq(ledgerTransactions.status,"POSTED")));
    return reversal;
  }

  private async createLiabilityTx(tx: DatabaseTransaction, refund: RefundRow, sellerId: string, amountCent: bigint, clearingAccountId: string, traceId?: string) {
    const existing=(await tx.select().from(sellerLiabilities).where(eq(sellerLiabilities.refundId,refund.id)).limit(1))[0]; if(existing)return existing;
    const liabilityAccount=await ensureSellerAccount(tx,sellerId,"SELLER_LIABILITY");
    const transaction=await post(tx,{transactionType:"LIABILITY_CREATED",sourceType:"REFUND",sourceId:refund.id,idempotencyKey:`finance:liability:${refund.id}`,description:`已提现收益退款形成欠款 ${refund.refundNo}`,traceId,entries:[{accountId:liabilityAccount.id,side:"DEBIT",amountCent,memo:"陪玩应偿欠款"},{accountId:clearingAccountId,side:"CREDIT",amountCent,memo:"退款清算"}]});
    const [liability]=await tx.insert(sellerLiabilities).values({id:uuidv7(),liabilityNo:externalNo("LB"),sellerId,refundId:refund.id,ledgerTransactionId:transaction.id,originalAmountCent:amountCent,outstandingAmountCent:amountCent}).returning(); return liability!;
  }

  private async offsetLiabilitiesTx(tx: DatabaseTransaction, incomeId: string, traceId?: string) {
    const [income]=await tx.select().from(sellerIncomes).where(eq(sellerIncomes.id,incomeId)).limit(1).for("update"); if(!income||income.availableAmountCent<=0n)return;
    const liabilities=await tx.select().from(sellerLiabilities).where(and(eq(sellerLiabilities.sellerId,income.sellerId),inArray(sellerLiabilities.status,["OPEN","PARTIALLY_OFFSET"]))).orderBy(asc(sellerLiabilities.createdAt),asc(sellerLiabilities.id)).for("update");
    let remaining=income.availableAmountCent; let total=0n;
    for(const liability of liabilities){if(remaining<=0n)break;const amount=min(remaining,liability.outstandingAmountCent);if(amount<=0n)continue;const available=await ensureSellerAccount(tx,income.sellerId,"SELLER_AVAILABLE");const liabilityAccount=await ensureSellerAccount(tx,income.sellerId,"SELLER_LIABILITY");const transaction=await post(tx,{transactionType:"LIABILITY_OFFSET",sourceType:"REFUND",sourceId:liability.refundId,idempotencyKey:`finance:liability-offset:${liability.id}:${income.id}`,description:`后续收益抵扣欠款 ${liability.liabilityNo}`,traceId,entries:[{accountId:available.id,side:"DEBIT",amountCent:amount,memo:"扣减可用收益"},{accountId:liabilityAccount.id,side:"CREDIT",amountCent:amount,memo:"偿还陪玩欠款"}]});await tx.insert(sellerLiabilityAllocations).values({id:uuidv7(),liabilityId:liability.id,incomeId:income.id,ledgerTransactionId:transaction.id,amountCent:amount});const outstanding=liability.outstandingAmountCent-amount;await tx.update(sellerLiabilities).set({outstandingAmountCent:outstanding,status:outstanding===0n?"SETTLED":"PARTIALLY_OFFSET",riskHold:outstanding!==0n,settledAt:outstanding===0n?new Date():null,version:sql`${sellerLiabilities.version} + 1`,updatedAt:new Date()}).where(eq(sellerLiabilities.id,liability.id));remaining-=amount;total+=amount;}
    if(total>0n)await tx.update(sellerIncomes).set({availableAmountCent:income.availableAmountCent-total,reversedAmountCent:income.reversedAmountCent+total,status:remaining===0n?"REVERSED":"AVAILABLE",reversedAt:new Date(),version:sql`${sellerIncomes.version} + 1`,updatedAt:new Date()}).where(eq(sellerIncomes.id,income.id));
  }
}

export async function ensureSellerLedgerAccount(executor:Executor,sellerId:string,accountType:AccountType){await executor.insert(ledgerAccounts).values({id:uuidv7(),ownerType:"SELLER",sellerId,accountType}).onConflictDoNothing();const [row]=await executor.select().from(ledgerAccounts).where(and(eq(ledgerAccounts.sellerId,sellerId),eq(ledgerAccounts.accountType,accountType))).limit(1);if(!row)throw new Error("Seller ledger account missing.");return row;}
export async function ensureSystemLedgerAccount(executor:Executor,systemKey:string,accountType:AccountType,ownerType:"PLATFORM"|"CLEARING"){await executor.insert(ledgerAccounts).values({id:uuidv7(),ownerType,systemKey,accountType}).onConflictDoNothing();const [row]=await executor.select().from(ledgerAccounts).where(and(eq(ledgerAccounts.systemKey,systemKey),eq(ledgerAccounts.accountType,accountType))).limit(1);if(!row)throw new Error("System ledger account missing.");return row;}
export async function postLedgerTransaction(executor:Executor,input:{transactionType:TransactionType;sourceType:SourceType;sourceId:string;idempotencyKey:string;description:string;traceId?:string;reversalOfTransactionId?:string;entries:LedgerTemplateEntry[]}){const debits=input.entries.filter((v)=>v.side==="DEBIT").reduce((v,e)=>v+e.amountCent,0n);const credits=input.entries.filter((v)=>v.side==="CREDIT").reduce((v,e)=>v+e.amountCent,0n);if(debits<=0n||debits!==credits)throw new Error("Ledger template is not balanced.");const existing=(await executor.select().from(ledgerTransactions).where(eq(ledgerTransactions.idempotencyKey,input.idempotencyKey)).limit(1))[0];if(existing)return existing;const id=uuidv7();const [created]=await executor.insert(ledgerTransactions).values({id,transactionNo:externalNo("LT"),transactionType:input.transactionType,status:"PENDING",sourceType:input.sourceType,sourceId:input.sourceId,idempotencyKey:input.idempotencyKey,reversalOfTransactionId:input.reversalOfTransactionId,description:input.description,traceId:input.traceId,occurredAt:new Date()}).returning();await executor.insert(ledgerEntries).values(input.entries.map((entry)=>({id:uuidv7(),transactionId:id,...entry})));const [posted]=await executor.update(ledgerTransactions).set({status:"POSTED",postedAt:new Date()}).where(and(eq(ledgerTransactions.id,id),eq(ledgerTransactions.status,"PENDING"))).returning();return posted??created!;}
const ensureSellerAccount=ensureSellerLedgerAccount;
const ensureSystemAccount=ensureSystemLedgerAccount;
const post=postLedgerTransaction;
async function configInteger(executor:Executor,key:string){const [row]=await executor.select({value:platformConfigs.valueJson}).from(platformConfigs).where(and(eq(platformConfigs.configKey,key),eq(platformConfigs.status,"ACTIVE"))).limit(1);const value=typeof row?.value==="number"?row.value:typeof row?.value==="object"&&row.value!==null&&"value" in row.value?Number((row.value as {value:unknown}).value):NaN;if(!Number.isInteger(value)||value<0)throw new Error(`Active integer platform config missing: ${key}`);return value;}
function min(left:bigint,right:bigint){return left<right?left:right;}
function externalNo(prefix:string){return `${prefix}${new Date().toISOString().slice(0,10).replaceAll("-","")}${uuidv7().replaceAll("-","").slice(-16).toUpperCase()}`;}
