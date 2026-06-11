/**
 * Controller webhook PayOS — CHỈ lo HTTP.
 *   POST /api/webhooks/payos — đọc raw body + IP, đẩy sang service, LUÔN đáp 200.
 *   GET  /api/webhooks/payos — tự kiểm tra tunnel bằng trình duyệt (PayOS không gọi GET).
 *
 * Luôn 200: PayOS chỉ cần biết "đã nhận được"; từ chối xử lý đã đủ an toàn ở tầng nghiệp
 * vụ, và lưu Webhook Url trên dashboard cần response 2XX mới thành công.
 */
import { getClientIp } from "@/lib/ip";
import { webhooksService } from "./webhooks.service";

export async function POST(req: Request) {
  // callerIp + rawText lấy trước khi parse — qua cloudflared, cf-connecting-ip = IP server PayOS.
  const callerIp = getClientIp(req);
  const callerUserAgent = req.headers.get("user-agent");
  const rawText = await req.text();
  const { success } = await webhooksService.processWebhook(rawText, callerIp, callerUserAgent);
  return Response.json({ success }, { status: 200 });
}

export async function GET() {
  return Response.json({ ok: true, endpoint: "PayOS webhook", expects: "POST" });
}
