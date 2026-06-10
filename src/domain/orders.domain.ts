/**
 * Quy tắc nghiệp vụ cấp ENTITY cho đơn hàng — dùng CHUNG bởi nhiều feature
 * (payments/account/admin) nên đặt ở tầng domain trung lập, không thuộc feature nào.
 * Phụ thuộc đi xuống repository; không feature nào import lẫn nhau qua đây.
 */
import type { OrderRow } from "@/lib/db/schema";
import { nowUnix } from "@/lib/datetime";
import { ordersRepo } from "@/repositories/orders.repository";

/**
 * Đơn PENDING đã quá hạn → EXPIRED (lazy — không cần cron). Đọc đến đâu áp đến đó.
 * Điều kiện status=PENDING nằm trong câu UPDATE (repo) tránh ghi đè nếu webhook vừa
 * kích hoạt xong cùng thời điểm.
 */
export function applyLazyExpiry(order: OrderRow): OrderRow {
  if (order.status === "PENDING" && nowUnix() > order.expiredAt) {
    ordersRepo.expireIfPending(order.orderCode);
    return { ...order, status: "EXPIRED" };
  }
  return order;
}

/**
 * Tra đơn theo orderCode + áp lazy-expiry + KIỂM TRA SỞ HỮU.
 * Trả null cho mọi trường hợp không hợp lệ (không có user / không có đơn / đơn của
 * người khác) → caller đáp 404 đồng nhất, đoán được orderCode cũng không lộ gì.
 */
export function getOwnedOrder(orderCode: number, userId: string | null): OrderRow | null {
  if (!userId) return null;
  const order = ordersRepo.findByCode(orderCode);
  if (!order) return null;
  const fresh = applyLazyExpiry(order);
  return fresh.userId === userId ? fresh : null;
}
