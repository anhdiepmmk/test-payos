"use client";

/**
 * (Admin) Bảng MỌI đơn hàng của MỌI user — trả lời câu hỏi "ai mua gói nào lúc mấy giờ".
 * Tự refetch mỗi 5s để theo dõi realtime khi demo.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { formatVnd, getPlan } from "@/lib/plans";
import IpCell from "./IpCell";
import StatusBadge from "./StatusBadge";

export default function AdminOrdersTable() {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: api.getAdminOrders,
    refetchInterval: 5_000,
  });

  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-lg font-semibold">📦 Đơn hàng (mọi user)</h2>
        <p className="text-xs text-zinc-400">
          Tự cập nhật 5s/lần — lần cuối: {formatDateTime(new Date(dataUpdatedAt).toISOString())}
        </p>
      </div>

      {/* Thống kê nhanh */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-700">Tổng doanh thu (PAID)</p>
          <p className="text-lg font-bold text-emerald-700">
            {formatVnd(data?.totalRevenue ?? 0)}
          </p>
        </div>
        {(["PAID", "PENDING", "CANCELLED", "EXPIRED"] as const).map((status) => (
          <div key={status} className="rounded-xl border border-zinc-200 bg-white p-3">
            <p className="text-xs text-zinc-500">{status}</p>
            <p className="text-lg font-bold">{data?.countByStatus?.[status] ?? 0}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-zinc-200" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Tạo lúc (VN)</th>
                <th className="px-4 py-3">Thanh toán lúc (VN)</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">IP tạo đơn</th>
                <th className="px-4 py-3">Gói</th>
                <th className="px-4 py-3">Số tiền</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Người chuyển</th>
                <th className="px-4 py-3">Ref NH</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(data?.orders ?? []).map((order) => (
                <tr key={order.orderCode} className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDateTime(order.createdAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDateTime(order.paidAt)}
                  </td>
                  <td
                    className="px-4 py-3 font-mono text-xs"
                    title={order.userId}
                  >
                    {order.userId.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3">
                    <IpCell ip={order.creatorIp} />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {getPlan(order.planId)?.name ?? order.planId}
                  </td>
                  <td className="px-4 py-3">{formatVnd(order.amount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                    {order.note && (
                      <p className="mt-1 max-w-60 text-xs text-amber-600">⚠️ {order.note}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{order.counterAccountName ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{order.reference ?? "—"}</td>
                </tr>
              ))}
              {(data?.orders ?? []).length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-zinc-400">
                    Chưa có đơn nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
