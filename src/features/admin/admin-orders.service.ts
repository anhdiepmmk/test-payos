/**
 * Nghiệp vụ trang Admin: MỌI đơn của MỌI user + thống kê.
 */
import { applyLazyExpiry } from "@/domain/orders.domain";
import { ordersRepo } from "@/repositories/orders.repository";

export const adminOrdersService = {
  getAllWithStats() {
    // Dọn HÀNG LOẠT đơn PENDING quá hạn (kể cả đơn rác không ai poll) trước khi liệt kê —
    // lazy, không cần cron. applyLazyExpiry bên dưới giờ gần như thừa nhưng giữ cho an toàn race.
    ordersRepo.expireAllStale();
    return {
      orders: ordersRepo.listAll(100).map(applyLazyExpiry),
      totalRevenue: ordersRepo.sumPaidRevenue(),
      countByStatus: ordersRepo.countByStatus(),
    };
  },
};
