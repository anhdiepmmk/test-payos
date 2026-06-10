/**
 * Nghiệp vụ nhật ký webhook cho trang Admin (đọc 50 delivery gần nhất).
 */
import { eventsRepo } from "@/repositories/webhook-events.repository";

export const webhookEventsService = {
  listRecent(limit = 50) {
    return eventsRepo.listRecent(limit);
  },
};
