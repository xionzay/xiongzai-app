import { and, eq } from "drizzle-orm";
import { deliveryLogs, notifications, uuidv7, type Database } from "@xiongzai/database";
import { InboxService } from "./reliability.js";

export type NotificationInboxInput = {
  eventId: string;
  userId: string;
  category: typeof notifications.$inferInsert.category;
  notificationType: string;
  title: string;
  contentTemplateId: string;
  contentVariables?: Record<string, unknown>;
  relatedType?: typeof notifications.$inferInsert.relatedType;
  relatedId?: string;
};

export class NotificationInboxConsumer {
  static readonly consumerName = "in-app-notification-v1";
  private readonly inbox = new InboxService();

  constructor(private readonly database: Database) {}

  async consume(input: NotificationInboxInput): Promise<{ created: boolean; notificationId: string }> {
    return this.database.transaction(async (tx) => {
      const payload = { ...input, contentVariables: input.contentVariables ?? {} };
      const claimed = await this.inbox.claim(tx, { eventId: input.eventId, consumerName: NotificationInboxConsumer.consumerName, payload });
      const idempotencyKey = `inbox:${NotificationInboxConsumer.consumerName}:${input.eventId}:${input.userId}`;
      if (!claimed) {
        const [existing] = await tx.select({ id: notifications.id }).from(notifications).where(eq(notifications.idempotencyKey, idempotencyKey)).limit(1);
        if (!existing) throw new Error("Completed notification Inbox event has no notification row.");
        return { created: false, notificationId: existing.id };
      }

      const notificationId = uuidv7();
      const inserted = await tx.insert(notifications).values({
        id: notificationId,
        userId: input.userId,
        category: input.category,
        notificationType: input.notificationType,
        title: input.title,
        contentTemplateId: input.contentTemplateId,
        contentVariablesJson: input.contentVariables ?? {},
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        idempotencyKey,
      }).onConflictDoNothing().returning({ id: notifications.id });
      const resolvedId = inserted[0]?.id ?? (await tx.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, input.userId), eq(notifications.idempotencyKey, idempotencyKey))).limit(1))[0]?.id;
      if (!resolvedId) throw new Error("Notification idempotency conflict could not be resolved.");
      await tx.insert(deliveryLogs).values({ id: uuidv7(), notificationId: resolvedId, channel: "IN_APP", status: "SENT", attemptCount: 1, sentAt: new Date() }).onConflictDoNothing();
      await this.inbox.complete(tx, input.eventId, NotificationInboxConsumer.consumerName);
      return { created: Boolean(inserted[0]), notificationId: resolvedId };
    });
  }
}
