/**
 * GET    /api/payments/[orderCode] — trạng thái đơn (client poll trong lúc chờ thanh toán).
 *        Trạng thái lấy từ DB CỦA TA (webhook là nguồn sự thật), không gọi PayOS mỗi lần poll.
 * DELETE /api/payments/[orderCode] — hủy đơn (user bấm Hủy trong iframe PayOS).
 *
 * Cả hai đều CHECK SỞ HỮU: user chỉ thao tác được đơn của chính mình —
 * đoán được orderCode của người khác cũng chỉ nhận 404.
 */
import { getOrder, markCancelled } from "@/lib/db/queries";
import { logger } from "@/lib/logger";
import { payos } from "@/lib/payos";
import { OrderCodeParam } from "@/lib/schemas";
import { getUserId } from "@/lib/user";

type RouteContext = { params: Promise<{ orderCode: string }> };

/** Tra đơn + kiểm tra sở hữu. Trả null cho mọi trường hợp không hợp lệ (đáp 404 đồng nhất). */
async function findOwnedOrder(context: RouteContext) {
  const userId = await getUserId();
  if (!userId) return null;
  const parsed = OrderCodeParam.safeParse((await context.params).orderCode);
  if (!parsed.success) return null;
  const order = getOrder(parsed.data);
  if (!order || order.userId !== userId) return null;
  return order;
}

export async function GET(_req: Request, context: RouteContext) {
  const order = await findOwnedOrder(context);
  if (!order) {
    return Response.json({ error: "Không tìm thấy đơn" }, { status: 404 });
  }
  return Response.json(order);
}

export async function DELETE(_req: Request, context: RouteContext) {
  const order = await findOwnedOrder(context);
  if (!order) {
    return Response.json({ error: "Không tìm thấy đơn" }, { status: 404 });
  }

  const cancelled = markCancelled(order.orderCode); // chỉ khi PENDING/EXPIRED
  if (cancelled) {
    // Hủy phía PayOS là best-effort: lỗi mạng/PayOS không làm hỏng flow local.
    try {
      await payos.paymentRequests.cancel(order.orderCode, "Nguoi dung huy");
    } catch (err) {
      logger.warn(
        { err, orderCode: order.orderCode },
        "cancel on PayOS failed (order already cancelled locally)",
      );
    }
    logger.info({ orderCode: order.orderCode }, "order cancelled");
  }
  return Response.json({ ok: true, cancelled });
}
