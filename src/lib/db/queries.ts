/**
 * Toàn bộ truy vấn nghiệp vụ. Điểm quan trọng nhất: `activateIfPending` —
 * NƠI DUY NHẤT trong toàn bộ codebase được phép kích hoạt gói cho user.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from ".";
import {
  orders,
  users,
  webhookEvents,
  type NewOrder,
  type NewWebhookEvent,
  type OrderRow,
  type WebhookEventRow,
} from "./schema";
import type { PlanId } from "../plans";
import { nowIso, nowUnix } from "../datetime";

/**
 * Đơn PENDING đã quá hạn thì chuyển EXPIRED (lazy — không cần cron).
 * Điều kiện status = PENDING trong câu UPDATE giúp không ghi đè trạng thái
 * nếu webhook vừa kích hoạt xong trong cùng thời điểm.
 */
function expirePendingIfNeeded(order: OrderRow): OrderRow {
  if (order.status === "PENDING" && nowUnix() > order.expiredAt) {
    db.update(orders)
      .set({ status: "EXPIRED" })
      .where(and(eq(orders.orderCode, order.orderCode), eq(orders.status, "PENDING")))
      .run();
    return { ...order, status: "EXPIRED" };
  }
  return order;
}

/** Tài khoản + lịch sử đơn CỦA RIÊNG một user (multi-user: không bao giờ trả dữ liệu user khác). */
export function getAccount(userId: string) {
  let user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    db.insert(users).values({ id: userId }).onConflictDoNothing().run();
    user = { id: userId, currentPlan: null, activatedAt: null };
  }
  const userOrders = db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.orderCode))
    .limit(20)
    .all()
    .map(expirePendingIfNeeded);
  return {
    currentPlan: user.currentPlan,
    activatedAt: user.activatedAt,
    orders: userOrders,
  };
}

export function getOrder(orderCode: number): OrderRow | null {
  const order = db.select().from(orders).where(eq(orders.orderCode, orderCode)).get();
  return order ? expirePendingIfNeeded(order) : null;
}

export function addOrder(order: NewOrder): void {
  db.insert(orders).values(order).run();
}

/** Hủy đơn — chỉ khi đơn còn PENDING/EXPIRED (đơn đã PAID không thể hủy). */
export function markCancelled(orderCode: number): boolean {
  const result = db
    .update(orders)
    .set({ status: "CANCELLED" })
    .where(
      and(
        eq(orders.orderCode, orderCode),
        inArray(orders.status, ["PENDING", "EXPIRED"]),
      ),
    )
    .run();
  return result.changes > 0;
}

/** Dữ liệu cho trang Admin: mọi đơn của mọi user + thống kê. */
export function getAllOrders() {
  const allOrders = db
    .select()
    .from(orders)
    .orderBy(desc(orders.orderCode))
    .limit(100)
    .all()
    .map(expirePendingIfNeeded);
  const revenue = db
    .select({ total: sql<number>`COALESCE(SUM(${orders.amount}), 0)` })
    .from(orders)
    .where(eq(orders.status, "PAID"))
    .get();
  const countByStatus: Record<string, number> = {};
  for (const row of db
    .select({ status: orders.status, count: sql<number>`COUNT(*)` })
    .from(orders)
    .groupBy(orders.status)
    .all()) {
    countByStatus[row.status] = row.count;
  }
  return {
    orders: allOrders,
    totalRevenue: revenue?.total ?? 0,
    countByStatus,
  };
}

export type ActivateResult =
  | "ACTIVATED" // kích hoạt thành công (lần đầu tiên và duy nhất)
  | "ALREADY_PAID" // webhook retry/gửi trùng/replay → no-op (idempotent)
  | "UNKNOWN_ORDER" // không có đơn này (DB bị xóa/reset, hoặc webhook của môi trường khác)
  | "AMOUNT_MISMATCH" // tiền nhận được ≠ giá gói → không kích hoạt, cần đối soát
  | "PAID_AFTER_CANCEL"; // tiền về sau khi đơn đã hủy → không kích hoạt, cần hoàn tiền

/**
 * NƠI DUY NHẤT kích hoạt gói. Chạy trong transaction để idempotency là nguyên tử:
 * webhook gửi trùng / race "hủy đơn ↔ webhook về cùng lúc" đều an toàn.
 * Chỉ được gọi SAU KHI chữ ký webhook đã verify thành công.
 */
export function activateIfPending(
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
}

export function addWebhookEvent(event: NewWebhookEvent): void {
  db.insert(webhookEvents).values(event).run();
}

export function getWebhookEvents(limit = 50): WebhookEventRow[] {
  return db
    .select()
    .from(webhookEvents)
    .orderBy(desc(webhookEvents.id))
    .limit(limit)
    .all();
}
