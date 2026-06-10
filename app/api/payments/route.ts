/**
 * POST /api/payments — tạo payment link PayOS cho một gói.
 *
 * Nguyên tắc bảo mật: client CHỈ gửi `planId`. Giá (amount) do server tra từ lib/plans.ts —
 * không bao giờ tin số tiền từ client. Đơn được lưu PENDING kèm userId để webhook
 * biết kích hoạt gói cho ai.
 */
import { expiryUnix, nowIso } from "@/lib/datetime";
import { addOrder } from "@/lib/db/queries";
import { logger } from "@/lib/logger";
import { payos } from "@/lib/payos";
import { getPlan } from "@/lib/plans";
import { CreatePaymentBody } from "@/lib/schemas";
import { getUserId } from "@/lib/user";

/** orderCode duy nhất toàn cục: timestamp ms (13 số) + 3 số ngẫu nhiên — vẫn < MAX_SAFE_INTEGER. */
function generateOrderCode(): number {
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return Number(`${Date.now()}${random}`);
}

/**
 * Trang embedded của PayOS so khớp `redirect_uri` (lib gửi lên) với `returnUrl`
 * của payment link theo kiểu SO SÁNH CHUỖI CHÍNH XÁC — kể cả dấu "/" cuối; lệch là
 * iframe báo "Thông tin truyền lên không hợp lệ" thay vì hiện QR (đã kiểm chứng
 * thực nghiệm, xem README mục Troubleshooting). Vì vậy:
 *  1. Origin lấy từ header Origin của CHÍNH request trình duyệt (chạy port/tunnel
 *     nào cũng tự khớp); env chỉ là fallback cho caller không phải trình duyệt.
 *  2. returnUrl được trả về cho client + lưu vào đơn — client đưa NGUYÊN chuỗi này
 *     vào RETURN_URL của lib, không tự dựng lại.
 */
function requestOrigin(req: Request): string {
  return (
    req.headers.get("origin") ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    new URL(req.url).origin
  );
}

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
  // CreatePaymentBody đã đảm bảo planId nằm trong PLAN_IDS nên getPlan luôn tìm thấy
  const plan = getPlan(parsed.data.planId)!;

  const orderCode = generateOrderCode();
  const expiredAt = expiryUnix(15); // PayOS yêu cầu unix GIÂY (Int32) — QR sống 15 phút
  const returnUrl = `${requestOrigin(req)}/`;

  try {
    const link = await payos.paymentRequests.create({
      orderCode,
      amount: plan.price,
      description: plan.description, // memo chuyển khoản — PayOS giới hạn 9 ký tự
      returnUrl, // bắt buộc kể cả khi nhúng embedded; client sẽ dùng LẠI nguyên chuỗi này
      cancelUrl: returnUrl,
      expiredAt,
    });

    addOrder({
      orderCode,
      userId,
      planId: plan.id,
      amount: plan.price,
      description: plan.description,
      checkoutUrl: link.checkoutUrl,
      returnUrl,
      expiredAt,
      status: "PENDING",
      createdAt: nowIso(),
    });

    logger.info(
      { orderCode, planId: plan.id, amount: plan.price, userId },
      "payment link created",
    );
    return Response.json({
      orderCode,
      checkoutUrl: link.checkoutUrl,
      returnUrl,
      expiredAt,
    });
  } catch (err) {
    logger.error({ err, orderCode, planId: plan.id }, "create payment link failed");
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    return Response.json(
      { error: `Không tạo được link thanh toán: ${message}` },
      { status: 502 },
    );
  }
}
