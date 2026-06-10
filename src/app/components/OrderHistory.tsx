"use client";

/**
 * Lịch sử đơn mua gói CỦA user hiện tại.
 * - Đơn PENDING còn hạn: nút "Tiếp tục thanh toán" (mở lại modal với checkoutUrl đã lưu) + "Hủy".
 * - Đơn có `note` (sai số tiền / trả tiền sau khi hủy): hiện cảnh báo vàng.
 */
import { nowUnix, formatDateTime } from "@/lib/datetime";
import type { OrderRow } from "@/lib/db/schema";
import { formatVnd, getPlan } from "@/lib/plans";
import StatusBadge from "./StatusBadge";

interface Props {
  orders: OrderRow[];
  loading: boolean;
  onResume: (order: OrderRow) => void;
  onCancel: (orderCode: number) => void;
}

export default function OrderHistory({ orders, loading, onResume, onCancel }: Props) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold">Lịch sử giao dịch của bạn</h2>

      {loading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-zinc-200" />
      ) : orders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-500">
          Chưa có giao dịch nào. Mua gói đầu tiên để xem luồng thanh toán hoạt động.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Thời gian tạo (VN)</th>
                <th className="px-4 py-3">Mã đơn</th>
                <th className="px-4 py-3">Gói</th>
                <th className="px-4 py-3">Số tiền</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Mã tham chiếu NH</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {orders.map((order) => {
                const stillPayable =
                  order.status === "PENDING" && order.expiredAt > nowUnix();
                return (
                  <tr key={order.orderCode} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDateTime(order.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{order.orderCode}</td>
                    <td className="px-4 py-3 font-medium">
                      {getPlan(order.planId)?.name ?? order.planId}
                    </td>
                    <td className="px-4 py-3">{formatVnd(order.amount)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                      {order.note && (
                        <p className="mt-1 max-w-60 text-xs text-amber-600">
                          ⚠️ {order.note}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {order.reference ?? "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {stillPayable && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => onResume(order)}
                            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                          >
                            Tiếp tục thanh toán
                          </button>
                          <button
                            onClick={() => onCancel(order.orderCode)}
                            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
                          >
                            Hủy
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
