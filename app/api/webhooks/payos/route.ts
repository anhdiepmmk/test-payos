/**
 * POST /api/webhooks/payos — TRÁI TIM CỦA DEMO.
 *
 * PayOS gọi endpoint này (HTTP POST, JSON) mỗi khi có giao dịch cho kênh thanh toán.
 * Đây là NƠI DUY NHẤT được phép kích hoạt gói cho user. Frontend (onSuccess của
 * thư viện nhúng) chỉ là tín hiệu UI — không bao giờ được tin để cộng quyền lợi.
 *
 * Bảo vệ 3 lớp (URL bị lộ cũng không sao — bí mật là CHECKSUM KEY, không phải URL):
 *   1. Chữ ký HMAC-SHA256: payos.webhooks.verify() throw nếu payload không được ký
 *      bằng checksum key của kênh → kẻ giả mạo/sửa đổi payload đều bị chặn.
 *   2. Idempotent: activateIfPending chỉ chuyển PENDING→PAID đúng 1 lần —
 *      webhook retry/gửi trùng/replay đều vô hại.
 *   3. Đối chiếu nghiệp vụ: sai số tiền / đơn đã hủy / đơn không tồn tại → không kích hoạt.
 *
 * Best practice logging: MỌI delivery (kể cả sai chữ ký) đều được pino log
 * + ghi vào bảng webhook_events để audit/đối soát/debug (xem trang /admin).
 *
 * Luôn trả HTTP 200: PayOS chỉ cần biết "đã nhận được"; từ chối xử lý đã đủ an toàn
 * ở tầng nghiệp vụ, và việc lưu Webhook Url trên dashboard cần response 2XX mới thành công.
 */
import type { WebhookData } from "@payos/node";
import { nowIso } from "@/lib/datetime";
import { activateIfPending, addWebhookEvent } from "@/lib/db/queries";
import { logger } from "@/lib/logger";
import { payos } from "@/lib/payos";
import { WebhookBody } from "@/lib/schemas";

/** Dấu hiệu request KIỂM TRA do PayOS gửi khi đăng ký/lưu Webhook Url. */
function isTestWebhook(data: WebhookData): boolean {
  return (
    data.orderCode === 123 ||
    ["Ma giao dich thu nghiem", "VQRIO123"].includes(data.description)
  );
}

export async function POST(req: Request) {
  const receivedAt = nowIso();

  // ── Lớp 0: body phải là JSON đúng shape ──────────────────────────────────
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    logger.warn("webhook: body khong phai JSON");
    addWebhookEvent({ receivedAt, signatureValid: false, result: "BAD_JSON" });
    return Response.json({ success: false }, { status: 200 });
  }
  const shape = WebhookBody.safeParse(raw);
  if (!shape.success) {
    logger.warn("webhook: shape body khong dung dinh dang PayOS");
    addWebhookEvent({ receivedAt, signatureValid: false, result: "BAD_JSON" });
    return Response.json({ success: false }, { status: 200 });
  }

  // ── Lớp 1: verify chữ ký HMAC-SHA256 ─────────────────────────────────────
  // Chữ ký tính trên OBJECT `data` (key sort alphabet) chứ không phải raw body,
  // nên req.json() là đủ — không cần giữ raw body như Stripe.
  let data: WebhookData;
  try {
    data = await payos.webhooks.verify(
      shape.data as Parameters<typeof payos.webhooks.verify>[0],
    );
  } catch (err) {
    // Kẻ biết URL nhưng không có checksum key sẽ rơi vào đây.
    logger.error({ err }, "webhook: SAI CHU KY — tu choi xu ly");
    addWebhookEvent({ receivedAt, signatureValid: false, result: "INVALID_SIGNATURE" });
    return Response.json({ success: false }, { status: 200 });
  }

  // ── Request kiểm tra của PayOS (khi bấm Lưu Webhook Url) → chỉ cần 200 ───
  if (isTestWebhook(data)) {
    logger.info({ orderCode: data.orderCode }, "webhook: nhan request kiem tra cua PayOS");
    addWebhookEvent({
      receivedAt,
      orderCode: data.orderCode,
      signatureValid: true,
      result: "TEST_WEBHOOK",
    });
    return Response.json({ success: true });
  }

  // ── Giao dịch không thành công phía PayOS → ghi nhận, không kích hoạt ────
  if (data.code !== "00") {
    logger.warn(
      { orderCode: data.orderCode, code: data.code, desc: data.desc },
      "webhook: giao dich KHONG thanh cong",
    );
    addWebhookEvent({
      receivedAt,
      orderCode: data.orderCode,
      code: data.code,
      desc: data.desc,
      signatureValid: true,
      result: "TX_FAILED",
    });
    return Response.json({ success: true });
  }

  // ── Lớp 2 + 3: kích hoạt idempotent + đối chiếu nghiệp vụ ────────────────
  const result = activateIfPending(data.orderCode, {
    amount: data.amount,
    reference: data.reference,
    counterAccountName: data.counterAccountName,
  });
  addWebhookEvent({
    receivedAt,
    orderCode: data.orderCode,
    code: data.code,
    desc: data.desc,
    signatureValid: true,
    result,
    amount: data.amount,
    reference: data.reference,
  });

  const log = result === "ACTIVATED" || result === "ALREADY_PAID" ? "info" : "warn";
  logger[log](
    { orderCode: data.orderCode, amount: data.amount, reference: data.reference, result },
    "webhook processed",
  );
  return Response.json({ success: true });
}

/** GET chỉ để tự kiểm tra tunnel bằng trình duyệt (PayOS không bao giờ gọi GET). */
export async function GET() {
  return Response.json({ ok: true, endpoint: "PayOS webhook", expects: "POST" });
}
