"use client";

import { formatVnd, type Plan } from "@/lib/plans";

interface Props {
  plan: Plan;
  /** User đang dùng đúng gói này */
  isCurrent: boolean;
  /** Đang tạo payment link cho CHÍNH gói này (hiện spinner chữ) */
  creating: boolean;
  /** Khóa mọi nút khi đang có giao dịch dở (chặn double-click/mua chồng đơn) */
  disabled: boolean;
  onBuy: () => void;
}

export default function PlanCard({ plan, isCurrent, creating, disabled, onBuy }: Props) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${
        plan.highlight ? "border-emerald-500 ring-1 ring-emerald-500" : "border-zinc-200"
      }`}
    >
      {plan.highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-0.5 text-xs font-semibold text-white">
          Phổ biến
        </span>
      )}

      <h3 className="text-lg font-semibold">{plan.name}</h3>
      <p className="mt-2">
        <span className="text-2xl font-bold">{formatVnd(plan.price)}</span>
        <span className="text-sm text-zinc-500"> / lần</span>
      </p>

      <ul className="mt-4 flex-1 space-y-2 text-sm text-zinc-600">
        {plan.benefits.map((benefit) => (
          <li key={benefit} className="flex gap-2">
            <span className="text-emerald-600">✓</span>
            {benefit}
          </li>
        ))}
      </ul>

      <button
        onClick={onBuy}
        disabled={disabled || isCurrent}
        className={`mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          isCurrent
            ? "cursor-default bg-emerald-50 text-emerald-700"
            : plan.highlight
              ? "bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
              : "bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50"
        }`}
      >
        {isCurrent ? "Gói hiện tại ✓" : creating ? "Đang tạo link…" : "Mua ngay"}
      </button>
    </div>
  );
}
