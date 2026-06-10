/**
 * Repository bảng `users` — truy cập dữ liệu thuần.
 * (Việc kích hoạt gói khi thanh toán nằm trong `ordersRepo.activateIfPending` vì cần
 * cùng transaction với đơn — xem ghi chú ngoại lệ ở orders.repository.ts.)
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, type UserRow } from "@/lib/db/schema";

export const usersRepo = {
  findById(userId: string): UserRow | undefined {
    return db.select().from(users).where(eq(users.id, userId)).get();
  },

  /** Tạo user nếu chưa có (idempotent) — dùng cho auto-create lúc xem tài khoản. */
  insertIfAbsent(userId: string): void {
    db.insert(users).values({ id: userId }).onConflictDoNothing().run();
  },
};
