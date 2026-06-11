/**
 * Nghiệp vụ thanh toán: tạo payment link, tra đơn (kèm sở hữu), hủy đơn.
 *
 * Nguyên tắc bảo mật: giá (amount) do server tra từ lib/plans.ts — KHÔNG BAO GIỜ tin
 * số tiền từ client. Đơn lưu PENDING kèm userId để webhook biết kích hoạt gói cho ai.
 */
import { TooManyRequestError } from "@payos/node";
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

/**
 * PayOS trả 429 (gọi API quá nhiều) — controller map sang HTTP 429.
 * Tách riêng khỏi PaymentGatewayError vì client nên BACK OFF rồi thử lại, không phải lỗi 502.
 */
export class PaymentRateLimitError extends Error {
  retryAfterSec?: number;
  constructor(message: string, retryAfterSec?: number) {
    super(message);
    this.name = "PaymentRateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

export const paymentsService = {
  async createPaymentLink(input: {
    userId: string;
    planId: PlanId;
    origin: string;
    creatorIp: string | null;
    creatorUserAgent: string | null;
  }): Promise<{ orderCode: number; checkoutUrl: string; returnUrl: string; expiredAt: number }> {
    // planId đã được controller validate qua CreatePaymentBody nên getPlan luôn tìm thấy.
    const plan = getPlan(input.planId)!;

    // TÁI DÙNG đơn PENDING còn sống cùng plan thay vì tạo link mới: idempotent với
    // double-click, đỡ gọi PayOS thừa (tránh 429), đỡ phình DB. Link PayOS bất biến nên
    // cùng plan ⇒ link cũ vẫn đúng. (Faker xoay uid thì lớp rate-limit theo IP ở controller lo.)
    const reusable = ordersRepo.findReusablePending(input.userId, plan.id);
    if (reusable) {
      logger.info(
        { orderCode: reusable.orderCode, planId: plan.id, userId: input.userId },
        "reused pending order",
      );
      return {
        orderCode: reusable.orderCode,
        checkoutUrl: reusable.checkoutUrl,
        returnUrl: reusable.returnUrl ?? `${input.origin}/`,
        expiredAt: reusable.expiredAt,
      };
    }

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
      // PayOS rate-limit (429): KHÔNG auto-retry (retry khi đang bị limit chỉ làm tệ hơn) —
      // back off + báo client thử lại. Đọc Retry-After nếu PayOS có gửi.
      if (err instanceof TooManyRequestError) {
        const header = err.headers?.get("retry-after");
        const retryAfterSec = header ? Number(header) || undefined : undefined;
        logger.warn(
          { orderCode, planId: plan.id, retryAfterSec },
          "PayOS 429 — đang chạm rate-limit cổng",
        );
        throw new PaymentRateLimitError("Cổng thanh toán đang bận", retryAfterSec);
      }
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
      creatorUserAgent: input.creatorUserAgent,
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
