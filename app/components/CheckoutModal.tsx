"use client";

/**
 * Modal chứa PayOS EMBEDDED CHECKOUT (iframe hiện VietQR) — component lõi của luồng thanh toán.
 *
 * Máy trạng thái (phase):
 *   qr         → iframe đang hiện QR, có countdown hết hạn; poll chậm 3s (đề phòng webhook
 *                về trước cả tín hiệu postMessage của iframe).
 *   confirming → iframe báo đã thanh toán (onSuccess) — NHƯNG gói chưa chắc kích hoạt,
 *                phải chờ webhook (nguồn sự thật). Poll nhanh 1.5s, tối đa 30s.
 *   paid       → server xác nhận PAID (webhook đã xử lý) → toast + tự đóng.
 *   timeout    → quá 30s chưa thấy PAID → hướng dẫn kiểm tra tunnel/Webhook Url + nút thử lại.
 *   expired    → QR quá hạn 15 phút → nút "Tạo QR mới".
 *
 * Những cái bẫy đã né (đừng sửa nếu chưa đọc README):
 * - `@payos/payos-checkout` (KHÔNG phải package cũ `payos-checkout` đã deprecated):
 *   `embedded: true` là cờ config, `open()` không có tham số.
 * - Container #payos-embedded-container BẮT BUỘC có height cố định — iframe height:100%.
 * - `usePayOS` không phải hook thật (tạo instance mới mỗi render) → open/exit không được
 *   đưa vào deps của useEffect (identity đổi mỗi render → vòng lặp vô hạn).
 * - `exit()` trong cleanup của effect: chống StrictMode mount 2 lần (2 iframe chồng nhau)
 *   và dọn iframe khi unmount.
 * - Đóng modal thủ công KHÔNG hủy đơn (user có thể đã chụp QR, trả tiền sau vẫn hợp lệ);
 *   chỉ bấm "Hủy" bên trong iframe PayOS (onCancel) mới hủy đơn thật.
 */
import { usePayOS, type PayOSConfig } from "@payos/payos-checkout";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { secondsLeft } from "@/lib/datetime";
import { formatVnd } from "@/lib/plans";

type Phase = "qr" | "confirming" | "paid" | "timeout" | "expired";

interface Props {
  orderCode: number;
  planName: string;
  amount: number;
  checkoutUrl: string;
  /** unix giây — trùng expiredAt đã gửi sang PayOS */
  expiredAt: number;
  onPaid: () => void;
  /** Tạo lại payment link cùng gói khi QR hết hạn */
  onRecreate: () => void;
  onClose: () => void;
}

const CONTAINER_ID = "payos-embedded-container";
const CONFIRM_TIMEOUT_MS = 30_000;

export default function CheckoutModal({
  orderCode,
  planName,
  amount,
  checkoutUrl,
  expiredAt,
  onPaid,
  onRecreate,
  onClose,
}: Props) {
  const [phase, setPhase] = useState<Phase>("qr");
  const [remaining, setRemaining] = useState(() => secondsLeft(expiredAt));
  // ref để các effect đọc phase mới nhất mà không cần đưa phase vào deps
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const config: PayOSConfig = {
    RETURN_URL: typeof window !== "undefined" ? window.location.origin : "",
    ELEMENT_ID: CONTAINER_ID,
    CHECKOUT_URL: checkoutUrl,
    embedded: true,
    // iframe báo PAID — lib đã tự gỡ iframe. Đây CHỈ là tín hiệu UI:
    // chuyển sang "confirming" và chờ webhook xác nhận phía server.
    onSuccess: () => setPhase("confirming"),
    // User bấm "Hủy" trong iframe PayOS → hủy đơn thật rồi đóng modal.
    onCancel: () => {
      void api.cancelOrder(orderCode).catch(() => {});
      onClose();
    },
    // User đóng giao diện thanh toán bên trong iframe → đóng modal, GIỮ đơn PENDING.
    onExit: () => onClose(),
  };
  const { open, exit } = usePayOS(config);

  // Chèn iframe sau khi container đã có trong DOM; cleanup gỡ iframe + listener.
  useEffect(() => {
    open();
    return () => exit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/exit đổi identity mỗi render
  }, [checkoutUrl]);

  // Poll trạng thái đơn từ server CỦA TA (webhook là nguồn sự thật — không hỏi thẳng PayOS).
  const orderQuery = useQuery({
    queryKey: ["order", orderCode],
    queryFn: () => api.getOrder(orderCode),
    refetchInterval: phase === "confirming" ? 1_500 : 3_000,
    enabled: phase === "qr" || phase === "confirming",
  });
  const orderStatus = orderQuery.data?.status;

  // Phản ứng theo trạng thái server trả về (cover cả 2 chiều race với postMessage).
  useEffect(() => {
    if (!orderStatus) return;
    const current = phaseRef.current;
    if (orderStatus === "PAID" && current !== "paid") {
      setPhase("paid");
      onPaid();
      return;
    }
    if (orderStatus === "EXPIRED" && current === "qr") {
      exit();
      setPhase("expired");
      return;
    }
    if (orderStatus === "CANCELLED" && current === "qr") {
      exit();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi status đổi
  }, [orderStatus]);

  // PAID → tự đóng sau 1.5s (kịp đọc thông báo thành công).
  useEffect(() => {
    if (phase !== "paid") return;
    const timer = setTimeout(onClose, 1_500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Countdown QR; về 0 → expired.
  useEffect(() => {
    if (phase !== "qr") return;
    const timer = setInterval(() => {
      const left = secondsLeft(expiredAt);
      setRemaining(left);
      if (left <= 0) {
        exit();
        setPhase("expired");
      }
    }, 1_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, expiredAt]);

  // Ở "confirming" quá 30s chưa PAID → timeout (webhook chưa tới server).
  useEffect(() => {
    if (phase !== "confirming") return;
    const timer = setTimeout(() => setPhase("timeout"), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  function handleManualClose() {
    exit();
    onClose();
  }

  const mm = Math.floor(remaining / 60);
  const ss = (remaining % 60).toString().padStart(2, "0");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={handleManualClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              Mua gói {planName} — {formatVnd(amount)}
            </h2>
            <p className="text-xs text-zinc-500">Mã đơn: {orderCode}</p>
          </div>
          <button
            onClick={handleManualClose}
            className="rounded-lg px-2 py-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {phase === "qr" && (
          <>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-zinc-600">
                Quét QR bằng app ngân hàng để thanh toán
              </span>
              <span className="rounded-full bg-amber-100 px-3 py-1 font-mono text-amber-700">
                ⏳ {mm}:{ss}
              </span>
            </div>
            {/* Container của iframe PayOS — PHẢI có height cố định (iframe height:100%) */}
            <div id={CONTAINER_ID} className="h-[480px] w-full overflow-hidden rounded-xl border border-zinc-200" />
            <p className="mt-3 text-center text-xs text-zinc-400">
              Gói chỉ được kích hoạt sau khi server nhận webhook từ PayOS — không thể gian
              lận từ trình duyệt.
            </p>
          </>
        )}

        {phase === "confirming" && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-emerald-500" />
            <p className="font-medium">Đã nhận thanh toán từ PayOS…</p>
            <p className="text-sm text-zinc-500">
              Đang chờ webhook xác nhận với server để kích hoạt gói (vài giây).
            </p>
          </div>
        )}

        {phase === "paid" && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="text-5xl">✅</div>
            <p className="text-lg font-semibold text-emerald-600">
              Gói {planName} đã được kích hoạt!
            </p>
          </div>
        )}

        {phase === "timeout" && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="text-4xl">⚠️</div>
            <p className="font-medium">PayOS đã ghi nhận thanh toán, nhưng webhook chưa tới server.</p>
            <p className="text-sm text-zinc-500">
              Thường do tunnel (cloudflared) không chạy hoặc Webhook Url trên dashboard
              PayOS chưa đúng/chưa cập nhật. Đơn vẫn ở trạng thái chờ — webhook tới muộn
              vẫn kích hoạt gói bình thường.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPhase("confirming")}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Kiểm tra lại
              </button>
              <button
                onClick={handleManualClose}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
              >
                Đóng
              </button>
            </div>
          </div>
        )}

        {phase === "expired" && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="text-4xl">⌛</div>
            <p className="font-medium">Mã QR đã hết hạn (15 phút).</p>
            <p className="text-sm text-zinc-500">
              Đơn này không thể thanh toán nữa. Tạo mã QR mới để tiếp tục mua gói {planName}.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onRecreate}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Tạo QR mới
              </button>
              <button
                onClick={handleManualClose}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
