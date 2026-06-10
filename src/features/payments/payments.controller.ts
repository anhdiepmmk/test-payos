/**
 * Controller payments — CHỈ lo HTTP: danh tính, validate input, gọi service, map đáp.
 *   POST   /api/payments              — tạo payment link
 *   GET    /api/payments/[orderCode]  — trạng thái đơn (client poll)
 *   DELETE /api/payments/[orderCode]  — hủy đơn
 * GET/DELETE check sở hữu trong service: đoán được orderCode người khác cũng chỉ nhận 404.
 */
import { getClientIp } from "@/lib/ip";
import { getUserId } from "@/lib/user";
import { CreatePaymentBody, OrderCodeParam } from "./payments.schema";
import { requestOrigin } from "./payments.helpers";
import { PaymentGatewayError, paymentsService } from "./payments.service";

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) {
    return Response.json({ error: "Thiếu danh tính user (cookie uid)" }, { status: 401 });
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
      creatorIp: getClientIp(req),
    });
    return Response.json(result);
  } catch (err) {
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
