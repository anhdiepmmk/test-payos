/**
 * GET /api/webhook-events — 50 webhook delivery gần nhất (trang Admin xem realtime).
 * Demo không auth — production phải bảo vệ (như /api/admin/orders).
 */
import { getWebhookEvents } from "@/lib/db/queries";

export async function GET() {
  return Response.json(getWebhookEvents());
}
