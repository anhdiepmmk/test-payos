/**
 * Axios client cho frontend — mọi component gọi API qua các hàm typed ở đây
 * (kết hợp với TanStack Query ở tầng component).
 * Chỉ import TYPE từ lib/db/schema (bị xóa khi compile) — không kéo code server vào bundle client.
 */
import axios from "axios";
import type { OrderRow, WebhookEventRow } from "./db/schema";
import type { PlanId } from "./plans";

export interface AccountResponse {
  currentPlan: PlanId | null;
  activatedAt: string | null;
  orders: OrderRow[];
}

export interface CreatePaymentResponse {
  orderCode: number;
  checkoutUrl: string;
  /** Đúng NGUYÊN chuỗi returnUrl đã gửi PayOS — phải đưa lại vào RETURN_URL của lib nhúng */
  returnUrl: string;
  expiredAt: number; // unix giây
}

export interface AdminOrdersResponse {
  orders: OrderRow[];
  totalRevenue: number;
  countByStatus: Record<string, number>;
}

const http = axios.create({ baseURL: "/api", timeout: 20_000 });

export const api = {
  getAccount: async (): Promise<AccountResponse> =>
    (await http.get<AccountResponse>("/account")).data,

  createPayment: async (planId: PlanId): Promise<CreatePaymentResponse> =>
    (await http.post<CreatePaymentResponse>("/payments", { planId })).data,

  getOrder: async (orderCode: number): Promise<OrderRow> =>
    (await http.get<OrderRow>(`/payments/${orderCode}`)).data,

  cancelOrder: async (orderCode: number): Promise<void> => {
    await http.delete(`/payments/${orderCode}`);
  },

  getAdminOrders: async (): Promise<AdminOrdersResponse> =>
    (await http.get<AdminOrdersResponse>("/admin/orders")).data,

  getWebhookEvents: async (): Promise<WebhookEventRow[]> =>
    (await http.get<WebhookEventRow[]>("/webhook-events")).data,
};

/** Rút message lỗi dễ đọc từ AxiosError (ưu tiên `error` do API của ta trả về). */
export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    return data?.error ?? err.message;
  }
  return err instanceof Error ? err.message : "Lỗi không xác định";
}
