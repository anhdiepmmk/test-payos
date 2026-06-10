/**
 * Repository bảng `orders` — TẦNG DUY NHẤT chạm Drizzle/`db` cho đơn hàng.
 * Chỉ chứa truy cập dữ liệu thuần; nghiệp vụ (lazy-expiry, sở hữu, lắp ráp số liệu)
 * nằm ở domain/service.
 *
 * NGOẠI LỆ có chủ đích: `activateIfPending` chạy trong MỘT transaction nguyên tử và
 * cũng upsert bảng `users` trong cùng transaction đó — đây là thao tác toàn-vẹn-dữ-liệu
 * (idempotency chống webhook gửi trùng + race "hủy ↔ webhook về"), nên giữ nguyên ở
 * tầng repository thay vì xé nhỏ ra service.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, users, type NewOrder, type OrderRow } from "@/lib/db/schema";
import type { PlanId } from "@/lib/plans";
import { nowIso } from "@/lib/datetime";

export type ActivateResult =
  | "ACTIVATED" // kích hoạt thành công (lần đầu tiên và duy nhất)
  | "ALREADY_PAID" // webhook retry/gửi trùng/replay → no-op (idempotent)
  | "UNKNOWN_ORDER" // không có đơn này (DB bị xóa/reset, hoặc webhook của môi trường khác)
  | "AMOUNT_MISMATCH" // tiền nhận được ≠ giá gói → không kích hoạt, cần đối soát
  | "PAID_AFTER_CANCEL"; // tiền về sau khi đơn đã hủy → không kích hoạt, cần hoàn tiền

export const ordersRepo = {
  insert(order: NewOrder): void {
    db.insert(orders).values(order).run();
  },

  /** Đọc THÔ theo orderCode (không áp lazy-expiry — đó là việc của domain). */
  findByCode(orderCode: number): OrderRow | undefined {
    return db.select().from(orders).where(eq(orders.orderCode, orderCode)).get();
  },

  /**
   * UPDATE PENDING→EXPIRED, chốt điều kiện status=PENDING ngay trong câu lệnh để
   * không ghi đè nếu webhook vừa kích hoạt cùng lúc. Trả về true nếu có dòng đổi.
   */
  expireIfPending(orderCode: number): boolean {
    const result = db
      .update(orders)
      .set({ status: "EXPIRED" })
      .where(and(eq(orders.orderCode, orderCode), eq(orders.status, "PENDING")))
      .run();
    return result.changes > 0;
  },

  /** Hủy đơn — chỉ khi còn PENDING/EXPIRED (đơn đã PAID không hủy được). */
  markCancelled(orderCode: number): boolean {
    const result = db
      .update(orders)
      .set({ status: "CANCELLED" })
      .where(and(eq(orders.orderCode, orderCode), inArray(orders.status, ["PENDING", "EXPIRED"])))
      .run();
    return result.changes > 0;
  },

  listByUser(userId: string, limit: number): OrderRow[] {
    return db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.orderCode))
      .limit(limit)
      .all();
  },

  listAll(limit: number): OrderRow[] {
    return db.select().from(orders).orderBy(desc(orders.orderCode)).limit(limit).all();
  },

  sumPaidRevenue(): number {
    const row = db
      .select({ total: sql<number>`COALESCE(SUM(${orders.amount}), 0)` })
      .from(orders)
      .where(eq(orders.status, "PAID"))
      .get();
    return row?.total ?? 0;
  },

  countByStatus(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const row of db
      .select({ status: orders.status, count: sql<number>`COUNT(*)` })
      .from(orders)
      .groupBy(orders.status)
      .all()) {
      out[row.status] = row.count;
    }
    return out;
  },

  /**
   * NƠI DUY NHẤT kích hoạt gói. Chạy trong transaction để idempotency là nguyên tử:
   * webhook gửi trùng / race "hủy đơn ↔ webhook về cùng lúc" đều an toàn.
   * Chỉ được gọi SAU KHI chữ ký webhook đã verify thành công.
   */
  activateIfPending(
    orderCode: number,
    info: { amount: number; reference?: string; counterAccountName?: string | null },
  ): ActivateResult {
    return db.transaction((tx) => {
      const order = tx.select().from(orders).where(eq(orders.orderCode, orderCode)).get();
      if (!order) return "UNKNOWN_ORDER";
      if (order.status === "PAID") return "ALREADY_PAID";
      if (order.status === "CANCELLED") {
        tx.update(orders)
          .set({
            note: `Nhận ${info.amount}đ SAU KHI đơn đã hủy (ref ${info.reference ?? "?"}) — cần đối soát/hoàn tiền thủ công`,
            reference: info.reference ?? null,
          })
          .where(eq(orders.orderCode, orderCode))
          .run();
        return "PAID_AFTER_CANCEL";
      }
      if (info.amount !== order.amount) {
        tx.update(orders)
          .set({
            note: `Nhận ${info.amount}đ ≠ giá gói ${order.amount}đ — KHÔNG kích hoạt, cần đối soát`,
            reference: info.reference ?? null,
          })
          .where(eq(orders.orderCode, orderCode))
          .run();
        return "AMOUNT_MISMATCH";
      }

      // Đơn PENDING (hoặc EXPIRED nhưng tiền vẫn về sát giây hết hạn):
      // webhook đã qua verify chữ ký + đúng số tiền → kích hoạt.
      const paidAt = nowIso();
      tx.update(orders)
        .set({
          status: "PAID",
          paidAt,
          reference: info.reference ?? null,
          counterAccountName: info.counterAccountName ?? null,
        })
        .where(eq(orders.orderCode, orderCode))
        .run();
      // Kích hoạt cho ĐÚNG user sở hữu đơn (multi-user an toàn),
      // theo planId ĐÃ LƯU lúc tạo đơn (server-trusted).
      tx.insert(users)
        .values({ id: order.userId, currentPlan: order.planId as PlanId, activatedAt: paidAt })
        .onConflictDoUpdate({
          target: users.id,
          set: { currentPlan: order.planId as PlanId, activatedAt: paidAt },
        })
        .run();
      return "ACTIVATED";
    });
  },
};
