/**
 * Repository bảng `webhook_events` — lưu vết MỌI webhook delivery (kể cả sai chữ ký).
 * Truy cập dữ liệu thuần.
 */
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookEvents, type NewWebhookEvent, type WebhookEventRow } from "@/lib/db/schema";

export const eventsRepo = {
  insert(event: NewWebhookEvent): void {
    db.insert(webhookEvents).values(event).run();
  },

  listRecent(limit = 50): WebhookEventRow[] {
    return db
      .select()
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.id))
      .limit(limit)
      .all();
  },
};
