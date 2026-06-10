/**
 * GET /api/account — gói hiện tại + lịch sử đơn CỦA RIÊNG user đang gọi (cookie uid).
 */
import { getAccount } from "@/lib/db/queries";
import { getUserId } from "@/lib/user";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return Response.json({ error: "Thiếu danh tính user (cookie uid)" }, { status: 401 });
  }
  return Response.json(getAccount(userId));
}
