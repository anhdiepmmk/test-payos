"use client";

/**
 * Component điều phối của trang bán gói:
 * - Tải account (gói hiện tại + lịch sử đơn) bằng TanStack Query.
 * - Tạo payment link khi bấm "Mua ngay" (mutation) → mở CheckoutModal.
 * - "Tiếp tục thanh toán" / "Hủy" đơn PENDING từ lịch sử.
 * Lưu ý: component này chỉ ĐỌC trạng thái — mọi việc kích hoạt gói diễn ra ở webhook (server).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api, extractErrorMessage } from "@/lib/api";
import type { OrderRow } from "@/lib/db/schema";
import { PLANS, getPlan, type PlanId } from "@/lib/plans";
import CheckoutModal from "./CheckoutModal";
import CurrentPlanBanner from "./CurrentPlanBanner";
import OrderHistory from "./OrderHistory";
import PlanCard from "./PlanCard";

interface PendingCheckout {
  orderCode: number;
  planId: PlanId;
  planName: string;
  amount: number;
  checkoutUrl: string;
  expiredAt: number;
}

interface Toast {
  type: "success" | "error";
  message: string;
}

export default function PlansDashboard() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingCheckout | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const account = useQuery({ queryKey: ["account"], queryFn: api.getAccount });

  function showToast(type: Toast["type"], message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5_000);
  }

  function refreshAccount() {
    void queryClient.invalidateQueries({ queryKey: ["account"] });
  }

  const createPayment = useMutation({
    mutationFn: api.createPayment,
    onSuccess: (res, planId) => {
      const plan = getPlan(planId)!;
      setPending({
        orderCode: res.orderCode,
        planId,
        planName: plan.name,
        amount: plan.price,
        checkoutUrl: res.checkoutUrl,
        expiredAt: res.expiredAt,
      });
      refreshAccount(); // đơn PENDING mới hiện ngay trong lịch sử
    },
    onError: (err) => showToast("error", extractErrorMessage(err)),
  });

  const cancelOrder = useMutation({
    mutationFn: api.cancelOrder,
    onSettled: refreshAccount,
  });

  // Chặn double-click/mua chồng đơn: đang tạo link hoặc đang mở modal thì khóa mọi nút Mua.
  const buying = createPayment.isPending || pending !== null;

  /** Mở lại modal cho đơn PENDING còn hạn ("Tiếp tục thanh toán"). */
  function resumeOrder(order: OrderRow) {
    const plan = getPlan(order.planId);
    setPending({
      orderCode: order.orderCode,
      planId: order.planId,
      planName: plan?.name ?? order.planId,
      amount: order.amount,
      checkoutUrl: order.checkoutUrl,
      expiredAt: order.expiredAt,
    });
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">⚡ Nâng cấp tài khoản</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Demo thanh toán VietQR qua PayOS — quét QR bằng app ngân hàng, gói kích hoạt
            tự động qua webhook.
          </p>
        </div>
        <Link
          href="/admin"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"
        >
          Trang Admin →
        </Link>
      </div>

      <CurrentPlanBanner
        loading={account.isLoading}
        currentPlan={account.data?.currentPlan ?? null}
        activatedAt={account.data?.activatedAt ?? null}
      />

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={account.data?.currentPlan === plan.id}
            creating={createPayment.isPending && createPayment.variables === plan.id}
            disabled={buying}
            onBuy={() => createPayment.mutate(plan.id)}
          />
        ))}
      </div>

      <OrderHistory
        orders={account.data?.orders ?? []}
        loading={account.isLoading}
        onResume={resumeOrder}
        onCancel={(orderCode) => cancelOrder.mutate(orderCode)}
      />

      {pending && (
        <CheckoutModal
          orderCode={pending.orderCode}
          planName={pending.planName}
          amount={pending.amount}
          checkoutUrl={pending.checkoutUrl}
          expiredAt={pending.expiredAt}
          onPaid={() => {
            refreshAccount();
            showToast("success", `Đã kích hoạt gói ${pending.planName}!`);
          }}
          onRecreate={() => {
            const planId = pending.planId;
            setPending(null);
            createPayment.mutate(planId); // orderCode mới, QR mới
          }}
          onClose={() => {
            setPending(null);
            refreshAccount();
          }}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-lg ${
            toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
