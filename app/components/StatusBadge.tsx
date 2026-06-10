"use client";

import type { OrderStatus } from "@/lib/db/schema";

const STYLE: Record<OrderStatus, { label: string; className: string }> = {
  PENDING: { label: "Chờ thanh toán", className: "bg-amber-100 text-amber-700" },
  PAID: { label: "Thành công", className: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { label: "Đã hủy", className: "bg-zinc-200 text-zinc-600" },
  EXPIRED: { label: "Hết hạn", className: "bg-red-100 text-red-600" },
};

export default function StatusBadge({ status }: { status: OrderStatus }) {
  const style = STYLE[status] ?? STYLE.PENDING;
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${style.className}`}
    >
      {style.label}
    </span>
  );
}
