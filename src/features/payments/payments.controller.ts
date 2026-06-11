/**
 * Controller payments — CHỈ lo HTTP: danh tính, validate input, gọi service, map đáp.
 *   POST   /api/payments              — tạo payment link
 *   GET    /api/payments/[orderCode]  — trạng thái đơn (client poll)
 *   DELETE /api/payments/[orderCode]  — hủy đơn
 * GET/DELETE check sở hữu trong service: đoán được orderCode người khác cũng chỉ nhận 404.
 */
import { getClientIp, isPrivateIp } from "@/lib/ip";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { getUserId } from "@/lib/user";
import { CreatePaymentBody, OrderCodeParam } from "./payments.schema";
import { requestOrigin } from "./payments.helpers";
import { PaymentGatewayError, PaymentRateLimitError, paymentsService } from "./payments.service";

/** Trần tạo đơn cho MỖI IP: 5 đơn / 60 giây. Đặt thấp có chủ đích — người thật tạo đơn
 *  vài phút/lần, còn ngưỡng 429 thật của PayOS không công bố nên ta tự chặn rộng tay từ trước. */
const CREATE_LIMIT = { limit: 5, windowMs: 60_000 };

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) {
    return Response.json({ error: "Thiếu danh tính user (cookie uid)" }, { status: 401 });
  }

  // Rate-limit theo IP (cf-connecting-ip), KHÔNG theo uid (uid giả mạo được). Bỏ qua khi
  // không có IP hoặc IP loopback/private (localhost dev — Next dev tự thêm x-forwarded-for=::1)
  // để không chặn dev. An toàn: sau cloudflared, cf-connecting-ip luôn là IP public thật.
  const ip = getClientIp(req);
  if (ip && !isPrivateIp(ip)) {
    const rl = checkRateLimit(ip, CREATE_LIMIT);
    if (!rl.ok) {
      logger.warn({ ip }, "rate limit: create payment");
      return Response.json(
        { error: "Bạn thao tác quá nhanh, thử lại sau ít phút" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Body phải là JSON" }, { status: 400 });
  }
  const parsed = CreatePaymentBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "planId không hợp lệ" }, { status: 400 });
  }

  try {
    const result = await paymentsService.createPaymentLink({
      userId,
      planId: parsed.data.planId,
      origin: requestOrigin(req), // cần Request → tính ở controller
      creatorIp: ip,
      creatorUserAgent: req.headers.get("user-agent"),
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof PaymentRateLimitError) {
      const headers = err.retryAfterSec
        ? { "Retry-After": String(err.retryAfterSec) }
        : undefined;
      return Response.json(
        { error: "Cổng thanh toán đang bận, thử lại sau ít phút" },
        { status: 429, headers },
      );
    }
    if (err instanceof PaymentGatewayError) {
      return Response.json(
        { error: `Không tạo được link thanh toán: ${err.message}` },
        { status: 502 },
      );
    }
    throw err;
  }
}

type OrderCodeContext = { params: Promise<{ orderCode: string }> };

export async function GET(_req: Request, context: OrderCodeContext) {
  const userId = await getUserId();
  const parsed = OrderCodeParam.safeParse((await context.params).orderCode);
  if (!parsed.success) {
    return Response.json({ error: "Không tìm thấy đơn" }, { status: 404 });
  }
  const order = paymentsService.getOwnedOrder(userId, parsed.data);
  if (!order) {
    return Response.json({ error: "Không tìm thấy đơn" }, { status: 404 });
  }
  return Response.json(order);
}

export async function DELETE(_req: Request, context: OrderCodeContext) {
  const userId = await getUserId();
  const parsed = OrderCodeParam.safeParse((await context.params).orderCode);
  if (!parsed.success) {
    return Response.json({ error: "Không tìm thấy đơn" }, { status: 404 });
  }
  const { found, cancelled } = await paymentsService.cancelOrder(userId, parsed.data);
  if (!found) {
    return Response.json({ error: "Không tìm thấy đơn" }, { status: 404 });
  }
  return Response.json({ ok: true, cancelled });
}
