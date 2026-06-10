/**
 * Nghiệp vụ thanh toán: tạo payment link, tra đơn (kèm sở hữu), hủy đơn.
 *
 * Nguyên tắc bảo mật: giá (amount) do server tra từ lib/plans.ts — KHÔNG BAO GIỜ tin
 * số tiền từ client. Đơn lưu PENDING kèm userId để webhook biết kích hoạt gói cho ai.
 */
import type { OrderRow } from "@/lib/db/schema";
import { expiryUnix, nowIso } from "@/lib/datetime";
import { logger } from "@/lib/logger";
import { payos } from "@/lib/payos";
import { getPlan, type PlanId } from "@/lib/plans";
import { getOwnedOrder } from "@/domain/orders.domain";
import { ordersRepo } from "@/repositories/orders.repository";
import { generateOrderCode } from "./payments.helpers";

/** Lỗi khi gọi cổng PayOS — controller map sang HTTP 502. */
export class PaymentGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentGatewayError";
  }
}

export const paymentsService = {
  async createPaymentLink(input: {
    userId: string;
    planId: PlanId;
    origin: string;
    creatorIp: string | null;
  }): Promise<{ orderCode: number; checkoutUrl: string; returnUrl: string; expiredAt: number }> {
    // planId đã được controller validate qua CreatePaymentBody nên getPlan luôn tìm thấy.
    const plan = getPlan(input.planId)!;
    const orderCode = generateOrderCode();
    const expiredAt = expiryUnix(15); // PayOS yêu cầu unix GIÂY (Int32) — QR sống 15 phút
    const returnUrl = `${input.origin}/`;

    let checkoutUrl: string;
    try {
      const link = await payos.paymentRequests.create({
        orderCode,
        amount: plan.price,
        description: plan.description, // memo chuyển khoản — PayOS giới hạn 9 ký tự
        returnUrl, // bắt buộc kể cả khi nhúng embedded; client dùng LẠI nguyên chuỗi này
        cancelUrl: returnUrl,
        expiredAt,
      });
      checkoutUrl = link.checkoutUrl;
    } catch (err) {
      logger.error({ err, orderCode, planId: plan.id }, "create payment link failed");
      throw new PaymentGatewayError(err instanceof Error ? err.message : "Lỗi không xác định");
    }

    ordersRepo.insert({
      orderCode,
      userId: input.userId,
      planId: plan.id,
      amount: plan.price,
      description: plan.description,
      checkoutUrl,
      returnUrl,
      expiredAt,
      status: "PENDING",
      createdAt: nowIso(),
      creatorIp: input.creatorIp,
    });

    logger.info(
      { orderCode, planId: plan.id, amount: plan.price, userId: input.userId },
      "payment link created",
    );
    return { orderCode, checkoutUrl, returnUrl, expiredAt };
  },

  /** Tra đơn + kiểm tra sở hữu (trả null cho mọi trường hợp không hợp lệ → 404 đồng nhất). */
  getOwnedOrder(userId: string | null, orderCode: number): OrderRow | null {
    return getOwnedOrder(orderCode, userId);
  },

  async cancelOrder(
    userId: string | null,
    orderCode: number,
  ): Promise<{ found: boolean; cancelled: boolean }> {
    const order = getOwnedOrder(orderCode, userId);
    if (!order) return { found: false, cancelled: false };

    const cancelled = ordersRepo.markCancelled(order.orderCode); // chỉ khi PENDING/EXPIRED
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
    return { found: true, cancelled };
  },
};
