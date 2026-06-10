"use client";

import { formatDateTime } from "@/lib/datetime";
import { getPlan, type PlanId } from "@/lib/plans";

interface Props {
  loading: boolean;
  currentPlan: PlanId | null;
  activatedAt: string | null;
}

export default function CurrentPlanBanner({ loading, currentPlan, activatedAt }: Props) {
  if (loading) {
    return (
      <div className="h-20 animate-pulse rounded-2xl bg-zinc-200" aria-label="Đang tải" />
    );
  }

  const plan = currentPlan ? getPlan(currentPlan) : undefined;

  if (!plan) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-5">
        <p className="font-medium">Bạn chưa có gói nào</p>
        <p className="mt-1 text-sm text-zinc-500">
          Chọn một gói bên dưới và thanh toán bằng VietQR để kích hoạt.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 p-5 text-white shadow">
      <p className="text-sm/5 opacity-80">Gói hiện tại</p>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="text-2xl font-bold">{plan.name}</span>
        <span className="text-sm opacity-80">
          kích hoạt lúc {formatDateTime(activatedAt)} (giờ VN)
        </span>
      </div>
    </div>
  );
}
