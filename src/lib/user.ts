/**
 * Danh tính user ẩn danh cho demo multi-user (không cần đăng nhập).
 * Cookie `uid` được proxy.ts phát cho mọi visitor; mỗi trình duyệt = một "user".
 * Đây là chìa khóa chống lẫn giao dịch: đơn hàng lưu userId lúc tạo,
 * webhook tra orderCode → đơn → kích hoạt gói cho đúng userId đó.
 */
import { cookies } from "next/headers";

export const USER_COOKIE = "uid";

export async function getUserId(): Promise<string | null> {
  const store = await cookies();
  return store.get(USER_COOKIE)?.value ?? null;
}
