import { pgTable, uuid, integer, text, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { listings, orders, users } from './schema.js';

export const productFavorites=pgTable('product_favorites',{
 userId:uuid('user_id').notNull().references(()=>users.id),listingId:uuid('listing_id').notNull().references(()=>listings.id),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[primaryKey({columns:[t.userId,t.listingId]})]);
export const storeFavorites=pgTable('store_favorites',{
 userId:uuid('user_id').notNull().references(()=>users.id),sellerId:uuid('seller_id').notNull().references(()=>users.id),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[primaryKey({columns:[t.userId,t.sellerId]})]);
export const orderReviews=pgTable('order_reviews',{
 id:uuid().primaryKey().defaultRandom(),orderId:uuid('order_id').notNull().unique().references(()=>orders.id),buyerId:uuid('buyer_id').notNull().references(()=>users.id),sellerId:uuid('seller_id').notNull().references(()=>users.id),listingId:uuid('listing_id').notNull().references(()=>listings.id),buyerNickname:text('buyer_nickname').notNull(),rating:integer().notNull(),text:text().notNull(),
 status:text().$type<'visible'|'hidden'>().notNull().default('visible'),moderationReason:text('moderation_reason'),moderatorId:uuid('moderator_id').references(()=>users.id),moderatedAt:timestamp('moderated_at',{withTimezone:true}),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[index('order_reviews_seller_time').on(t.sellerId,t.createdAt)]);
