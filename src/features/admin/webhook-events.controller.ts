/**
 * GET /api/webhook-events — 50 webhook delivery gần nhất (trang Admin xem realtime).
 * Demo không auth — production phải bảo vệ (như /api/admin/orders).
 */
import { webhookEventsService } from "./webhook-events.service";

export async function GET() {
  return Response.json(webhookEventsService.listRecent());
}
