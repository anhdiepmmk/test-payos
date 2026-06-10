/**
 * Helper thuần cho feature payments.
 */

/** orderCode duy nhất toàn cục: timestamp ms (13 số) + 3 số ngẫu nhiên — vẫn < MAX_SAFE_INTEGER. */
export function generateOrderCode(): number {
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
export function requestOrigin(req: Request): string {
  return (
    req.headers.get("origin") ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    new URL(req.url).origin
  );
}
