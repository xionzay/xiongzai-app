import { relations } from "drizzle-orm";
import {
  accountCancellationRequests,
  adminAccounts,
  adminOperationLogs,
  complaintEvidences,
  complaintLogs,
  complaints,
  conversationMembers,
  conversations,
  deliveryLogs,
  favorites,
  files,
  identityVerifications,
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
  messages,
  notifications,
  orderSlotReservations,
  orderStatusLogs,
  orders,
  paymentEvents,
  payments,
  payoutAccounts,
  personalDataExportJobs,
  phoneChangeRequests,
  policyVersions,
  productImages,
  productReviewLogs,
  productSkus,
  productVersions,
  products,
  ratingAggregates,
  reconciliationItems,
  reconciliationRuns,
  refundLogs,
  refunds,
  reviews,
  sellerApplications,
  sellerAvailabilitySlots,
  sellerIncomes,
  sellerLiabilities,
  sellerLiabilityAllocations,
  sellerProfiles,
  sellerReviewLogs,
  smsCodes,
  supportCaseLogs,
  supportCases,
  userProfiles,
  userPolicyAcceptances,
  users,
  withdrawalIncomeAllocations,
  withdrawalLogs,
  withdrawals,
} from "./schema.js";

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles, { fields: [users.id], references: [userProfiles.userId] }),
  sellerProfile: one(sellerProfiles, { fields: [users.id], references: [sellerProfiles.userId] }),
  identityVerifications: many(identityVerifications),
  buyerOrders: many(orders, { relationName: "buyerOrders" }),
  sellerOrders: many(orders, { relationName: "sellerUserOrders" }),
  favorites: many(favorites),
  conversationMemberships: many(conversationMembers),
  notifications: many(notifications),
  phoneChangeRequests: many(phoneChangeRequests),
  personalDataExportJobs: many(personalDataExportJobs),
  accountCancellationRequests: many(accountCancellationRequests),
}));

export const phoneChangeRequestsRelations = relations(phoneChangeRequests, ({ one }) => ({
  user: one(users, { fields: [phoneChangeRequests.userId], references: [users.id] }),
  oldSmsCode: one(smsCodes, {
    fields: [phoneChangeRequests.oldSmsCodeId],
    references: [smsCodes.id],
    relationName: "phoneChangeOldSmsCode",
  }),
  newSmsCode: one(smsCodes, {
    fields: [phoneChangeRequests.newSmsCodeId],
    references: [smsCodes.id],
    relationName: "phoneChangeNewSmsCode",
  }),
}));

export const smsCodesRelations = relations(smsCodes, ({ many }) => ({
  oldPhoneChangeRequests: many(phoneChangeRequests, { relationName: "phoneChangeOldSmsCode" }),
  newPhoneChangeRequests: many(phoneChangeRequests, { relationName: "phoneChangeNewSmsCode" }),
}));

export const personalDataExportJobsRelations = relations(personalDataExportJobs, ({ one }) => ({
  user: one(users, { fields: [personalDataExportJobs.userId], references: [users.id] }),
  outputFile: one(files, { fields: [personalDataExportJobs.outputFileId], references: [files.id] }),
}));

export const accountCancellationRequestsRelations = relations(accountCancellationRequests, ({ one }) => ({
  user: one(users, { fields: [accountCancellationRequests.userId], references: [users.id] }),
  decisionOperationLog: one(adminOperationLogs, {
    fields: [accountCancellationRequests.decisionAdminOperationLogId],
    references: [adminOperationLogs.id],
  }),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, { fields: [userProfiles.userId], references: [users.id] }),
  avatar: one(files, { fields: [userProfiles.avatarFileId], references: [files.id] }),
}));

export const policyVersionsRelations = relations(policyVersions, ({ many }) => ({
  acceptances: many(userPolicyAcceptances),
  onboardingApplications: many(sellerApplications, { relationName: "sellerOnboardingPolicy" }),
  authorizedVoiceProfiles: many(sellerProfiles, { relationName: "sellerVoiceAuthorizationPolicy" }),
  transactionOrders: many(orders, { relationName: "orderTransactionPolicy" }),
  refundOrders: many(orders, { relationName: "orderRefundPolicy" }),
}));

export const userPolicyAcceptancesRelations = relations(userPolicyAcceptances, ({ one }) => ({
  user: one(users, { fields: [userPolicyAcceptances.userId], references: [users.id] }),
  policyVersion: one(policyVersions, { fields: [userPolicyAcceptances.policyVersionId], references: [policyVersions.id] }),
}));

export const sellerProfilesRelations = relations(sellerProfiles, ({ one, many }) => ({
  user: one(users, { fields: [sellerProfiles.userId], references: [users.id] }),
  voiceAuthorizationPolicy: one(policyVersions, {
    fields: [sellerProfiles.voiceAuthorizationPolicyVersionId],
    references: [policyVersions.id],
    relationName: "sellerVoiceAuthorizationPolicy",
  }),
  applications: many(sellerApplications),
  products: many(products),
  orders: many(orders),
  slots: many(sellerAvailabilitySlots),
  incomes: many(sellerIncomes),
  liabilities: many(sellerLiabilities),
  payoutAccounts: many(payoutAccounts),
  withdrawals: many(withdrawals),
}));

export const sellerApplicationsRelations = relations(sellerApplications, ({ one, many }) => ({
  seller: one(sellerProfiles, { fields: [sellerApplications.sellerId], references: [sellerProfiles.id] }),
  onboardingPolicy: one(policyVersions, {
    fields: [sellerApplications.onboardingPolicyVersionId],
    references: [policyVersions.id],
    relationName: "sellerOnboardingPolicy",
  }),
  reviewLogs: many(sellerReviewLogs),
}));

export const sellerReviewLogsRelations = relations(sellerReviewLogs, ({ one }) => ({
  application: one(sellerApplications, { fields: [sellerReviewLogs.applicationId], references: [sellerApplications.id] }),
  seller: one(sellerProfiles, { fields: [sellerReviewLogs.sellerId], references: [sellerProfiles.id] }),
  admin: one(adminAccounts, { fields: [sellerReviewLogs.adminId], references: [adminAccounts.id] }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  seller: one(sellerProfiles, { fields: [products.sellerId], references: [sellerProfiles.id] }),
  versions: many(productVersions),
  reviewLogs: many(productReviewLogs),
  skus: many(productSkus),
  images: many(productImages),
  orders: many(orders),
  reviews: many(reviews),
}));

export const productVersionsRelations = relations(productVersions, ({ one }) => ({
  product: one(products, { fields: [productVersions.productId], references: [products.id] }),
}));

export const productSkusRelations = relations(productSkus, ({ one, many }) => ({
  product: one(products, { fields: [productSkus.productId], references: [products.id] }),
  orders: many(orders),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
  file: one(files, { fields: [productImages.fileId], references: [files.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  buyer: one(users, { fields: [orders.buyerId], references: [users.id], relationName: "buyerOrders" }),
  sellerUser: one(users, { fields: [orders.sellerUserId], references: [users.id], relationName: "sellerUserOrders" }),
  seller: one(sellerProfiles, { fields: [orders.sellerId], references: [sellerProfiles.id] }),
  product: one(products, { fields: [orders.productId], references: [products.id] }),
  sku: one(productSkus, { fields: [orders.skuId], references: [productSkus.id] }),
  transactionPolicy: one(policyVersions, {
    fields: [orders.transactionPolicyVersionId],
    references: [policyVersions.id],
    relationName: "orderTransactionPolicy",
  }),
  refundPolicy: one(policyVersions, {
    fields: [orders.refundPolicyVersionId],
    references: [policyVersions.id],
    relationName: "orderRefundPolicy",
  }),
  reservation: one(orderSlotReservations, { fields: [orders.id], references: [orderSlotReservations.orderId] }),
  statusLogs: many(orderStatusLogs),
  payments: many(payments),
  refunds: many(refunds),
  complaints: many(complaints),
  review: one(reviews, { fields: [orders.id], references: [reviews.orderId] }),
  income: one(sellerIncomes, { fields: [orders.id], references: [sellerIncomes.orderId] }),
  conversations: many(conversations),
}));

export const reservationsRelations = relations(orderSlotReservations, ({ one }) => ({
  order: one(orders, { fields: [orderSlotReservations.orderId], references: [orders.id] }),
  slot: one(sellerAvailabilitySlots, { fields: [orderSlotReservations.slotId], references: [sellerAvailabilitySlots.id] }),
  seller: one(sellerProfiles, { fields: [orderSlotReservations.sellerId], references: [sellerProfiles.id] }),
}));

export const orderStatusLogsRelations = relations(orderStatusLogs, ({ one }) => ({
  order: one(orders, { fields: [orderStatusLogs.orderId], references: [orders.id] }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
  events: many(paymentEvents),
  refunds: many(refunds),
}));

export const paymentEventsRelations = relations(paymentEvents, ({ one }) => ({
  payment: one(payments, { fields: [paymentEvents.paymentId], references: [payments.id] }),
}));

export const refundsRelations = relations(refunds, ({ one, many }) => ({
  order: one(orders, { fields: [refunds.orderId], references: [orders.id] }),
  payment: one(payments, { fields: [refunds.paymentId], references: [payments.id] }),
  logs: many(refundLogs),
  liability: one(sellerLiabilities, { fields: [refunds.id], references: [sellerLiabilities.refundId] }),
}));

export const complaintsRelations = relations(complaints, ({ one, many }) => ({
  order: one(orders, { fields: [complaints.orderId], references: [orders.id] }),
  evidences: many(complaintEvidences),
  logs: many(complaintLogs),
}));

export const complaintEvidencesRelations = relations(complaintEvidences, ({ one }) => ({
  complaint: one(complaints, { fields: [complaintEvidences.complaintId], references: [complaints.id] }),
  file: one(files, { fields: [complaintEvidences.fileId], references: [files.id] }),
  submittedByUser: one(users, { fields: [complaintEvidences.submittedByUserId], references: [users.id] }),
  submittedByAdmin: one(adminAccounts, { fields: [complaintEvidences.submittedByAdminId], references: [adminAccounts.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  order: one(orders, { fields: [reviews.orderId], references: [orders.id] }),
  product: one(products, { fields: [reviews.productId], references: [products.id] }),
  seller: one(sellerProfiles, { fields: [reviews.sellerId], references: [sellerProfiles.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  product: one(products, { fields: [conversations.productId], references: [products.id] }),
  order: one(orders, { fields: [conversations.orderId], references: [orders.id] }),
  members: many(conversationMembers),
  messages: many(messages),
  supportCase: one(supportCases, { fields: [conversations.id], references: [supportCases.conversationId] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));

export const supportCasesRelations = relations(supportCases, ({ one, many }) => ({
  requester: one(users, { fields: [supportCases.requesterId], references: [users.id] }),
  conversation: one(conversations, { fields: [supportCases.conversationId], references: [conversations.id] }),
  assignedAdmin: one(adminAccounts, { fields: [supportCases.assignedAdminId], references: [adminAccounts.id] }),
  logs: many(supportCaseLogs),
}));

export const notificationsRelations = relations(notifications, ({ one, many }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  deliveryLogs: many(deliveryLogs),
}));

export const ledgerTransactionsRelations = relations(ledgerTransactions, ({ many }) => ({
  entries: many(ledgerEntries),
  incomes: many(sellerIncomes),
  liabilities: many(sellerLiabilities),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  transaction: one(ledgerTransactions, { fields: [ledgerEntries.transactionId], references: [ledgerTransactions.id] }),
  account: one(ledgerAccounts, { fields: [ledgerEntries.accountId], references: [ledgerAccounts.id] }),
}));

export const sellerIncomesRelations = relations(sellerIncomes, ({ one, many }) => ({
  seller: one(sellerProfiles, { fields: [sellerIncomes.sellerId], references: [sellerProfiles.id] }),
  order: one(orders, { fields: [sellerIncomes.orderId], references: [orders.id] }),
  ledgerTransaction: one(ledgerTransactions, { fields: [sellerIncomes.ledgerTransactionId], references: [ledgerTransactions.id] }),
  withdrawalAllocations: many(withdrawalIncomeAllocations),
  liabilityAllocations: many(sellerLiabilityAllocations),
}));

export const sellerLiabilitiesRelations = relations(sellerLiabilities, ({ one, many }) => ({
  seller: one(sellerProfiles, { fields: [sellerLiabilities.sellerId], references: [sellerProfiles.id] }),
  refund: one(refunds, { fields: [sellerLiabilities.refundId], references: [refunds.id] }),
  allocations: many(sellerLiabilityAllocations),
}));

export const withdrawalsRelations = relations(withdrawals, ({ one, many }) => ({
  seller: one(sellerProfiles, { fields: [withdrawals.sellerId], references: [sellerProfiles.id] }),
  payoutAccount: one(payoutAccounts, { fields: [withdrawals.payoutAccountId], references: [payoutAccounts.id] }),
  allocations: many(withdrawalIncomeAllocations),
  logs: many(withdrawalLogs),
}));

export const reconciliationRunsRelations = relations(reconciliationRuns, ({ many }) => ({
  items: many(reconciliationItems),
}));

export const ratingAggregatesRelations = relations(ratingAggregates, ({ one }) => ({
  seller: one(sellerProfiles, { fields: [ratingAggregates.sellerId], references: [sellerProfiles.id] }),
  product: one(products, { fields: [ratingAggregates.productId], references: [products.id] }),
}));
