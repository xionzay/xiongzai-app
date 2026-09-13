import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  accountCancellationStatusEnum,
  adminStatusEnum,
  afterSaleStatusEnum,
  availabilitySlotStatusEnum,
  complaintStatusEnum,
  complaintTargetTypeEnum,
  configStatusEnum,
  contentModerationStatusEnum,
  conversationMemberRoleEnum,
  conversationTypeEnum,
  deliveryChannelEnum,
  deliveryStatusEnum,
  deviceTypeEnum,
  favoriteTargetTypeEnum,
  fileTypeEnum,
  fileUploadStatusEnum,
  fileUsageTypeEnum,
  fileVisibilityEnum,
  idempotencyStatusEnum,
  identityVerificationStatusEnum,
  inboxStatusEnum,
  ledgerAccountTypeEnum,
  ledgerOwnerTypeEnum,
  ledgerSideEnum,
  ledgerTransactionStatusEnum,
  ledgerTransactionTypeEnum,
  messageSendStatusEnum,
  messageTypeEnum,
  mfaTypeEnum,
  notificationCategoryEnum,
  notificationReadStatusEnum,
  operatorRoleEnum,
  orderStatusEnum,
  outboxStatusEnum,
  paymentChannelEnum,
  paymentStatusEnum,
  personalDataExportStatusEnum,
  phoneChangeRequestStatusEnum,
  payoutAccountTypeEnum,
  payoutVerificationStatusEnum,
  policyAcceptanceSceneEnum,
  policyConfirmationMethodEnum,
  policyStatusEnum,
  productReviewActionEnum,
  productStatusEnum,
  ratingSubjectTypeEnum,
  reconciliationItemStatusEnum,
  reconciliationRunStatusEnum,
  refundDecisionEnum,
  refundStatusEnum,
  relatedObjectTypeEnum,
  reservationStatusEnum,
  reviewStatusEnum,
  riskEventStatusEnum,
  riskStatusEnum,
  scheduledJobStatusEnum,
  securityEventStatusEnum,
  sellerApplicationStatusEnum,
  sellerIncomeStatusEnum,
  sellerLiabilityStatusEnum,
  sellerReviewActionEnum,
  sellerStatusEnum,
  skuStatusEnum,
  supportCaseActionEnum,
  supportCaseStatusEnum,
  supportPriorityEnum,
  userStatusEnum,
  withdrawalStatusEnum,
} from "./enums.js";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const money = (name: string) => bigint(name, { mode: "bigint" });

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    phoneCiphertext: text("phone_ciphertext").notNull(),
    phoneHash: char("phone_hash", { length: 64 }).notNull(),
    phoneMask: varchar("phone_mask", { length: 32 }).notNull(),
    status: userStatusEnum("status").default("NORMAL").notNull(),
    profileInitialized: boolean("profile_initialized").default(false).notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("users_phone_hash_uq").on(table.phoneHash),
    index("users_status_idx").on(table.status),
    index("users_status_created_id_idx").on(table.status, table.createdAt, table.id),
    index("users_last_active_idx").on(table.lastActiveAt),
  ],
);

export const adminAccounts = pgTable(
  "admin_accounts",
  {
    id: uuid("id").primaryKey(),
    username: varchar("username", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 64 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    status: adminStatusEnum("status").default("ACTIVE").notNull(),
    mfaRequired: boolean("mfa_required").default(true).notNull(),
    failedLoginCount: integer("failed_login_count").default(0).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("admin_accounts_username_uq").on(table.username), index("admin_accounts_status_idx").on(table.status)],
);

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").primaryKey(),
    adminId: uuid("admin_id").notNull().references(() => adminAccounts.id, { onDelete: "restrict" }),
    sessionTokenHash: char("session_token_hash", { length: 64 }).notNull(),
    ip: varchar("ip", { length: 64 }).notNull(),
    userAgent: text("user_agent").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("admin_sessions_token_uq").on(table.sessionTokenHash), index("admin_sessions_admin_idx").on(table.adminId, table.expiresAt)],
);

export const adminMfaFactors = pgTable(
  "admin_mfa_factors",
  {
    id: uuid("id").primaryKey(),
    adminId: uuid("admin_id").notNull().references(() => adminAccounts.id, { onDelete: "cascade" }),
    factorType: mfaTypeEnum("factor_type").notNull(),
    secretCiphertext: text("secret_ciphertext"),
    credentialIdHash: char("credential_id_hash", { length: 64 }),
    label: varchar("label", { length: 64 }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("admin_mfa_admin_idx").on(table.adminId)],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    bucket: varchar("bucket", { length: 128 }).notNull(),
    objectKey: text("object_key").notNull(),
    fileType: fileTypeEnum("file_type").notNull(),
    mimeType: varchar("mime_type", { length: 128 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "bigint" }).notNull(),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    sha256: char("sha256", { length: 64 }).notNull(),
    uploadStatus: fileUploadStatusEnum("upload_status").default("PENDING").notNull(),
    moderationStatus: contentModerationStatusEnum("moderation_status").default("PENDING").notNull(),
    visibility: fileVisibilityEnum("visibility").default("PRIVATE").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("files_bucket_object_uq").on(table.bucket, table.objectKey),
    index("files_owner_idx").on(table.ownerUserId, table.createdAt),
    index("files_sha256_idx").on(table.sha256),
    index("files_admin_queue_created_id_idx").on(table.uploadStatus, table.moderationStatus, table.createdAt, table.id).where(sql`${table.deletedAt} IS NULL`),
    check("files_size_positive", sql`${table.sizeBytes} > 0`),
    check(
      "files_voice_metadata_valid",
      sql`${table.fileType} <> 'VOICE_SAMPLE' OR (${table.mimeType} IN ('audio/aac', 'audio/mp4', 'audio/mpeg') AND (${table.uploadStatus} <> 'VERIFIED' OR ${table.durationMs} BETWEEN 10000 AND 30000))`,
    ),
  ],
);

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    nickname: varchar("nickname", { length: 32 }).notNull(),
    avatarFileId: uuid("avatar_file_id").references(() => files.id, { onDelete: "set null" }),
    bio: varchar("bio", { length: 280 }),
    publicUserNo: varchar("public_user_no", { length: 32 }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("user_profiles_public_no_uq").on(table.publicUserNo), index("user_profiles_nickname_idx").on(table.nickname)],
);

export const identityVerifications = pgTable(
  "identity_verifications",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerReference: varchar("provider_reference", { length: 128 }).notNull(),
    legalNameCiphertext: text("legal_name_ciphertext").notNull(),
    legalNameHash: char("legal_name_hash", { length: 64 }).notNull(),
    legalNameMask: varchar("legal_name_mask", { length: 64 }).notNull(),
    documentCiphertext: text("document_ciphertext").notNull(),
    documentHash: char("document_hash", { length: 64 }).notNull(),
    documentMask: varchar("document_mask", { length: 64 }).notNull(),
    status: identityVerificationStatusEnum("status").default("PENDING").notNull(),
    rejectionCode: varchar("rejection_code", { length: 64 }),
    rejectionReason: text("rejection_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("identity_provider_reference_uq").on(table.provider, table.providerReference),
    index("identity_user_status_idx").on(table.userId, table.status),
    index("identity_document_hash_idx").on(table.documentHash),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: char("refresh_token_hash", { length: 64 }).notNull(),
    deviceId: varchar("device_id", { length: 128 }).notNull(),
    deviceType: deviceTypeEnum("device_type").notNull(),
    ip: varchar("ip", { length: 64 }).notNull(),
    userAgent: text("user_agent").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("auth_sessions_refresh_hash_uq").on(table.refreshTokenHash), index("auth_sessions_user_idx").on(table.userId, table.expiresAt)],
);

export const smsCodes = pgTable(
  "sms_codes",
  {
    id: uuid("id").primaryKey(),
    phoneHash: char("phone_hash", { length: 64 }).notNull(),
    purpose: varchar("purpose", { length: 32 }).notNull(),
    codeHash: char("code_hash", { length: 64 }).notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("sms_codes_lookup_idx").on(table.phoneHash, table.purpose, table.expiresAt), check("sms_attempts_valid", sql`${table.attemptCount} >= 0 AND ${table.maxAttempts} > 0`)],
);

export const phoneChangeRequests = pgTable(
  "phone_change_requests",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    oldPhoneCiphertext: text("old_phone_ciphertext").notNull(),
    oldPhoneHash: char("old_phone_hash", { length: 64 }).notNull(),
    oldPhoneMask: varchar("old_phone_mask", { length: 32 }).notNull(),
    newPhoneCiphertext: text("new_phone_ciphertext").notNull(),
    newPhoneHash: char("new_phone_hash", { length: 64 }).notNull(),
    newPhoneMask: varchar("new_phone_mask", { length: 32 }).notNull(),
    oldSmsCodeId: uuid("old_sms_code_id").references(() => smsCodes.id, { onDelete: "restrict" }),
    newSmsCodeId: uuid("new_sms_code_id").references(() => smsCodes.id, { onDelete: "restrict" }),
    status: phoneChangeRequestStatusEnum("status").default("PENDING_OLD_VERIFICATION").notNull(),
    oldAttemptCount: integer("old_attempt_count").default(0).notNull(),
    newAttemptCount: integer("new_attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    userVersionAtRequest: integer("user_version_at_request").notNull(),
    oldVerifiedAt: timestamp("old_verified_at", { withTimezone: true }),
    newVerifiedAt: timestamp("new_verified_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("phone_change_requests_user_idempotency_uq").on(table.userId, table.idempotencyKey),
    uniqueIndex("phone_change_requests_one_active_user_uq")
      .on(table.userId)
      .where(sql`${table.status} IN ('PENDING_OLD_VERIFICATION','PENDING_NEW_VERIFICATION','READY')`),
    uniqueIndex("phone_change_requests_one_active_new_phone_uq")
      .on(table.newPhoneHash)
      .where(sql`${table.status} IN ('PENDING_OLD_VERIFICATION','PENDING_NEW_VERIFICATION','READY')`),
    uniqueIndex("phone_change_requests_old_sms_code_uq")
      .on(table.oldSmsCodeId)
      .where(sql`${table.oldSmsCodeId} IS NOT NULL`),
    uniqueIndex("phone_change_requests_new_sms_code_uq")
      .on(table.newSmsCodeId)
      .where(sql`${table.newSmsCodeId} IS NOT NULL`),
    index("phone_change_requests_user_created_idx").on(table.userId, table.createdAt, table.id),
    index("phone_change_requests_expiry_idx").on(table.status, table.expiresAt, table.id),
    check("phone_change_requests_distinct_phones", sql`${table.oldPhoneHash} <> ${table.newPhoneHash}`),
    check(
      "phone_change_requests_sensitive_values_present",
      sql`length(btrim(${table.oldPhoneCiphertext})) > 0 AND length(btrim(${table.newPhoneCiphertext})) > 0 AND length(btrim(${table.oldPhoneHash})) = 64 AND length(btrim(${table.newPhoneHash})) = 64 AND length(btrim(${table.oldPhoneMask})) > 0 AND length(btrim(${table.newPhoneMask})) > 0`,
    ),
    check(
      "phone_change_requests_attempts_valid",
      sql`${table.oldAttemptCount} BETWEEN 0 AND ${table.maxAttempts} AND ${table.newAttemptCount} BETWEEN 0 AND ${table.maxAttempts} AND ${table.maxAttempts} > 0`,
    ),
    check(
      "phone_change_requests_versions_valid",
      sql`${table.version} >= 0 AND ${table.userVersionAtRequest} >= 0`,
    ),
    check("phone_change_requests_expiry_valid", sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      "phone_change_requests_sms_verification_pairs",
      sql`(${table.oldSmsCodeId} IS NULL) = (${table.oldVerifiedAt} IS NULL) AND (${table.newSmsCodeId} IS NULL) = (${table.newVerifiedAt} IS NULL) AND (${table.oldSmsCodeId} IS NULL OR ${table.newSmsCodeId} IS NULL OR ${table.oldSmsCodeId} <> ${table.newSmsCodeId})`,
    ),
    check(
      "phone_change_requests_state_consistent",
      sql`(${table.status} = 'PENDING_OLD_VERIFICATION' AND ${table.oldVerifiedAt} IS NULL AND ${table.newVerifiedAt} IS NULL AND ${table.completedAt} IS NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} = 'PENDING_NEW_VERIFICATION' AND ${table.oldVerifiedAt} IS NOT NULL AND ${table.newVerifiedAt} IS NULL AND ${table.completedAt} IS NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} = 'READY' AND ${table.oldVerifiedAt} IS NOT NULL AND ${table.newVerifiedAt} IS NOT NULL AND ${table.completedAt} IS NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} = 'COMPLETED' AND ${table.oldVerifiedAt} IS NOT NULL AND ${table.newVerifiedAt} IS NOT NULL AND ${table.completedAt} IS NOT NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} = 'CANCELLED' AND ${table.completedAt} IS NULL AND ${table.cancelledAt} IS NOT NULL) OR (${table.status} = 'EXPIRED' AND ${table.completedAt} IS NULL AND ${table.cancelledAt} IS NULL)`,
    ),
  ],
);

export const personalDataExportJobs = pgTable(
  "personal_data_export_jobs",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    status: personalDataExportStatusEnum("status").default("PENDING").notNull(),
    outputFileId: uuid("output_file_id").references(() => files.id, { onDelete: "restrict" }),
    failureCode: varchar("failure_code", { length: 64 }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("personal_data_export_jobs_user_idempotency_uq").on(table.userId, table.idempotencyKey),
    uniqueIndex("personal_data_export_jobs_one_active_user_uq")
      .on(table.userId)
      .where(sql`${table.status} IN ('PENDING','PROCESSING')`),
    uniqueIndex("personal_data_export_jobs_output_file_uq")
      .on(table.outputFileId)
      .where(sql`${table.outputFileId} IS NOT NULL`),
    index("personal_data_export_jobs_user_created_idx").on(table.userId, table.createdAt, table.id),
    index("personal_data_export_jobs_dispatch_idx").on(table.status, table.createdAt, table.id),
    index("personal_data_export_jobs_expiry_idx").on(table.status, table.expiresAt, table.id),
    check("personal_data_export_jobs_version_valid", sql`${table.version} >= 0`),
    check("personal_data_export_jobs_expiry_valid", sql`${table.expiresAt} > ${table.requestedAt}`),
    check(
      "personal_data_export_jobs_state_consistent",
      sql`(${table.status} = 'PENDING' AND ${table.startedAt} IS NULL AND ${table.finishedAt} IS NULL AND ${table.outputFileId} IS NULL AND ${table.failureCode} IS NULL) OR (${table.status} = 'PROCESSING' AND ${table.startedAt} IS NOT NULL AND ${table.finishedAt} IS NULL AND ${table.failureCode} IS NULL) OR (${table.status} = 'COMPLETED' AND ${table.startedAt} IS NOT NULL AND ${table.finishedAt} IS NOT NULL AND ${table.outputFileId} IS NOT NULL AND ${table.failureCode} IS NULL) OR (${table.status} = 'FAILED' AND ${table.finishedAt} IS NOT NULL AND ${table.failureCode} IS NOT NULL AND length(btrim(${table.failureCode})) > 0) OR (${table.status} = 'EXPIRED' AND ${table.finishedAt} IS NOT NULL AND ${table.outputFileId} IS NOT NULL AND ${table.failureCode} IS NULL)`,
    ),
  ],
);

export const userDevices = pgTable(
  "user_devices",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    deviceId: varchar("device_id", { length: 128 }).notNull(),
    deviceType: deviceTypeEnum("device_type").notNull(),
    pushTokenCiphertext: text("push_token_ciphertext"),
    pushTokenHash: char("push_token_hash", { length: 64 }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("user_devices_user_device_uq").on(table.userId, table.deviceId), index("user_devices_push_hash_idx").on(table.pushTokenHash)],
);

export const privacySettings = pgTable("privacy_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  showOnlineStatus: boolean("show_online_status").default(true).notNull(),
  showPublicProfile: boolean("show_public_profile").default(true).notNull(),
  personalizedRecommendations: boolean("personalized_recommendations").default(true).notNull(),
  version: integer("version").default(0).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey(),
  roleKey: varchar("role_key", { length: 64 }).notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  description: text("description"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("roles_key_uq").on(table.roleKey)]);

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey(),
  permissionKey: varchar("permission_key", { length: 128 }).notNull(),
  description: text("description"),
  highRisk: boolean("high_risk").default(false).notNull(),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("permissions_key_uq").on(table.permissionKey)]);

export const adminRoles = pgTable("admin_roles", {
  adminId: uuid("admin_id").notNull().references(() => adminAccounts.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  grantedByAdminId: uuid("granted_by_admin_id").references(() => adminAccounts.id, { onDelete: "set null" }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.adminId, table.roleId], name: "admin_roles_pk" })]);

export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (table) => [primaryKey({ columns: [table.roleId, table.permissionId], name: "role_permissions_pk" })]);

export const policyVersions = pgTable("policy_versions", {
  id: uuid("id").primaryKey(),
  policyType: varchar("policy_type", { length: 64 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  versionNo: integer("version_no").notNull(),
  status: policyStatusEnum("status").default("DRAFT").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  requiresReacceptance: boolean("requires_reacceptance").default(false).notNull(),
  createdByAdminId: uuid("created_by_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("policy_type_version_uq").on(table.policyType, table.versionNo),
  index("policy_status_idx").on(table.status, table.effectiveAt, table.publishedAt),
  check("policy_version_no_positive", sql`${table.versionNo} > 0`),
  check(
    "policy_published_timestamps_present",
    sql`${table.status} = 'DRAFT' OR (${table.publishedAt} IS NOT NULL AND ${table.effectiveAt} IS NOT NULL)`,
  ),
]);

export const userPolicyAcceptances = pgTable("user_policy_acceptances", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  policyVersionId: uuid("policy_version_id").notNull().references(() => policyVersions.id, { onDelete: "restrict" }),
  acceptanceScene: policyAcceptanceSceneEnum("acceptance_scene").default("LEGACY_UNSCOPED").notNull(),
  confirmationMethod: policyConfirmationMethodEnum("confirmation_method").default("ONLINE_CONFIRM").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
  ip: varchar("ip", { length: 64 }).notNull(),
  userAgent: text("user_agent").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.policyVersionId], name: "user_policy_acceptances_pk" }),
  index("user_policy_acceptances_scene_idx").on(table.userId, table.acceptanceScene, table.acceptedAt),
  check("user_policy_acceptances_evidence_present", sql`length(btrim(${table.ip})) > 0 AND length(btrim(${table.userAgent})) > 0`),
]);

export const sellerProfiles = pgTable(
  "seller_profiles",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    status: sellerStatusEnum("status").default("DRAFT").notNull(),
    sellerNickname: varchar("seller_nickname", { length: 32 }).notNull(),
    sellerAvatarFileId: uuid("seller_avatar_file_id").references(() => files.id, { onDelete: "set null" }),
    coverFileId: uuid("cover_file_id").references(() => files.id, { onDelete: "set null" }),
    introduction: varchar("introduction", { length: 1000 }),
    gameRank: varchar("game_rank", { length: 64 }),
    kd: numeric("kd", { precision: 6, scale: 2 }),
    preferredMode: varchar("preferred_mode", { length: 64 }),
    playStyle: varchar("play_style", { length: 128 }),
    gameExperience: varchar("game_experience", { length: 500 }),
    voiceFileId: uuid("voice_file_id").references(() => files.id, { onDelete: "set null" }),
    voiceAuthorizationPolicyVersionId: uuid("voice_authorization_policy_version_id").references(() => policyVersions.id, { onDelete: "restrict" }),
    voiceDurationMs: integer("voice_duration_ms"),
    acceptingOrders: boolean("accepting_orders").default(false).notNull(),
    ratingAvg: numeric("rating_avg", { precision: 3, scale: 2 }).default("0").notNull(),
    reviewCount: integer("review_count").default(0).notNull(),
    completedOrderCount: integer("completed_order_count").default(0).notNull(),
    favoriteCount: integer("favorite_count").default(0).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    suspendedReason: text("suspended_reason"),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("seller_profiles_user_uq").on(table.userId),
    index("seller_profiles_status_idx").on(table.status),
    index("seller_profiles_discovery_idx").on(table.status, table.acceptingOrders, table.ratingAvg),
    check("seller_voice_duration_valid", sql`${table.voiceDurationMs} IS NULL OR ${table.voiceDurationMs} BETWEEN 10000 AND 30000`),
    check("seller_rating_valid", sql`${table.ratingAvg} >= 0 AND ${table.ratingAvg} <= 5`),
  ],
);

export const sellerApplications = pgTable(
  "seller_applications",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id").notNull().references(() => sellerProfiles.id, { onDelete: "restrict" }),
    versionNo: integer("version_no").notNull(),
    onboardingPolicyVersionId: uuid("onboarding_policy_version_id").references(() => policyVersions.id, { onDelete: "restrict" }),
    snapshotJson: jsonb("snapshot_json").notNull(),
    status: sellerApplicationStatusEnum("status").default("DRAFT").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedByAdminId: uuid("reviewed_by_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    requiredFieldsJson: jsonb("required_fields_json"),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("seller_applications_version_uq").on(table.sellerId, table.versionNo),
    index("seller_applications_queue_idx").on(table.status, table.submittedAt),
    check("seller_application_version_positive", sql`${table.versionNo} > 0`),
  ],
);

export const sellerReviewLogs = pgTable(
  "seller_review_logs",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id").notNull().references(() => sellerProfiles.id, { onDelete: "restrict" }),
    applicationId: uuid("application_id").notNull().references(() => sellerApplications.id, { onDelete: "restrict" }),
    action: sellerReviewActionEnum("action").notNull(),
    oldStatus: sellerApplicationStatusEnum("old_status"),
    newStatus: sellerApplicationStatusEnum("new_status").notNull(),
    adminId: uuid("admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    reason: text("reason"),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("seller_review_logs_application_idx").on(table.applicationId, table.createdAt)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id").notNull().references(() => sellerProfiles.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 120 }).notNull(),
    description: text("description").notNull(),
    serviceTimeDescription: varchar("service_time_description", { length: 200 }),
    coverFileId: uuid("cover_file_id").references(() => files.id, { onDelete: "set null" }),
    status: productStatusEnum("status").default("DRAFT").notNull(),
    rejectionReason: text("rejection_reason"),
    ratingAvg: numeric("rating_avg", { precision: 3, scale: 2 }).default("0").notNull(),
    reviewCount: integer("review_count").default(0).notNull(),
    soldCount: integer("sold_count").default(0).notNull(),
    minPriceCent: money("min_price_cent").default(sql`0`).notNull(),
    currentVersionNo: integer("current_version_no").default(1).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("products_seller_status_idx").on(table.sellerId, table.status),
    index("products_status_approved_idx").on(table.status, table.approvedAt),
    index("products_price_idx").on(table.minPriceCent),
    index("products_sold_idx").on(table.soldCount),
    index("products_rating_idx").on(table.ratingAvg),
    check("products_min_price_nonnegative", sql`${table.minPriceCent} >= 0`),
    check("products_rating_valid", sql`${table.ratingAvg} >= 0 AND ${table.ratingAvg} <= 5`),
  ],
);

export const productVersions = pgTable(
  "product_versions",
  {
    id: uuid("id").primaryKey(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    versionNo: integer("version_no").notNull(),
    snapshotJson: jsonb("snapshot_json").notNull(),
    submittedByUserId: uuid("submitted_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("product_versions_product_version_uq").on(table.productId, table.versionNo), check("product_version_positive", sql`${table.versionNo} > 0`)],
);

export const productReviewLogs = pgTable(
  "product_review_logs",
  {
    id: uuid("id").primaryKey(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    productVersionId: uuid("product_version_id").references(() => productVersions.id, { onDelete: "restrict" }),
    action: productReviewActionEnum("action").notNull(),
    oldStatus: productStatusEnum("old_status"),
    newStatus: productStatusEnum("new_status").notNull(),
    adminId: uuid("admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    operatorUserId: uuid("operator_user_id").references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason"),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("product_review_logs_product_idx").on(table.productId, table.createdAt)],
);

export const productSkus = pgTable(
  "product_skus",
  {
    id: uuid("id").primaryKey(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    skuName: varchar("sku_name", { length: 100 }).notNull(),
    description: varchar("description", { length: 500 }),
    priceCent: money("price_cent").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    status: skuStatusEnum("status").default("ACTIVE").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("product_skus_product_status_idx").on(table.productId, table.status, table.sortOrder),
    check("product_skus_price_positive", sql`${table.priceCent} > 0`),
    check("product_skus_duration_positive", sql`${table.durationMinutes} > 0`),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    fileId: uuid("file_id").notNull().references(() => files.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    isCover: boolean("is_cover").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("product_images_sort_uq").on(table.productId, table.sortOrder).where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("product_images_cover_uq").on(table.productId).where(sql`${table.isCover} = true AND ${table.deletedAt} IS NULL`),
  ],
);

export const favorites = pgTable(
  "favorites",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetType: favoriteTargetTypeEnum("target_type").notNull(),
    sellerId: uuid("seller_id").references(() => sellerProfiles.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("favorites_user_seller_uq").on(table.userId, table.sellerId).where(sql`${table.sellerId} IS NOT NULL`),
    uniqueIndex("favorites_user_product_uq").on(table.userId, table.productId).where(sql`${table.productId} IS NOT NULL`),
    check(
      "favorites_target_matches",
      sql`(${table.targetType} = 'SELLER' AND ${table.sellerId} IS NOT NULL AND ${table.productId} IS NULL) OR (${table.targetType} = 'PRODUCT' AND ${table.productId} IS NOT NULL AND ${table.sellerId} IS NULL)`,
    ),
  ],
);

export const sellerAvailabilitySlots = pgTable(
  "seller_availability_slots",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id").notNull().references(() => sellerProfiles.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: availabilitySlotStatusEnum("status").default("OPEN").notNull(),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("seller_slots_lookup_idx").on(table.sellerId, table.status, table.startsAt), check("seller_slots_time_valid", sql`${table.endsAt} > ${table.startsAt}`)],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey(),
    orderNo: varchar("order_no", { length: 40 }).notNull(),
    buyerId: uuid("buyer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    sellerUserId: uuid("seller_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    sellerId: uuid("seller_id").notNull().references(() => sellerProfiles.id, { onDelete: "restrict" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    skuId: uuid("sku_id").notNull().references(() => productSkus.id, { onDelete: "restrict" }),
    transactionPolicyVersionId: uuid("transaction_policy_version_id").references(() => policyVersions.id, { onDelete: "restrict" }),
    refundPolicyVersionId: uuid("refund_policy_version_id").references(() => policyVersions.id, { onDelete: "restrict" }),
    productTitleSnapshot: varchar("product_title_snapshot", { length: 120 }).notNull(),
    productImageSnapshot: text("product_image_snapshot").notNull(),
    productDescriptionSnapshot: text("product_description_snapshot").notNull(),
    sellerNameSnapshot: varchar("seller_name_snapshot", { length: 32 }).notNull(),
    sellerAvatarSnapshot: text("seller_avatar_snapshot"),
    skuNameSnapshot: varchar("sku_name_snapshot", { length: 100 }).notNull(),
    skuDescriptionSnapshot: varchar("sku_description_snapshot", { length: 500 }),
    skuPriceCentSnapshot: money("sku_price_cent_snapshot").notNull(),
    skuDurationMinutesSnapshot: integer("sku_duration_minutes_snapshot").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    totalAmountCent: money("total_amount_cent").notNull(),
    discountCent: money("discount_cent").default(sql`0`).notNull(),
    payableAmountCent: money("payable_amount_cent").notNull(),
    paidAmountCent: money("paid_amount_cent").default(sql`0`).notNull(),
    refundedAmountCent: money("refunded_amount_cent").default(sql`0`).notNull(),
    commissionRateBpsSnapshot: integer("commission_rate_bps_snapshot").notNull(),
    platformFeeCent: money("platform_fee_cent").notNull(),
    sellerIncomeCent: money("seller_income_cent").notNull(),
    serviceStartsAt: timestamp("service_starts_at", { withTimezone: true }).notNull(),
    serviceEndsAt: timestamp("service_ends_at", { withTimezone: true }).notNull(),
    buyerNote: varchar("buyer_note", { length: 500 }),
    status: orderStatusEnum("status").default("PENDING_PAYMENT").notNull(),
    paymentStatus: paymentStatusEnum("payment_status").default("CREATED").notNull(),
    afterSaleStatus: afterSaleStatusEnum("after_sale_status").default("NONE").notNull(),
    cancelReason: text("cancel_reason"),
    sellerRejectReason: text("seller_reject_reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    autoConfirmAt: timestamp("auto_confirm_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    serviceStartedAt: timestamp("service_started_at", { withTimezone: true }),
    sellerCompletedAt: timestamp("seller_completed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("orders_order_no_uq").on(table.orderNo),
    index("orders_buyer_created_idx").on(table.buyerId, table.createdAt),
    index("orders_seller_created_idx").on(table.sellerId, table.createdAt),
    index("orders_status_created_idx").on(table.status, table.createdAt),
    index("orders_payment_status_idx").on(table.paymentStatus, table.createdAt),
    index("orders_service_time_idx").on(table.sellerId, table.serviceStartsAt),
    check("orders_distinct_parties", sql`${table.buyerId} <> ${table.sellerUserId}`),
    check("orders_quantity_positive", sql`${table.quantity} > 0`),
    check("orders_sku_price_positive", sql`${table.skuPriceCentSnapshot} > 0`),
    check("orders_discount_disabled", sql`${table.discountCent} = 0`),
    check("orders_amounts_nonnegative", sql`${table.totalAmountCent} >= 0 AND ${table.payableAmountCent} >= 0 AND ${table.paidAmountCent} >= 0 AND ${table.refundedAmountCent} >= 0 AND ${table.platformFeeCent} >= 0 AND ${table.sellerIncomeCent} >= 0`),
    check("orders_payable_formula", sql`${table.payableAmountCent} = ${table.totalAmountCent} - ${table.discountCent}`),
    check("orders_paid_cap", sql`${table.paidAmountCent} <= ${table.payableAmountCent}`),
    check("orders_refunded_cap", sql`${table.refundedAmountCent} <= ${table.paidAmountCent}`),
    check("orders_commission_bps_valid", sql`${table.commissionRateBpsSnapshot} BETWEEN 0 AND 10000`),
    check("orders_split_formula", sql`${table.platformFeeCent} + ${table.sellerIncomeCent} = ${table.payableAmountCent}`),
    check("orders_service_time_valid", sql`${table.serviceEndsAt} > ${table.serviceStartsAt}`),
    check(
      "orders_policy_versions_complete",
      sql`(${table.transactionPolicyVersionId} IS NULL AND ${table.refundPolicyVersionId} IS NULL) OR (${table.transactionPolicyVersionId} IS NOT NULL AND ${table.refundPolicyVersionId} IS NOT NULL)`,
    ),
  ],
);

export const orderSlotReservations = pgTable(
  "order_slot_reservations",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    slotId: uuid("slot_id").references(() => sellerAvailabilitySlots.id, { onDelete: "restrict" }),
    sellerId: uuid("seller_id").notNull().references(() => sellerProfiles.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: reservationStatusEnum("status").default("HELD").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("order_slot_reservations_order_uq").on(table.orderId),
    index("order_slot_reservations_seller_idx").on(table.sellerId, table.startsAt, table.status),
    check("order_reservation_time_valid", sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

export const orderStatusLogs = pgTable(
  "order_status_logs",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    oldStatus: orderStatusEnum("old_status"),
    newStatus: orderStatusEnum("new_status").notNull(),
    operatorUserId: uuid("operator_user_id").references(() => users.id, { onDelete: "restrict" }),
    operatorAdminId: uuid("operator_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    operatorRole: operatorRoleEnum("operator_role").notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    remark: text("remark"),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("order_status_logs_order_idx").on(table.orderId, table.createdAt)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    paymentNo: varchar("payment_no", { length: 64 }).notNull(),
    channel: paymentChannelEnum("channel").notNull(),
    providerTransactionId: varchar("provider_transaction_id", { length: 128 }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    amountCent: money("amount_cent").notNull(),
    refundedAmountCent: money("refunded_amount_cent").default(sql`0`).notNull(),
    currency: char("currency", { length: 3 }).default("CNY").notNull(),
    status: paymentStatusEnum("status").default("CREATED").notNull(),
    providerPayloadFileId: uuid("provider_payload_file_id").references(() => files.id, { onDelete: "restrict" }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("payments_payment_no_uq").on(table.paymentNo),
    uniqueIndex("payments_idempotency_uq").on(table.idempotencyKey),
    uniqueIndex("payments_provider_tx_uq").on(table.channel, table.providerTransactionId).where(sql`${table.providerTransactionId} IS NOT NULL`),
    index("payments_order_idx").on(table.orderId, table.createdAt),
    check("payments_amount_positive", sql`${table.amountCent} > 0`),
    check("payments_refunded_cap", sql`${table.refundedAmountCent} >= 0 AND ${table.refundedAmountCent} <= ${table.amountCent}`),
  ],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey(),
    paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "restrict" }),
    channel: paymentChannelEnum("channel").notNull(),
    providerEventId: varchar("provider_event_id", { length: 160 }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    signatureVerified: boolean("signature_verified").default(false).notNull(),
    payloadFileId: uuid("payload_file_id").references(() => files.id, { onDelete: "restrict" }),
    payloadSha256: char("payload_sha256", { length: 64 }).notNull(),
    processingError: text("processing_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("payment_events_provider_uq").on(table.channel, table.providerEventId), index("payment_events_payment_idx").on(table.paymentId, table.createdAt)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey(),
    refundNo: varchar("refund_no", { length: 64 }).notNull(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "restrict" }),
    applicantId: uuid("applicant_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    requestedAmountCent: money("requested_amount_cent").notNull(),
    approvedAmountCent: money("approved_amount_cent"),
    reasonCode: varchar("reason_code", { length: 64 }).notNull(),
    reasonText: varchar("reason_text", { length: 200 }).notNull(),
    description: text("description"),
    sellerDecision: refundDecisionEnum("seller_decision"),
    sellerReason: text("seller_reason"),
    adminDecision: refundDecisionEnum("admin_decision"),
    adminReason: text("admin_reason"),
    assignedAdminId: uuid("assigned_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    status: refundStatusEnum("status").default("REQUESTED").notNull(),
    providerRefundNo: varchar("provider_refund_no", { length: 128 }),
    sellerProcessedAt: timestamp("seller_processed_at", { withTimezone: true }),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("refunds_refund_no_uq").on(table.refundNo),
    uniqueIndex("refunds_provider_no_uq").on(table.providerRefundNo).where(sql`${table.providerRefundNo} IS NOT NULL`),
    uniqueIndex("refunds_one_active_per_order_uq").on(table.orderId).where(sql`${table.status} IN ('REQUESTED','SELLER_APPROVED','SELLER_REJECTED','NEGOTIATING','PLATFORM_REVIEW','REFUND_PROCESSING')`),
    index("refunds_status_created_idx").on(table.status, table.createdAt),
    index("refunds_order_idx").on(table.orderId, table.createdAt),
    check("refunds_requested_positive", sql`${table.requestedAmountCent} > 0`),
    check("refunds_approved_valid", sql`${table.approvedAmountCent} IS NULL OR (${table.approvedAmountCent} > 0 AND ${table.approvedAmountCent} <= ${table.requestedAmountCent})`),
  ],
);

export const refundLogs = pgTable(
  "refund_logs",
  {
    id: uuid("id").primaryKey(),
    refundId: uuid("refund_id").notNull().references(() => refunds.id, { onDelete: "restrict" }),
    oldStatus: refundStatusEnum("old_status"),
    newStatus: refundStatusEnum("new_status").notNull(),
    operatorUserId: uuid("operator_user_id").references(() => users.id, { onDelete: "restrict" }),
    operatorAdminId: uuid("operator_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    operatorRole: operatorRoleEnum("operator_role").notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    reason: text("reason"),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("refund_logs_refund_idx").on(table.refundId, table.createdAt)],
);

export const complaints = pgTable(
  "complaints",
  {
    id: uuid("id").primaryKey(),
    complaintNo: varchar("complaint_no", { length: 64 }).notNull(),
    reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    targetType: complaintTargetTypeEnum("target_type").notNull(),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "restrict" }),
    targetSellerId: uuid("target_seller_id").references(() => sellerProfiles.id, { onDelete: "restrict" }),
    targetProductId: uuid("target_product_id").references(() => products.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    complaintType: varchar("complaint_type", { length: 64 }).notNull(),
    description: text("description").notNull(),
    status: complaintStatusEnum("status").default("SUBMITTED").notNull(),
    assignedAdminId: uuid("assigned_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    adminResult: text("admin_result"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("complaints_complaint_no_uq").on(table.complaintNo),
    index("complaints_status_created_idx").on(table.status, table.createdAt),
    index("complaints_order_idx").on(table.orderId, table.createdAt),
    check(
      "complaints_target_present",
      sql`(${table.targetType} = 'USER' AND ${table.targetUserId} IS NOT NULL) OR (${table.targetType} = 'SELLER' AND ${table.targetSellerId} IS NOT NULL) OR (${table.targetType} = 'PRODUCT' AND ${table.targetProductId} IS NOT NULL) OR (${table.targetType} = 'ORDER' AND ${table.orderId} IS NOT NULL)`,
    ),
  ],
);

export const complaintEvidences = pgTable(
  "complaint_evidences",
  {
    id: uuid("id").primaryKey(),
    complaintId: uuid("complaint_id").notNull().references(() => complaints.id, { onDelete: "restrict" }),
    fileId: uuid("file_id").notNull().references(() => files.id, { onDelete: "restrict" }),
    submittedByUserId: uuid("submitted_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    submittedByAdminId: uuid("submitted_by_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    description: varchar("description", { length: 500 }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("complaint_evidence_file_uq").on(table.complaintId, table.fileId),
    index("complaint_evidences_complaint_idx").on(table.complaintId, table.createdAt, table.id),
    check(
      "complaint_evidences_submitter_xor",
      sql`(CASE WHEN ${table.submittedByUserId} IS NULL THEN 0 ELSE 1 END) + (CASE WHEN ${table.submittedByAdminId} IS NULL THEN 0 ELSE 1 END) = 1`,
    ),
  ],
);

export const complaintLogs = pgTable(
  "complaint_logs",
  {
    id: uuid("id").primaryKey(),
    complaintId: uuid("complaint_id").notNull().references(() => complaints.id, { onDelete: "restrict" }),
    oldStatus: complaintStatusEnum("old_status"),
    newStatus: complaintStatusEnum("new_status").notNull(),
    operatorUserId: uuid("operator_user_id").references(() => users.id, { onDelete: "restrict" }),
    operatorAdminId: uuid("operator_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    operatorRole: operatorRoleEnum("operator_role").notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    reason: text("reason"),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("complaint_logs_complaint_idx").on(table.complaintId, table.createdAt)],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    sellerId: uuid("seller_id").notNull().references(() => sellerProfiles.id, { onDelete: "restrict" }),
    buyerId: uuid("buyer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    rating: integer("rating").notNull(),
    content: varchar("content", { length: 1000 }),
    anonymous: boolean("anonymous").default(false).notNull(),
    status: reviewStatusEnum("status").default("PENDING").notNull(),
    displayNicknameSnapshot: varchar("display_nickname_snapshot", { length: 32 }).notNull(),
    serviceTitleSnapshot: varchar("service_title_snapshot", { length: 120 }).notNull(),
    skuNameSnapshot: varchar("sku_name_snapshot", { length: 100 }).notNull(),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenByAdminId: uuid("hidden_by_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    hiddenReason: text("hidden_reason"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("reviews_order_uq").on(table.orderId),
    index("reviews_product_status_idx").on(table.productId, table.status, table.createdAt),
    index("reviews_seller_status_idx").on(table.sellerId, table.status, table.createdAt),
    check("reviews_rating_valid", sql`${table.rating} BETWEEN 1 AND 5`),
  ],
);

export const ratingAggregates = pgTable(
  "rating_aggregates",
  {
    id: uuid("id").primaryKey(),
    subjectType: ratingSubjectTypeEnum("subject_type").notNull(),
    sellerId: uuid("seller_id").references(() => sellerProfiles.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    ratingCount: integer("rating_count").default(0).notNull(),
    ratingSum: bigint("rating_sum", { mode: "bigint" }).default(sql`0`).notNull(),
    ratingAvg: numeric("rating_avg", { precision: 3, scale: 2 }).default("0").notNull(),
    star1Count: integer("star_1_count").default(0).notNull(),
    star2Count: integer("star_2_count").default(0).notNull(),
    star3Count: integer("star_3_count").default(0).notNull(),
    star4Count: integer("star_4_count").default(0).notNull(),
    star5Count: integer("star_5_count").default(0).notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("rating_aggregates_seller_uq").on(table.sellerId).where(sql`${table.sellerId} IS NOT NULL`),
    uniqueIndex("rating_aggregates_product_uq").on(table.productId).where(sql`${table.productId} IS NOT NULL`),
    check("rating_aggregates_target_matches", sql`(${table.subjectType} = 'SELLER' AND ${table.sellerId} IS NOT NULL AND ${table.productId} IS NULL) OR (${table.subjectType} = 'PRODUCT' AND ${table.productId} IS NOT NULL AND ${table.sellerId} IS NULL)`),
    check("rating_aggregates_values_valid", sql`${table.ratingCount} >= 0 AND ${table.ratingSum} >= 0 AND ${table.ratingAvg} >= 0 AND ${table.ratingAvg} <= 5`),
  ],
);

export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: uuid("id").primaryKey(),
    ownerType: ledgerOwnerTypeEnum("owner_type").notNull(),
    sellerId: uuid("seller_id").references(() => sellerProfiles.id, { onDelete: "restrict" }),
    systemKey: varchar("system_key", { length: 64 }),
    accountType: ledgerAccountTypeEnum("account_type").notNull(),
    currency: char("currency", { length: 3 }).default("CNY").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("ledger_accounts_seller_uq").on(table.sellerId, table.accountType, table.currency).where(sql`${table.sellerId} IS NOT NULL`),
    uniqueIndex("ledger_accounts_system_uq").on(table.systemKey, table.accountType, table.currency).where(sql`${table.systemKey} IS NOT NULL`),
    check("ledger_accounts_owner_matches", sql`(${table.ownerType} = 'SELLER' AND ${table.sellerId} IS NOT NULL AND ${table.systemKey} IS NULL) OR (${table.ownerType} IN ('PLATFORM','CLEARING') AND ${table.sellerId} IS NULL AND ${table.systemKey} IS NOT NULL)`),
  ],
);

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: uuid("id").primaryKey(),
    transactionNo: varchar("transaction_no", { length: 64 }).notNull(),
    transactionType: ledgerTransactionTypeEnum("transaction_type").notNull(),
    status: ledgerTransactionStatusEnum("status").default("PENDING").notNull(),
    sourceType: relatedObjectTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    reversalOfTransactionId: uuid("reversal_of_transaction_id"),
    description: varchar("description", { length: 500 }).notNull(),
    traceId: varchar("trace_id", { length: 128 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("ledger_transactions_no_uq").on(table.transactionNo),
    uniqueIndex("ledger_transactions_idempotency_uq").on(table.idempotencyKey),
    uniqueIndex("ledger_transactions_reversal_uq").on(table.reversalOfTransactionId).where(sql`${table.reversalOfTransactionId} IS NOT NULL`),
    index("ledger_transactions_source_idx").on(table.sourceType, table.sourceId, table.occurredAt),
    check("ledger_transactions_not_self_reversal", sql`${table.reversalOfTransactionId} IS NULL OR ${table.reversalOfTransactionId} <> ${table.id}`),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey(),
    transactionId: uuid("transaction_id").notNull().references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    accountId: uuid("account_id").notNull().references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    side: ledgerSideEnum("side").notNull(),
    amountCent: money("amount_cent").notNull(),
    currency: char("currency", { length: 3 }).default("CNY").notNull(),
    memo: varchar("memo", { length: 500 }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("ledger_entries_transaction_account_side_uq").on(table.transactionId, table.accountId, table.side),
    index("ledger_entries_account_created_idx").on(table.accountId, table.createdAt),
    index("ledger_entries_transaction_idx").on(table.transactionId),
    check("ledger_entries_amount_positive", sql`${table.amountCent} > 0`),
  ],
);

export const sellerIncomes = pgTable(
  "seller_incomes",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id").notNull().references(() => sellerProfiles.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    ledgerTransactionId: uuid("ledger_transaction_id").notNull().references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    orderAmountCent: money("order_amount_cent").notNull(),
    platformFeeCent: money("platform_fee_cent").notNull(),
    sellerAmountCent: money("seller_amount_cent").notNull(),
    availableAmountCent: money("available_amount_cent").default(sql`0`).notNull(),
    lockedAmountCent: money("locked_amount_cent").default(sql`0`).notNull(),
    withdrawnAmountCent: money("withdrawn_amount_cent").default(sql`0`).notNull(),
    reversedAmountCent: money("reversed_amount_cent").default(sql`0`).notNull(),
    status: sellerIncomeStatusEnum("status").default("PENDING_SETTLEMENT").notNull(),
    settlementAvailableAt: timestamp("settlement_available_at", { withTimezone: true }).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("seller_incomes_order_uq").on(table.orderId),
    uniqueIndex("seller_incomes_ledger_tx_uq").on(table.ledgerTransactionId),
    index("seller_incomes_seller_status_idx").on(table.sellerId, table.status, table.settlementAvailableAt),
    check("seller_incomes_amounts_valid", sql`${table.orderAmountCent} > 0 AND ${table.platformFeeCent} >= 0 AND ${table.sellerAmountCent} > 0 AND ${table.platformFeeCent} + ${table.sellerAmountCent} = ${table.orderAmountCent}`),
    check("seller_income_buckets_nonnegative", sql`${table.availableAmountCent} >= 0 AND ${table.lockedAmountCent} >= 0 AND ${table.withdrawnAmountCent} >= 0 AND ${table.reversedAmountCent} >= 0`),
    check("seller_income_buckets_cap", sql`${table.availableAmountCent} + ${table.lockedAmountCent} + ${table.withdrawnAmountCent} + ${table.reversedAmountCent} <= ${table.sellerAmountCent}`),
  ],
);

export const sellerLiabilities = pgTable(
  "seller_liabilities",
  {
    id: uuid("id").primaryKey(),
    liabilityNo: varchar("liability_no", { length: 64 }).notNull(),
    sellerId: uuid("seller_id").notNull().references(() => sellerProfiles.id, { onDelete: "restrict" }),
    refundId: uuid("refund_id").notNull().references(() => refunds.id, { onDelete: "restrict" }),
    ledgerTransactionId: uuid("ledger_transaction_id").notNull().references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    originalAmountCent: money("original_amount_cent").notNull(),
    outstandingAmountCent: money("outstanding_amount_cent").notNull(),
    status: sellerLiabilityStatusEnum("status").default("OPEN").notNull(),
    riskHold: boolean("risk_hold").default(true).notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    waivedAt: timestamp("waived_at", { withTimezone: true }),
    waivedByAdminId: uuid("waived_by_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    waivedReason: text("waived_reason"),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("seller_liabilities_no_uq").on(table.liabilityNo),
    uniqueIndex("seller_liabilities_refund_uq").on(table.refundId),
    index("seller_liabilities_seller_status_idx").on(table.sellerId, table.status, table.createdAt),
    check("seller_liabilities_amount_valid", sql`${table.originalAmountCent} > 0 AND ${table.outstandingAmountCent} >= 0 AND ${table.outstandingAmountCent} <= ${table.originalAmountCent}`),
  ],
);

export const sellerLiabilityAllocations = pgTable(
  "seller_liability_allocations",
  {
    id: uuid("id").primaryKey(),
    liabilityId: uuid("liability_id").notNull().references(() => sellerLiabilities.id, { onDelete: "restrict" }),
    incomeId: uuid("income_id").notNull().references(() => sellerIncomes.id, { onDelete: "restrict" }),
    ledgerTransactionId: uuid("ledger_transaction_id").notNull().references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    amountCent: money("amount_cent").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("seller_liability_allocation_uq").on(table.liabilityId, table.incomeId),
    uniqueIndex("seller_liability_allocation_tx_uq").on(table.ledgerTransactionId),
    check("seller_liability_allocation_positive", sql`${table.amountCent} > 0`),
  ],
);

export const payoutAccounts = pgTable(
  "payout_accounts",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id").notNull().references(() => sellerProfiles.id, { onDelete: "restrict" }),
    accountType: payoutAccountTypeEnum("account_type").notNull(),
    holderNameCiphertext: text("holder_name_ciphertext").notNull(),
    holderNameHash: char("holder_name_hash", { length: 64 }).notNull(),
    accountTokenCiphertext: text("account_token_ciphertext").notNull(),
    accountTokenHash: char("account_token_hash", { length: 64 }).notNull(),
    displayMask: varchar("display_mask", { length: 128 }).notNull(),
    verificationStatus: payoutVerificationStatusEnum("verification_status").default("PENDING").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("payout_accounts_token_uq").on(table.sellerId, table.accountTokenHash).where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("payout_accounts_default_type_uq").on(table.sellerId, table.accountType).where(sql`${table.isDefault} = true AND ${table.deletedAt} IS NULL`),
    index("payout_accounts_seller_idx").on(table.sellerId, table.verificationStatus),
  ],
);

export const withdrawals = pgTable(
  "withdrawals",
  {
    id: uuid("id").primaryKey(),
    withdrawalNo: varchar("withdrawal_no", { length: 64 }).notNull(),
    sellerId: uuid("seller_id").notNull().references(() => sellerProfiles.id, { onDelete: "restrict" }),
    payoutAccountId: uuid("payout_account_id").notNull().references(() => payoutAccounts.id, { onDelete: "restrict" }),
    lockLedgerTransactionId: uuid("lock_ledger_transaction_id").notNull().references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    amountCent: money("amount_cent").notNull(),
    feeCent: money("fee_cent").default(sql`0`).notNull(),
    actualAmountCent: money("actual_amount_cent").notNull(),
    status: withdrawalStatusEnum("status").default("CREATED").notNull(),
    riskStatus: riskStatusEnum("risk_status").default("CLEAR").notNull(),
    rejectReason: text("reject_reason"),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    providerPayoutNo: varchar("provider_payout_no", { length: 128 }),
    assignedAdminId: uuid("assigned_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    initialReviewAdminId: uuid("initial_review_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    initialReviewedAt: timestamp("initial_reviewed_at", { withTimezone: true }),
    finalReviewAdminId: uuid("final_review_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    finalReviewedAt: timestamp("final_reviewed_at", { withTimezone: true }),
    processingAt: timestamp("processing_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("withdrawals_no_uq").on(table.withdrawalNo),
    uniqueIndex("withdrawals_idempotency_uq").on(table.idempotencyKey),
    uniqueIndex("withdrawals_lock_tx_uq").on(table.lockLedgerTransactionId),
    uniqueIndex("withdrawals_provider_no_uq").on(table.providerPayoutNo).where(sql`${table.providerPayoutNo} IS NOT NULL`),
    index("withdrawals_seller_created_idx").on(table.sellerId, table.createdAt),
    index("withdrawals_status_created_idx").on(table.status, table.createdAt),
    check("withdrawals_amount_positive", sql`${table.amountCent} > 0 AND ${table.feeCent} >= 0 AND ${table.actualAmountCent} > 0`),
    check("withdrawals_amount_formula", sql`${table.actualAmountCent} = ${table.amountCent} - ${table.feeCent}`),
    check("withdrawals_dual_review_admins", sql`${table.finalReviewAdminId} IS NULL OR (${table.initialReviewAdminId} IS NOT NULL AND ${table.finalReviewAdminId} <> ${table.initialReviewAdminId})`),
  ],
);

export const withdrawalIncomeAllocations = pgTable(
  "withdrawal_income_allocations",
  {
    withdrawalId: uuid("withdrawal_id").notNull().references(() => withdrawals.id, { onDelete: "restrict" }),
    incomeId: uuid("income_id").notNull().references(() => sellerIncomes.id, { onDelete: "restrict" }),
    amountCent: money("amount_cent").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.withdrawalId, table.incomeId], name: "withdrawal_income_allocations_pk" }),
    index("withdrawal_income_allocations_income_idx").on(table.incomeId),
    check("withdrawal_income_allocation_positive", sql`${table.amountCent} > 0`),
  ],
);

export const withdrawalLogs = pgTable(
  "withdrawal_logs",
  {
    id: uuid("id").primaryKey(),
    withdrawalId: uuid("withdrawal_id").notNull().references(() => withdrawals.id, { onDelete: "restrict" }),
    oldStatus: withdrawalStatusEnum("old_status"),
    newStatus: withdrawalStatusEnum("new_status").notNull(),
    operatorAdminId: uuid("operator_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    operatorRole: operatorRoleEnum("operator_role").notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    reason: text("reason"),
    externalEvidenceFileId: uuid("external_evidence_file_id").references(() => files.id, { onDelete: "restrict" }),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("withdrawal_logs_withdrawal_idx").on(table.withdrawalId, table.createdAt)],
);

export const reconciliationRuns = pgTable(
  "reconciliation_runs",
  {
    id: uuid("id").primaryKey(),
    runNo: varchar("run_no", { length: 64 }).notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    statementDate: timestamp("statement_date", { withTimezone: true }).notNull(),
    status: reconciliationRunStatusEnum("status").default("RUNNING").notNull(),
    sourceFileId: uuid("source_file_id").references(() => files.id, { onDelete: "restrict" }),
    totalItemCount: integer("total_item_count").default(0).notNull(),
    mismatchCount: integer("mismatch_count").default(0).notNull(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("reconciliation_runs_no_uq").on(table.runNo), uniqueIndex("reconciliation_runs_provider_date_uq").on(table.provider, table.statementDate)],
);

export const reconciliationItems = pgTable(
  "reconciliation_items",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id").notNull().references(() => reconciliationRuns.id, { onDelete: "restrict" }),
    mismatchType: varchar("mismatch_type", { length: 64 }).notNull(),
    businessType: relatedObjectTypeEnum("business_type").notNull(),
    businessId: uuid("business_id"),
    providerReference: varchar("provider_reference", { length: 160 }),
    platformAmountCent: money("platform_amount_cent"),
    providerAmountCent: money("provider_amount_cent"),
    status: reconciliationItemStatusEnum("status").default("OPEN").notNull(),
    resolution: text("resolution"),
    resolvedByAdminId: uuid("resolved_by_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("reconciliation_items_run_status_idx").on(table.runId, table.status), index("reconciliation_items_business_idx").on(table.businessType, table.businessId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey(),
    conversationNo: varchar("conversation_no", { length: 64 }).notNull(),
    conversationType: conversationTypeEnum("conversation_type").notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    lastMessageId: uuid("last_message_id"),
    lastMessagePreview: varchar("last_message_preview", { length: 200 }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("conversations_no_uq").on(table.conversationNo),
    uniqueIndex("conversations_order_type_uq").on(table.orderId, table.conversationType).where(sql`${table.orderId} IS NOT NULL`),
    index("conversations_last_message_idx").on(table.lastMessageAt),
  ],
);

export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    adminId: uuid("admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    role: conversationMemberRoleEnum("role").notNull(),
    lastReadSequenceNo: bigint("last_read_sequence_no", { mode: "bigint" }).default(sql`0`).notNull(),
    unreadCount: integer("unread_count").default(0).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("conversation_members_user_uq").on(table.conversationId, table.userId).where(sql`${table.userId} IS NOT NULL`),
    uniqueIndex("conversation_members_admin_uq").on(table.conversationId, table.adminId).where(sql`${table.adminId} IS NOT NULL`),
    index("conversation_members_user_idx").on(table.userId, table.conversationId),
    check("conversation_members_identity_xor", sql`(CASE WHEN ${table.userId} IS NULL THEN 0 ELSE 1 END) + (CASE WHEN ${table.adminId} IS NULL THEN 0 ELSE 1 END) = 1`),
    check("conversation_members_unread_nonnegative", sql`${table.unreadCount} >= 0 AND ${table.lastReadSequenceNo} >= 0`),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "restrict" }),
    clientMessageId: varchar("client_message_id", { length: 128 }).notNull(),
    sequenceNo: bigint("sequence_no", { mode: "bigint" }).notNull(),
    senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "restrict" }),
    senderAdminId: uuid("sender_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    senderRole: conversationMemberRoleEnum("sender_role").notNull(),
    messageType: messageTypeEnum("message_type").default("TEXT").notNull(),
    content: text("content").notNull(),
    sendStatus: messageSendStatusEnum("send_status").default("SENT").notNull(),
    moderationStatus: contentModerationStatusEnum("moderation_status").default("PENDING").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("messages_conversation_sequence_uq").on(table.conversationId, table.sequenceNo),
    uniqueIndex("messages_user_client_uq").on(table.senderUserId, table.clientMessageId).where(sql`${table.senderUserId} IS NOT NULL`),
    uniqueIndex("messages_admin_client_uq").on(table.senderAdminId, table.clientMessageId).where(sql`${table.senderAdminId} IS NOT NULL`),
    index("messages_conversation_created_idx").on(table.conversationId, table.createdAt),
    check("messages_sequence_positive", sql`${table.sequenceNo} > 0`),
    check(
      "messages_sender_valid",
      sql`(${table.senderRole} = 'SYSTEM' AND ${table.senderUserId} IS NULL AND ${table.senderAdminId} IS NULL) OR (${table.senderRole} = 'ADMIN' AND ${table.senderAdminId} IS NOT NULL AND ${table.senderUserId} IS NULL) OR (${table.senderRole} IN ('BUYER','SELLER','USER') AND ${table.senderUserId} IS NOT NULL AND ${table.senderAdminId} IS NULL)`,
    ),
  ],
);

export const supportCases = pgTable(
  "support_cases",
  {
    id: uuid("id").primaryKey(),
    caseNo: varchar("case_no", { length: 64 }).notNull(),
    requesterId: uuid("requester_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "restrict" }),
    topic: varchar("topic", { length: 120 }).notNull(),
    priority: supportPriorityEnum("priority").default("NORMAL").notNull(),
    status: supportCaseStatusEnum("status").default("WAITING").notNull(),
    queueKey: varchar("queue_key", { length: 64 }).notNull(),
    assignedAdminId: uuid("assigned_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    relatedType: relatedObjectTypeEnum("related_type"),
    relatedId: uuid("related_id"),
    sourcePage: varchar("source_page", { length: 128 }),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closeReason: text("close_reason"),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("support_cases_no_uq").on(table.caseNo),
    uniqueIndex("support_cases_conversation_uq").on(table.conversationId),
    index("support_cases_queue_idx").on(table.queueKey, table.status, table.priority, table.createdAt),
    index("support_cases_assignee_idx").on(table.assignedAdminId, table.status),
    index("support_cases_related_idx").on(table.relatedType, table.relatedId),
    check("support_cases_related_pair", sql`(${table.relatedType} IS NULL) = (${table.relatedId} IS NULL)`),
  ],
);

export const supportCaseLogs = pgTable(
  "support_case_logs",
  {
    id: uuid("id").primaryKey(),
    supportCaseId: uuid("support_case_id").notNull().references(() => supportCases.id, { onDelete: "restrict" }),
    action: supportCaseActionEnum("action").notNull(),
    oldStatus: supportCaseStatusEnum("old_status"),
    newStatus: supportCaseStatusEnum("new_status").notNull(),
    oldQueueKey: varchar("old_queue_key", { length: 64 }),
    newQueueKey: varchar("new_queue_key", { length: 64 }),
    operatorAdminId: uuid("operator_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    operatorUserId: uuid("operator_user_id").references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason"),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("support_case_logs_case_idx").on(table.supportCaseId, table.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    category: notificationCategoryEnum("category").notNull(),
    notificationType: varchar("notification_type", { length: 64 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    contentTemplateId: varchar("content_template_id", { length: 128 }).notNull(),
    contentVariablesJson: jsonb("content_variables_json").default({}).notNull(),
    relatedType: relatedObjectTypeEnum("related_type"),
    relatedId: uuid("related_id"),
    readStatus: notificationReadStatusEnum("read_status").default("UNREAD").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("notifications_idempotency_uq").on(table.idempotencyKey),
    index("notifications_user_unread_idx").on(table.userId, table.readStatus, table.createdAt),
    check("notifications_related_pair", sql`(${table.relatedType} IS NULL) = (${table.relatedId} IS NULL)`),
  ],
);

export const deliveryLogs = pgTable(
  "delivery_logs",
  {
    id: uuid("id").primaryKey(),
    notificationId: uuid("notification_id").notNull().references(() => notifications.id, { onDelete: "restrict" }),
    channel: deliveryChannelEnum("channel").notNull(),
    status: deliveryStatusEnum("status").default("PENDING").notNull(),
    providerMessageId: varchar("provider_message_id", { length: 160 }),
    attemptCount: integer("attempt_count").default(0).notNull(),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("delivery_logs_notification_channel_uq").on(table.notificationId, table.channel), index("delivery_logs_status_idx").on(table.status, table.updatedAt), check("delivery_attempts_nonnegative", sql`${table.attemptCount} >= 0`)],
);

export const fileUsages = pgTable(
  "file_usages",
  {
    id: uuid("id").primaryKey(),
    fileId: uuid("file_id").notNull().references(() => files.id, { onDelete: "restrict" }),
    usageType: fileUsageTypeEnum("usage_type").notNull(),
    targetType: relatedObjectTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("file_usages_target_uq").on(table.fileId, table.usageType, table.targetType, table.targetId).where(sql`${table.deletedAt} IS NULL`), index("file_usages_target_idx").on(table.targetType, table.targetId)],
);

export const platformConfigs = pgTable(
  "platform_configs",
  {
    id: uuid("id").primaryKey(),
    configKey: varchar("config_key", { length: 128 }).notNull(),
    valueJson: jsonb("value_json").notNull(),
    versionNo: integer("version_no").notNull(),
    status: configStatusEnum("status").default("DRAFT").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    createdByAdminId: uuid("created_by_admin_id").notNull().references(() => adminAccounts.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("platform_configs_key_version_uq").on(table.configKey, table.versionNo),
    uniqueIndex("platform_configs_one_active_uq").on(table.configKey).where(sql`${table.status} = 'ACTIVE'`),
    index("platform_configs_status_idx").on(table.status, table.effectiveAt),
    check("platform_configs_version_positive", sql`${table.versionNo} > 0`),
  ],
);

export const adminOperationLogs = pgTable(
  "admin_operation_logs",
  {
    id: uuid("id").primaryKey(),
    adminId: uuid("admin_id").notNull().references(() => adminAccounts.id, { onDelete: "restrict" }),
    action: varchar("action", { length: 128 }).notNull(),
    targetType: relatedObjectTypeEnum("target_type").notNull(),
    targetId: uuid("target_id"),
    reason: text("reason").notNull(),
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    traceId: varchar("trace_id", { length: 128 }),
    ip: varchar("ip", { length: 64 }).notNull(),
    userAgent: text("user_agent").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("admin_operation_logs_target_idx").on(table.targetType, table.targetId, table.createdAt), index("admin_operation_logs_admin_idx").on(table.adminId, table.createdAt), index("admin_operation_logs_request_idx").on(table.requestId), index("admin_operation_logs_created_id_idx").on(table.createdAt, table.id)],
);

export const accountCancellationRequests = pgTable(
  "account_cancellation_requests",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    status: accountCancellationStatusEnum("status").default("REQUESTED").notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    waitingPeriodEndsAt: timestamp("waiting_period_ends_at", { withTimezone: true }).notNull(),
    processingAt: timestamp("processing_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: varchar("rejection_reason", { length: 500 }),
    decisionAdminOperationLogId: uuid("decision_admin_operation_log_id").references(() => adminOperationLogs.id, { onDelete: "restrict" }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("account_cancellation_requests_user_idempotency_uq").on(table.userId, table.idempotencyKey),
    uniqueIndex("account_cancellation_requests_one_active_user_uq")
      .on(table.userId)
      .where(sql`${table.status} IN ('REQUESTED','PROCESSING')`),
    uniqueIndex("account_cancellation_requests_decision_log_uq")
      .on(table.decisionAdminOperationLogId)
      .where(sql`${table.decisionAdminOperationLogId} IS NOT NULL`),
    index("account_cancellation_requests_user_created_idx").on(table.userId, table.createdAt, table.id),
    index("account_cancellation_requests_waiting_idx").on(table.status, table.waitingPeriodEndsAt, table.id),
    check("account_cancellation_requests_reason_present", sql`length(btrim(${table.reason})) > 0`),
    check("account_cancellation_requests_version_valid", sql`${table.version} >= 0`),
    check("account_cancellation_requests_waiting_valid", sql`${table.waitingPeriodEndsAt} > ${table.requestedAt}`),
    check(
      "account_cancellation_requests_state_consistent",
      sql`(${table.status} = 'REQUESTED' AND ${table.processingAt} IS NULL AND ${table.cancelledAt} IS NULL AND ${table.completedAt} IS NULL AND ${table.rejectedAt} IS NULL AND ${table.rejectionReason} IS NULL AND ${table.decisionAdminOperationLogId} IS NULL) OR (${table.status} = 'CANCELLED' AND ${table.cancelledAt} IS NOT NULL AND ${table.completedAt} IS NULL AND ${table.rejectedAt} IS NULL AND ${table.rejectionReason} IS NULL AND ${table.decisionAdminOperationLogId} IS NULL) OR (${table.status} = 'PROCESSING' AND ${table.processingAt} IS NOT NULL AND ${table.cancelledAt} IS NULL AND ${table.completedAt} IS NULL AND ${table.rejectedAt} IS NULL AND ${table.rejectionReason} IS NULL) OR (${table.status} = 'COMPLETED' AND ${table.processingAt} IS NOT NULL AND ${table.cancelledAt} IS NULL AND ${table.completedAt} IS NOT NULL AND ${table.rejectedAt} IS NULL AND ${table.rejectionReason} IS NULL) OR (${table.status} = 'REJECTED' AND ${table.cancelledAt} IS NULL AND ${table.completedAt} IS NULL AND ${table.rejectedAt} IS NOT NULL AND ${table.rejectionReason} IS NOT NULL AND length(btrim(${table.rejectionReason})) > 0 AND ${table.decisionAdminOperationLogId} IS NOT NULL)`,
    ),
  ],
);

export const securityLogs = pgTable(
  "security_logs",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    adminId: uuid("admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    status: securityEventStatusEnum("status").default("OPEN").notNull(),
    riskScore: integer("risk_score").default(0).notNull(),
    metadataJson: jsonb("metadata_json").default({}).notNull(),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    resolvedByAdminId: uuid("resolved_by_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("security_logs_status_idx").on(table.status, table.createdAt), index("security_logs_status_created_id_idx").on(table.status, table.createdAt, table.id), index("security_logs_user_idx").on(table.userId, table.createdAt), check("security_logs_risk_score_valid", sql`${table.riskScore} BETWEEN 0 AND 100`)],
);

export const riskEvents = pgTable(
  "risk_events",
  {
    id: uuid("id").primaryKey(),
    riskType: varchar("risk_type", { length: 128 }).notNull(),
    severity: supportPriorityEnum("severity").notNull(),
    targetType: relatedObjectTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    ruleKey: varchar("rule_key", { length: 128 }).notNull(),
    detailsJson: jsonb("details_json").default({}).notNull(),
    status: riskEventStatusEnum("status").default("OPEN").notNull(),
    assignedAdminId: uuid("assigned_admin_id").references(() => adminAccounts.id, { onDelete: "restrict" }),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    version: integer("version").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("risk_events_status_severity_idx").on(table.status, table.severity, table.createdAt), index("risk_events_status_created_id_idx").on(table.status, table.createdAt, table.id), index("risk_events_target_idx").on(table.targetType, table.targetId)],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id").notNull(),
    aggregateType: varchar("aggregate_type", { length: 64 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    schemaVersion: integer("schema_version").default(1).notNull(),
    payloadJson: jsonb("payload_json").notNull(),
    traceId: varchar("trace_id", { length: 128 }),
    status: outboxStatusEnum("status").default("PENDING").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("outbox_events_event_id_uq").on(table.eventId), index("outbox_events_dispatch_idx").on(table.status, table.availableAt), index("outbox_events_aggregate_idx").on(table.aggregateType, table.aggregateId, table.createdAt), check("outbox_attempts_nonnegative", sql`${table.attempts} >= 0`)],
);

export const inboxEvents = pgTable(
  "inbox_events",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id").notNull(),
    consumerName: varchar("consumer_name", { length: 128 }).notNull(),
    status: inboxStatusEnum("status").default("PROCESSING").notNull(),
    payloadSha256: char("payload_sha256", { length: 64 }).notNull(),
    processingError: text("processing_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("inbox_events_consumer_event_uq").on(table.eventId, table.consumerName), index("inbox_events_status_idx").on(table.status, table.createdAt)],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey(),
    scope: varchar("scope", { length: 64 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    requestHash: char("request_hash", { length: 64 }).notNull(),
    status: idempotencyStatusEnum("status").default("PROCESSING").notNull(),
    responseCode: integer("response_code"),
    responseBodyJson: jsonb("response_body_json"),
    resourceType: relatedObjectTypeEnum("resource_type"),
    resourceId: uuid("resource_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("idempotency_keys_scope_key_uq").on(table.scope, table.idempotencyKey), index("idempotency_keys_expires_idx").on(table.expiresAt), check("idempotency_resource_pair", sql`(${table.resourceType} IS NULL) = (${table.resourceId} IS NULL)`)],
);

export const scheduledJobs = pgTable(
  "scheduled_jobs",
  {
    id: uuid("id").primaryKey(),
    jobKey: varchar("job_key", { length: 160 }).notNull(),
    jobType: varchar("job_type", { length: 128 }).notNull(),
    targetType: relatedObjectTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    payloadJson: jsonb("payload_json").default({}).notNull(),
    status: scheduledJobStatusEnum("status").default("PENDING").notNull(),
    runAt: timestamp("run_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: varchar("locked_by", { length: 128 }),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("scheduled_jobs_key_uq").on(table.jobKey), index("scheduled_jobs_dispatch_idx").on(table.status, table.runAt), check("scheduled_jobs_attempts_valid", sql`${table.attempts} >= 0 AND ${table.maxAttempts} > 0`)],
);
