/**
 * Zod schemas — validate MỌI input đi vào API routes.
 */
import { z } from "zod";
import { PLAN_IDS } from "./plans";

/** Body của POST /api/payments — client CHỈ được gửi planId, giá do server tra. */
export const CreatePaymentBody = z.object({
  planId: z.enum(PLAN_IDS),
});

/** Param [orderCode] trên URL — ép về số nguyên dương. */
export const OrderCodeParam = z.coerce.number().int().positive();

/**
 * Shape THÔ của body webhook PayOS. Đây chỉ là lớp gác cấu trúc;
 * lớp xác thực thật sự là chữ ký HMAC (payos.webhooks.verify).
 */
export const WebhookBody = z.object({
  code: z.string(),
  desc: z.string(),
  success: z.boolean().optional(),
  data: z.record(z.string(), z.unknown()),
  signature: z.string(),
});
