/**
 * SHIM CHUYỂN TIẾP (tạm thời) — các route chưa cắt sang controller/service vẫn import
 * từ đây. Toàn bộ truy cập dữ liệu đã dời sang `src/repositories/*`; quy tắc đọc
 * (lazy-expiry, sở hữu) sang `src/domain`. File này sẽ bị XÓA khi mọi route đã chuyển.
 */
import type { NewOrder, NewWebhookEvent, OrderRow, WebhookEventRow } from "./schema";
import { ordersRepo, type ActivateResult } from "@/repositories/orders.repository";
import { usersRepo } from "@/repositories/users.repository";
import { eventsRepo } from "@/repositories/webhook-events.repository";
import { applyLazyExpiry } from "@/domain/orders.domain";

export type { ActivateResult };

export function getAccount(userId: string) {
  let user = usersRepo.findById(userId);
  if (!user) {
    usersRepo.insertIfAbsent(userId);
    user = { id: userId, currentPlan: null, activatedAt: null };
  }
  return {
    currentPlan: user.currentPlan,
    activatedAt: user.activatedAt,
    orders: ordersRepo.listByUser(userId, 20).map(applyLazyExpiry),
  };
}

export function getOrder(orderCode: number): OrderRow | null {
  const order = ordersRepo.findByCode(orderCode);
  return order ? applyLazyExpiry(order) : null;
}

export function addOrder(order: NewOrder): void {
  ordersRepo.insert(order);
}

export function markCancelled(orderCode: number): boolean {
  return ordersRepo.markCancelled(orderCode);
}

export function getAllOrders() {
  return {
    orders: ordersRepo.listAll(100).map(applyLazyExpiry),
    totalRevenue: ordersRepo.sumPaidRevenue(),
    countByStatus: ordersRepo.countByStatus(),
  };
}

export function activateIfPending(
  orderCode: number,
  info: { amount: number; reference?: string; counterAccountName?: string | null },
): ActivateResult {
  return ordersRepo.activateIfPending(orderCode, info);
}

export function addWebhookEvent(event: NewWebhookEvent): void {
  eventsRepo.insert(event);
}

export function getWebhookEvents(limit = 50): WebhookEventRow[] {
  return eventsRepo.listRecent(limit);
}
