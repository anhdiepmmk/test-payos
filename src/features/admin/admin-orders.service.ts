/**
 * Nghiệp vụ trang Admin: MỌI đơn của MỌI user + thống kê.
 */
import { applyLazyExpiry } from "@/domain/orders.domain";
import { ordersRepo } from "@/repositories/orders.repository";

export const adminOrdersService = {
  getAllWithStats() {
    return {
      orders: ordersRepo.listAll(100).map(applyLazyExpiry),
      totalRevenue: ordersRepo.sumPaidRevenue(),
      countByStatus: ordersRepo.countByStatus(),
    };
  },
};
