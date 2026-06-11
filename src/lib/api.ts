/**
 * Axios client cho frontend — mọi component gọi API qua các hàm typed ở đây
 * (kết hợp với TanStack Query ở tầng component).
 * Chỉ import TYPE từ lib/db/schema (bị xóa khi compile) — không kéo code server vào bundle client.
 */
import axios from "axios";
import type { OrderRow, WebhookEventRow } from "./db/schema";
import type { IpLookupResult } from "./ip-types";
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

  /** Tra cứu địa lý 1 IP (on-demand khi admin bấm icon vị trí). */
  getIpLookup: async (ip: string): Promise<IpLookupResult> =>
    (await http.get<IpLookupResult>("/admin/ip-lookup", { params: { ip } })).data,
};

/** Rút message lỗi dễ đọc từ AxiosError (ưu tiên `error` do API của ta trả về). */
export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    return data?.error ?? err.message;
  }
  return err instanceof Error ? err.message : "Lỗi không xác định";
}

/**
 * Số giây cần chờ trước khi thử lại, đọc từ header `Retry-After` của response 429
 * (cả rate-limit của ta lẫn 429 từ PayOS đều gửi header này). Trả null nếu không phải 429
 * hoặc không có header hợp lệ → caller cứ xử như lỗi thường.
 */
export function extractRetryAfterSec(err: unknown): number | null {
  if (!axios.isAxiosError(err) || err.response?.status !== 429) return null;
  const raw = err.response.headers?.["retry-after"];
  const sec = Number(raw);
  return Number.isFinite(sec) && sec > 0 ? Math.ceil(sec) : null;
}
