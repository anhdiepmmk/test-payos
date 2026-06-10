/**
 * GET /api/account — gói hiện tại + lịch sử đơn CỦA RIÊNG user đang gọi (cookie uid).
 * Controller: chỉ lo HTTP (danh tính + đáp), nghiệp vụ ở account.service.
 */
import { getUserId } from "@/lib/user";
import { accountService } from "./account.service";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return Response.json({ error: "Thiếu danh tính user (cookie uid)" }, { status: 401 });
  }
  return Response.json(accountService.getAccount(userId));
}
