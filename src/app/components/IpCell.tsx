"use client";

/**
 * Ô hiển thị IP + icon 📍 tra cứu vị trí (dùng chung cho bảng đơn & bảng webhook log).
 *
 * - IP = null  → "—", KHÔNG hiện icon (không có gì để tra).
 * - Bấm icon   → lazy fetch /api/admin/ip-lookup (chỉ gọi khi mở; cache vĩnh viễn trong
 *   phiên; không retry) → hiện popover nổi neo vào ô. Query ĐỘC LẬP với refetch 3s/5s
 *   của bảng nên không spam rate-limit của provider.
 * - Icon là inline SVG (không thêm thư viện icon — hợp gu emoji + Tailwind của dự án).
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function IpCell({ ip }: { ip: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["ip-lookup", ip],
    queryFn: () => api.getIpLookup(ip as string),
    enabled: open && !!ip,
    staleTime: Infinity, // public/private là ổn định → cache cả phiên, không refetch theo bảng
    retry: false,
  });

  // Mở popover; nếu lần trước lỗi (provider timeout/rate-limit) thì thử lại — vì
  // staleTime:Infinity sẽ không tự refetch, dễ kẹt lỗi tạm thời suốt phiên nếu không ép.
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && (isError || data?.kind === "error")) refetch();
  }

  // Đóng popover khi bấm ra ngoài.
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (!ip) return <span className="text-zinc-400">—</span>;

  return (
    <div ref={ref} className="relative inline-block">
      <span className="font-mono text-xs">{ip}</span>
      <button
        type="button"
        onClick={toggle}
        title="Tra cứu vị trí IP"
        aria-label="Tra cứu vị trí IP"
        className="ml-1 align-middle text-zinc-400 hover:text-sky-600"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="inline-block"
        >
          <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs shadow-lg">
          {isLoading && <p className="text-zinc-500">Đang tra cứu…</p>}
          {isError && <p className="text-red-600">Lỗi tra cứu — thử lại sau.</p>}
          {data?.kind === "private" && (
            <p className="text-zinc-500">{data.message ?? "IP nội bộ — không tra cứu"}</p>
          )}
          {data?.kind === "error" && (
            <p className="text-red-600">Không tra được: {data.message}</p>
          )}
          {data?.kind === "public" && (
            <dl className="space-y-1">
              <Row label="Thành phố" value={data.city} />
              <Row label="Vùng" value={data.region} />
              <Row label="Quốc gia" value={data.country} />
              <Row label="ISP" value={data.isp} />
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="max-w-32 truncate text-right" title={value ?? ""}>
        {value ?? "—"}
      </dd>
    </div>
  );
}
