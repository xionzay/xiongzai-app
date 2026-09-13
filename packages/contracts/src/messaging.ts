export const conversationTypes = ["CONSULTATION", "ORDER", "SUPPORT"] as const;
export const conversationMemberRoles = ["BUYER", "SELLER", "USER", "ADMIN", "SYSTEM"] as const;
export const messageSendStatuses = ["SENT", "FAILED", "DELETED"] as const;
export const supportCaseStatuses = ["WAITING", "SERVING", "TRANSFERRED", "CLOSED"] as const;
export const supportPriorities = ["NORMAL", "MEDIUM", "HIGH", "URGENT"] as const;
export const notificationCategories = ["ORDER", "ACCOUNT", "PLATFORM"] as const;
export const notificationReadStatuses = ["UNREAD", "READ"] as const;
export const relatedObjectTypes = ["USER", "SELLER", "PRODUCT", "ORDER", "PAYMENT", "REFUND", "COMPLAINT", "REVIEW", "WITHDRAWAL", "CONVERSATION", "SUPPORT_CASE", "PLATFORM"] as const;

export type ConversationType = typeof conversationTypes[number];
export type ConversationMemberRole = typeof conversationMemberRoles[number];
export type MessageSendStatus = typeof messageSendStatuses[number];
export type SupportCaseStatus = typeof supportCaseStatuses[number];
export type SupportPriority = typeof supportPriorities[number];
export type NotificationCategory = typeof notificationCategories[number];
export type NotificationReadStatus = typeof notificationReadStatuses[number];
export type RelatedObjectType = typeof relatedObjectTypes[number];
