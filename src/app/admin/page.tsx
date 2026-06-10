import type { Metadata } from "next";
import Link from "next/link";
import AdminOrdersTable from "../components/AdminOrdersTable";
import AdminWebhookLog from "../components/AdminWebhookLog";

export const metadata: Metadata = {
  title: "Admin — Theo dõi đơn hàng & webhook | Demo PayOS",
};

/**
 * Trang Admin (demo — KHÔNG có auth, production phải bảo vệ):
 * - Ai mua gói nào, lúc mấy giờ (giờ Việt Nam), trạng thái, mã tham chiếu ngân hàng.
 * - Log webhook realtime: từng delivery PayOS gửi đến và kết quả xử lý.
 */
export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🛠️ Admin — Theo dõi</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Trang dành cho admin demo (không auth). Mọi đơn hàng của mọi user + log webhook.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"
        >
          ← Về trang mua gói
        </Link>
      </div>

      <div className="space-y-10">
        <AdminOrdersTable />
        <AdminWebhookLog />
      </div>
    </main>
  );
}
