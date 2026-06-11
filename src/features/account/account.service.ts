/**
 * Nghiệp vụ tài khoản: gói hiện tại + lịch sử đơn CỦA RIÊNG một user (multi-user).
 */
import { applyLazyExpiry } from "@/domain/orders.domain";
import { ordersRepo } from "@/repositories/orders.repository";
import { usersRepo } from "@/repositories/users.repository";

export const accountService = {
  getAccount(userId: string) {
    // Dọn hàng loạt đơn PENDING quá hạn trước khi liệt kê (lazy-sweep, không cần cron).
    ordersRepo.expireAllStale();
    // Auto-tạo user lần đầu ghé (quyết định nghiệp vụ — repo chỉ ghi thuần).
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
  },
};
