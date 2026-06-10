"use client";

/**
 * (Admin) Log webhook realtime — mỗi dòng là MỘT delivery PayOS gửi đến
 * (kể cả request test, sai chữ ký, gửi trùng...) kèm kết quả xử lý.
 * Đây là nơi trực quan nhất để hiểu webhook hoạt động thế nào khi demo.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { formatVnd } from "@/lib/plans";

const RESULT_STYLE: Record<string, string> = {
  ACTIVATED: "bg-emerald-100 text-emerald-700",
  ALREADY_PAID: "bg-sky-100 text-sky-700",
  TEST_WEBHOOK: "bg-violet-100 text-violet-700",
  TX_FAILED: "bg-amber-100 text-amber-700",
  UNKNOWN_ORDER: "bg-amber-100 text-amber-700",
  AMOUNT_MISMATCH: "bg-red-100 text-red-600",
  PAID_AFTER_CANCEL: "bg-red-100 text-red-600",
  INVALID_SIGNATURE: "bg-red-100 text-red-600",
  BAD_JSON: "bg-zinc-200 text-zinc-600",
};

export default function AdminWebhookLog() {
  const { data, isLoading } = useQuery({
    queryKey: ["webhook-events"],
    queryFn: api.getWebhookEvents,
    refetchInterval: 3_000,
  });

  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-lg font-semibold">📡 Webhook log (50 gần nhất)</h2>
        <p className="text-xs text-zinc-400">Tự cập nhật 3s/lần</p>
      </div>

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-zinc-200" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Nhận lúc (VN)</th>
                <th className="px-4 py-3">Mã đơn</th>
                <th className="px-4 py-3">Chữ ký</th>
                <th className="px-4 py-3">Kết quả xử lý</th>
                <th className="px-4 py-3">Số tiền</th>
                <th className="px-4 py-3">Ref NH</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(data ?? []).map((event) => (
                <tr key={event.id}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDateTime(event.receivedAt)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {event.orderCode ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {event.signatureValid ? (
                      <span className="text-emerald-600">✓ hợp lệ</span>
                    ) : (
                      <span className="font-medium text-red-600">✗ KHÔNG hợp lệ</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        RESULT_STYLE[event.result] ?? "bg-zinc-200 text-zinc-600"
                      }`}
                    >
                      {event.result}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {event.amount != null ? formatVnd(event.amount) : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{event.reference ?? "—"}</td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-zinc-400">
                    Chưa nhận webhook nào. Hãy thiết lập tunnel + Webhook Url (xem README) rồi
                    thực hiện một thanh toán.
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
