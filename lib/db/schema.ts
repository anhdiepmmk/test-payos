/**
 * Drizzle schema — 3 bảng SQLite.
 * Quy ước thời gian: cột *At dạng text = ISO UTC; expiredAt = unix GIÂY (khớp PayOS).
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { PlanId } from "../plans";

export type OrderStatus = "PENDING" | "PAID" | "CANCELLED" | "EXPIRED";

/** Mỗi trình duyệt (cookie uid) là một user demo. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  currentPlan: text("current_plan").$type<PlanId>(),
  activatedAt: text("activated_at"),
});

/** Đơn mua gói — orderCode trùng với orderCode gửi sang PayOS. */
export const orders = sqliteTable("orders", {
  orderCode: integer("order_code").primaryKey(),
  userId: text("user_id").notNull(),
  planId: text("plan_id").$type<PlanId>().notNull(),
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
  checkoutUrl: text("checkout_url").notNull(), // lưu lại để "Tiếp tục thanh toán"
  expiredAt: integer("expired_at").notNull(), // unix giây
  status: text("status").$type<OrderStatus>().notNull(),
  createdAt: text("created_at").notNull(),
  paidAt: text("paid_at"),
  reference: text("reference"), // mã tham chiếu giao dịch ngân hàng (từ webhook)
  counterAccountName: text("counter_account_name"), // tên người chuyển khoản
  note: text("note"), // ghi chú bất thường: sai số tiền / trả tiền sau khi hủy...
});

/**
 * Lưu vết MỌI webhook delivery (kể cả sai chữ ký) — best practice để audit/đối soát/debug.
 */
export const webhookEvents = sqliteTable("webhook_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  receivedAt: text("received_at").notNull(),
  orderCode: integer("order_code"),
  code: text("code"),
  desc: text("desc"),
  signatureValid: integer("signature_valid", { mode: "boolean" }).notNull(),
  result: text("result").notNull(), // ACTIVATED | ALREADY_PAID | UNKNOWN_ORDER | AMOUNT_MISMATCH | PAID_AFTER_CANCEL | TEST_WEBHOOK | TX_FAILED | INVALID_SIGNATURE | BAD_JSON
  amount: integer("amount"),
  reference: text("reference"),
});

export type UserRow = typeof users.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type WebhookEventRow = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
