/**
 * Zod schemas cho feature payments — validate input đi vào controller.
 */
import { z } from "zod";
import { PLAN_IDS } from "@/lib/plans";

/** Body của POST /api/payments — client CHỈ được gửi planId, giá do server tra. */
export const CreatePaymentBody = z.object({
  planId: z.enum(PLAN_IDS),
});

/** Param [orderCode] trên URL — ép về số nguyên dương. */
export const OrderCodeParam = z.coerce.number().int().positive();
