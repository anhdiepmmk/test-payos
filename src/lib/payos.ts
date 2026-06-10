/**
 * PayOS client singleton (server-only — file này không bao giờ được import vào client component).
 * 3 khóa đọc từ .env.local (xem .env.example). Khóa KHÔNG có prefix NEXT_PUBLIC_
 * nên không bao giờ bị đóng gói ra bundle phía trình duyệt.
 */
import { PayOS } from "@payos/node";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Thiếu biến môi trường ${name} — xem hướng dẫn trong .env.example`);
  }
  return value;
};

const g = globalThis as unknown as { __payos?: PayOS };

export const payos: PayOS = (g.__payos ??= new PayOS({
  clientId: required("PAYOS_CLIENT_ID"),
  apiKey: required("PAYOS_API_KEY"),
  checksumKey: required("PAYOS_CHECKSUM_KEY"),
}));
