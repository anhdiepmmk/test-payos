/**
 * Shape THÔ của body webhook PayOS + nhận diện request kiểm tra.
 * Đây chỉ là lớp gác cấu trúc; xác thực thật sự là chữ ký HMAC (payos.webhooks.verify).
 */
import type { WebhookData } from "@payos/node";
import { z } from "zod";

export const WebhookBody = z.object({
  code: z.string(),
  desc: z.string(),
  success: z.boolean().optional(),
  data: z.record(z.string(), z.unknown()),
  signature: z.string(),
});

/** Dấu hiệu request KIỂM TRA do PayOS gửi khi đăng ký/lưu Webhook Url. */
export function isTestWebhook(data: WebhookData): boolean {
  return (
    data.orderCode === 123 ||
    ["Ma giao dich thu nghiem", "VQRIO123"].includes(data.description)
  );
}
