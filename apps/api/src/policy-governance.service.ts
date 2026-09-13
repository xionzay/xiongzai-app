import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { OutboxService } from "@xiongzai/application";
import { AppError, errorCodes, type PolicyType } from "@xiongzai/contracts";
import { adminOperationLogs, policyVersions, userPolicyAcceptances, uuidv7, type DatabaseClient, type DatabaseTransaction } from "@xiongzai/database";
import { and, desc, eq, sql } from "drizzle-orm";
import type { RequestMetadata } from "./identity-user.service.js";
import { DATABASE_CLIENT } from "./tokens.js";

type PolicyStatus = typeof policyVersions.$inferSelect.status;

@Injectable()
export class PolicyGovernanceService {
  private readonly outbox = new OutboxService();

  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async list(input: { policyType?: PolicyType; status?: PolicyStatus }) {
    const rows = await this.database.db.select({ policy: policyVersions, acceptanceCount: policyAcceptanceCount() }).from(policyVersions).where(and(
      input.policyType ? eq(policyVersions.policyType, input.policyType) : undefined,
      input.status ? eq(policyVersions.status, input.status) : undefined,
    )).orderBy(policyVersions.policyType, desc(policyVersions.versionNo));
    return rows.map((row) => adminPolicyView(row.policy, row.acceptanceCount));
  }

  async history(policyType: PolicyType) {
    const rows = await this.database.db.select({ policy: policyVersions, acceptanceCount: policyAcceptanceCount() }).from(policyVersions)
      .where(eq(policyVersions.policyType, policyType)).orderBy(desc(policyVersions.versionNo));
    return rows.map((row) => adminPolicyView(row.policy, row.acceptanceCount));
  }

  async detail(policyVersionId: string) {
    const [row] = await this.database.db.select({ policy: policyVersions, acceptanceCount: policyAcceptanceCount() }).from(policyVersions)
      .where(eq(policyVersions.id, policyVersionId)).limit(1);
    if (!row) throw new AppError({ code: errorCodes.POLICY_NOT_FOUND, message: "协议版本不存在", statusCode: 404 });
    return adminPolicyView(row.policy, row.acceptanceCount);
  }

  async createDraft(adminId: string, input: { policyType: PolicyType; title: string; content: string; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      await lockPolicyType(tx, input.policyType);
      const [latest] = await tx.select({ versionNo: policyVersions.versionNo }).from(policyVersions)
        .where(eq(policyVersions.policyType, input.policyType)).orderBy(desc(policyVersions.versionNo)).limit(1);
      const [created] = await tx.insert(policyVersions).values({
        id: uuidv7(), policyType: input.policyType, title: input.title, content: input.content,
        versionNo: (latest?.versionNo ?? 0) + 1, status: "DRAFT", createdByAdminId: adminId,
      }).returning();
      await this.audit(tx, adminId, "POLICY_DRAFT_CREATED", created!.id, input.reason, null, policyAuditSnapshot(created!), metadata);
      return adminPolicyView(created!);
    });
  }

  async editDraft(adminId: string, policyVersionId: string, input: { title: string; content: string; version: string; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const current = await lockPolicyVersion(tx, policyVersionId);
      assertVersion(current, input.version);
      if (current.status !== "DRAFT") throw immutablePolicy();
      const [updated] = await tx.update(policyVersions).set({ title: input.title, content: input.content })
        .where(and(eq(policyVersions.id, current.id), eq(policyVersions.status, "DRAFT"))).returning();
      if (!updated) throw versionConflict();
      await this.audit(tx, adminId, "POLICY_DRAFT_EDITED", current.id, input.reason, policyAuditSnapshot(current), policyAuditSnapshot(updated), metadata);
      return adminPolicyView(updated);
    });
  }

  async publish(adminId: string, policyVersionId: string, input: { effectiveAt: Date; requiresReacceptance: boolean; version: string; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const current = await lockPolicyVersion(tx, policyVersionId);
      assertVersion(current, input.version);
      if (current.status !== "DRAFT") throw immutablePolicy();
      const now = new Date();
      const [updated] = await tx.update(policyVersions).set({
        status: "PUBLISHED", publishedAt: now, effectiveAt: input.effectiveAt,
        requiresReacceptance: input.requiresReacceptance,
      }).where(and(eq(policyVersions.id, current.id), eq(policyVersions.status, "DRAFT"))).returning();
      if (!updated) throw versionConflict();
      await this.audit(tx, adminId, "POLICY_PUBLISHED", current.id, input.reason, policyAuditSnapshot(current), policyAuditSnapshot(updated), metadata);
      await this.outbox.enqueue(tx, { aggregateType: "PLATFORM", aggregateId: current.id, eventType: "PolicyPublished", payload: { policy_version_id: current.id, policy_type: current.policyType, version_no: current.versionNo } });
      return adminPolicyView(updated);
    });
  }

  async retire(adminId: string, policyVersionId: string, input: { version: string; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const current = await lockPolicyVersion(tx, policyVersionId);
      assertVersion(current, input.version);
      if (current.status !== "PUBLISHED") throw new AppError({ code: "POLICY_STATUS_INVALID", message: "只有已发布协议可以停用", statusCode: 409 });
      const [updated] = await tx.update(policyVersions).set({ status: "RETIRED" })
        .where(and(eq(policyVersions.id, current.id), eq(policyVersions.status, "PUBLISHED"))).returning();
      if (!updated) throw versionConflict();
      await this.audit(tx, adminId, "POLICY_RETIRED", current.id, input.reason, policyAuditSnapshot(current), policyAuditSnapshot(updated), metadata);
      await this.outbox.enqueue(tx, { aggregateType: "PLATFORM", aggregateId: current.id, eventType: "PolicyRetired", payload: { policy_version_id: current.id, policy_type: current.policyType, version_no: current.versionNo } });
      return adminPolicyView(updated);
    });
  }

  private async audit(tx: DatabaseTransaction, adminId: string, action: string, targetId: string, reason: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, metadata: RequestMetadata) {
    await tx.insert(adminOperationLogs).values({
      id: uuidv7(), adminId, action, targetType: "PLATFORM", targetId, reason,
      beforeJson: before, afterJson: after, requestId: metadata.requestId, traceId: metadata.traceId,
      ip: metadata.ip, userAgent: metadata.userAgent,
    });
  }
}

async function lockPolicyType(tx: DatabaseTransaction, policyType: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${policyType}, 0))`);
}

async function lockPolicyVersion(tx: DatabaseTransaction, id: string) {
  const [row] = await tx.select().from(policyVersions).where(eq(policyVersions.id, id)).limit(1).for("update");
  if (!row) throw new AppError({ code: errorCodes.POLICY_NOT_FOUND, message: "协议版本不存在", statusCode: 404 });
  return row;
}

function versionOf(row: typeof policyVersions.$inferSelect) {
  return createHash("sha256").update(JSON.stringify({
    id: row.id, type: row.policyType, title: row.title, content: row.content, versionNo: row.versionNo,
    status: row.status, publishedAt: row.publishedAt?.toISOString() ?? null,
    effectiveAt: row.effectiveAt?.toISOString() ?? null, requiresReacceptance: row.requiresReacceptance,
  })).digest("base64url");
}

function assertVersion(row: typeof policyVersions.$inferSelect, version: string) {
  if (versionOf(row) !== version) throw versionConflict();
}

function policyAcceptanceCount() {
  return sql<number>`(select count(*)::int from ${userPolicyAcceptances} where ${userPolicyAcceptances.policyVersionId} = ${policyVersions.id})`;
}

function adminPolicyView(row: typeof policyVersions.$inferSelect, acceptanceCount = 0) {
  return {
    id: row.id, policy_type: row.policyType, title: row.title, content: row.content,
    version_no: row.versionNo, status: row.status, published_at: row.publishedAt,
    effective_at: row.effectiveAt, requires_reacceptance: row.requiresReacceptance,
    acceptance_count: acceptanceCount,
    created_by_admin_id: row.createdByAdminId, created_at: row.createdAt, version: versionOf(row),
  };
}

function policyAuditSnapshot(row: typeof policyVersions.$inferSelect) {
  return { policy_type: row.policyType, version_no: row.versionNo, status: row.status, title: row.title, content_sha256: createHash("sha256").update(row.content).digest("hex"), effective_at: row.effectiveAt, requires_reacceptance: row.requiresReacceptance };
}

function immutablePolicy() { return new AppError({ code: "POLICY_VERSION_IMMUTABLE", message: "已发布或已被接受的协议版本禁止覆盖修改", statusCode: 409 }); }
function versionConflict() { return new AppError({ code: errorCodes.RESOURCE_VERSION_CONFLICT, message: "协议已被其他操作更新，请刷新后重试", statusCode: 409 }); }
