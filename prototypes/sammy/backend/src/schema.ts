import { pgTable, uuid, text, boolean, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import type { Draft, Snapshot } from './validation.js';
export const users = pgTable('users', {
  id:uuid().primaryKey().defaultRandom(), phone:text().notNull().unique(), passwordHash:text('password_hash').notNull(),
  nickname:text().notNull(), bio:text().notNull().default(''), isAdmin:boolean('is_admin').notNull().default(false), isSupervisor:boolean('is_supervisor').notNull().default(false),
  suspended:boolean().notNull().default(false), suspensionReason:text('suspension_reason'), providerSuspended:boolean('provider_suspended').notNull().default(false), providerSuspensionReason:text('provider_suspension_reason'),
  avatarMediaId:uuid('avatar_media_id'), draft:jsonb().$type<Draft>(), createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
});
export const sessions=pgTable('sessions',{
  tokenHash:text('token_hash').primaryKey(), userId:uuid('user_id').references(()=>users.id).notNull(), expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),
});
export const media=pgTable('media',{
  id:uuid().primaryKey(), ownerId:uuid('owner_id').references(()=>users.id).notNull(), kind:text().$type<'avatar'|'voice'|'evidenceImage'|'evidenceVideo'>().notNull(),
  status:text().$type<'pending'|'ready'>().notNull(), key:text().notNull().unique(), mime:text().notNull(), bytes:integer().notNull(), durationMs:integer('duration_ms'),
  contentHash:text('content_hash'),
  createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
});
export const applications=pgTable('applications',{
  id:uuid().primaryKey().defaultRandom(), userId:uuid('user_id').references(()=>users.id).notNull(),
  status:text().$type<'pending'|'approved'|'changes_requested'>().notNull().default('pending'), snapshot:jsonb().$type<Snapshot>().notNull(),
  agreementVersion:text('agreement_version').notNull(), submittedAt:timestamp('submitted_at',{withTimezone:true}).defaultNow().notNull(),
  reviewedAt:timestamp('reviewed_at',{withTimezone:true}), reviewerId:uuid('reviewer_id').references(()=>users.id), reason:text(),
},t=>[index('applications_owner_time').on(t.userId,t.submittedAt)]);
export const rateLimits=pgTable('rate_limits', {key:text().primaryKey(),count:integer().notNull(),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull()});
export const listings=pgTable('listings',{
 id:uuid().primaryKey(),ownerId:uuid('owner_id').notNull().references(()=>users.id),title:text().notNull(),description:text().notNull(),
 game:text().$type<'peaceElite'>().notNull(),mode:text().$type<'duo'|'squad'>().notNull(),category:text().$type<'relaxed'|'ranked'>().notNull(),
 priceFen:integer('price_fen').notNull(),photoMediaIds:jsonb('photo_media_ids').$type<string[]>().notNull().default([]),
 moderationBlocked:boolean('moderation_blocked').notNull().default(false), moderationReason:text('moderation_reason'),
 status:text().$type<'draft'|'published'>().notNull().default('draft'),revision:integer().notNull().default(1),
 applicationId:uuid('application_id').references(()=>applications.id),publicationConsentAt:timestamp('publication_consent_at',{withTimezone:true}),
 updatedAt:timestamp('updated_at',{withTimezone:true}).defaultNow().notNull(),
});

export const adminActions=pgTable('admin_actions',{id:uuid().primaryKey().defaultRandom(),actorId:uuid('actor_id').notNull().references(()=>users.id),action:text().notNull(),targetId:uuid('target_id').notNull(),reason:text(),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull()});

export type OrderServiceSnapshot={id:string;revision:number;title:string;description:string;providerName:string;mode:'duo'|'squad';category:'relaxed'|'ranked';unitPriceFen:number;game:'peaceElite';photoMediaIds:string[]};
export type OrderRules={version:string;transactionReference:string;text:{en:string;zh:string}};
export type OrderDelivery={gameName:string;gameId:string;server:'wechat'|'qq';note:string};
export const orders=pgTable('orders',{
 id:uuid().primaryKey().defaultRandom(),buyerId:uuid('buyer_id').notNull().references(()=>users.id),sellerId:uuid('seller_id').notNull().references(()=>users.id),listingId:uuid('listing_id').notNull().references(()=>listings.id),
 requestId:text('request_id').notNull(),requestHash:text('request_hash').notNull(),service:jsonb().$type<OrderServiceSnapshot>().notNull(),rules:jsonb().$type<OrderRules>().notNull(),delivery:jsonb().$type<OrderDelivery>().notNull(),
 quantity:integer().notNull(),totalFen:integer('total_fen').notNull(),status:text().$type<'unpaid'|'awaitingService'|'closed'>().notNull().default('unpaid'),simulated:boolean().notNull().default(true),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),paidAt:timestamp('paid_at',{withTimezone:true}),closedAt:timestamp('closed_at',{withTimezone:true}),
},t=>[index('orders_buyer').on(t.buyerId,t.id),index('orders_seller').on(t.sellerId,t.id)]);
export const paymentAttempts=pgTable('payment_attempts',{
 id:uuid().primaryKey().defaultRandom(),orderId:uuid('order_id').notNull().references(()=>orders.id),requestId:text('request_id').notNull(),status:text().$type<'pending'|'succeeded'|'failed'>().notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),resolvedAt:timestamp('resolved_at',{withTimezone:true}),
});
