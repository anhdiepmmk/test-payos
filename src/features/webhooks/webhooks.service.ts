/**
 * Nghiệp vụ webhook PayOS — TRÁI TIM CỦA DEMO. NƠI DUY NHẤT kích hoạt gói cho user.
 *
 * Bảo vệ 3 lớp (URL lộ cũng không sao — bí mật là CHECKSUM KEY):
 *   1. Chữ ký HMAC-SHA256: payos.webhooks.verify() throw nếu payload không được ký đúng.
 *   2. Idempotent: ordersRepo.activateIfPending chỉ chuyển PENDING→PAID đúng 1 lần.
 *   3. Đối chiếu nghiệp vụ: sai số tiền / đơn đã hủy / đơn không tồn tại → không kích hoạt.
 *
 * MỌI delivery (kể cả sai chữ ký) đều được ghi webhook_events để audit/đối soát/debug.
 * Trả `success` để controller luôn đáp HTTP 200 (PayOS chỉ cần biết "đã nhận được").
 */
import type { WebhookData } from "@payos/node";
import { nowIso } from "@/lib/datetime";
import { logger } from "@/lib/logger";
import { payos } from "@/lib/payos";
import { ordersRepo } from "@/repositories/orders.repository";
import { eventsRepo } from "@/repositories/webhook-events.repository";
import { WebhookBody, isTestWebhook } from "./webhooks.schema";

export const webhooksService = {
  async processWebhook(rawText: string, callerIp: string | null): Promise<{ success: boolean }> {
    const receivedAt = nowIso();

    // ── Lớp 0: body phải là JSON đúng shape (lưu nguyên văn rawText ở mọi nhánh) ──
    let raw: unknown;
    try {
      raw = JSON.parse(rawText);
    } catch {
      logger.warn("webhook: body khong phai JSON");
      eventsRepo.insert({ receivedAt, signatureValid: false, result: "BAD_JSON", rawPayload: rawText, callerIp });
      return { success: false };
    }
    const shape = WebhookBody.safeParse(raw);
    if (!shape.success) {
      logger.warn("webhook: shape body khong dung dinh dang PayOS");
      eventsRepo.insert({ receivedAt, signatureValid: false, result: "BAD_JSON", rawPayload: rawText, callerIp });
      return { success: false };
    }

    // ── Lớp 1: verify chữ ký HMAC-SHA256 ──
    let data: WebhookData;
    try {
      data = await payos.webhooks.verify(shape.data as Parameters<typeof payos.webhooks.verify>[0]);
    } catch (err) {
      logger.error({ err }, "webhook: SAI CHU KY — tu choi xu ly");
      eventsRepo.insert({ receivedAt, signatureValid: false, result: "INVALID_SIGNATURE", rawPayload: rawText, callerIp });
      return { success: false };
    }

    // ── Request kiểm tra của PayOS (khi bấm Lưu Webhook Url) → chỉ cần 200 ──
    if (isTestWebhook(data)) {
      logger.info({ orderCode: data.orderCode }, "webhook: nhan request kiem tra cua PayOS");
      eventsRepo.insert({ receivedAt, orderCode: data.orderCode, signatureValid: true, result: "TEST_WEBHOOK", rawPayload: rawText, callerIp });
      return { success: true };
    }

    // ── Giao dịch không thành công phía PayOS → ghi nhận, không kích hoạt ──
    if (data.code !== "00") {
      logger.warn({ orderCode: data.orderCode, code: data.code, desc: data.desc }, "webhook: giao dich KHONG thanh cong");
      eventsRepo.insert({ receivedAt, orderCode: data.orderCode, code: data.code, desc: data.desc, signatureValid: true, result: "TX_FAILED", rawPayload: rawText, callerIp });
      return { success: true };
    }

    // ── Lớp 2 + 3: kích hoạt idempotent + đối chiếu nghiệp vụ ──
    const result = ordersRepo.activateIfPending(data.orderCode, {
      amount: data.amount,
      reference: data.reference,
      counterAccountName: data.counterAccountName,
    });
    eventsRepo.insert({
      receivedAt,
      orderCode: data.orderCode,
      code: data.code,
      desc: data.desc,
      signatureValid: true,
      result,
      amount: data.amount,
      reference: data.reference,
      rawPayload: rawText,
      callerIp,
    });

    const log = result === "ACTIVATED" || result === "ALREADY_PAID" ? "info" : "warn";
    logger[log](
      { orderCode: data.orderCode, amount: data.amount, reference: data.reference, result },
      "webhook processed",
    );
    return { success: true };
  },
};
