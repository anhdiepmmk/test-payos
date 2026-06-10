/**
 * GET /api/admin/orders — MỌI đơn của MỌI user + thống kê (trang Admin).
 *
 * ⚠️ Demo nên KHÔNG có auth — ai cũng xem được. Trong production bắt buộc
 * phải bảo vệ endpoint này (đăng nhập admin / IP nội bộ / basic auth...).
 */
import { getAllOrders } from "@/lib/db/queries";

export async function GET() {
  return Response.json(getAllOrders());
}
