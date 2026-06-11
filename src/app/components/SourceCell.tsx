"use client";

/**
 * Ô "Nguồn" gộp IP + User-Agent vào MỘT cột (tiết kiệm chiều ngang bảng admin):
 *   - Dòng trên: IP + tra cứu vị trí (tái dùng <IpCell/>).
 *   - Dòng dưới: nhãn thiết bị/trình duyệt rút gọn (shortUserAgent); BẤM để mở popover xem
 *     User-Agent đầy đủ (chọn/bôi đen được) kèm nút Copy — tooltip native không copy được.
 * Dùng chung cho bảng đơn (creatorIp/creatorUserAgent) và webhook log (callerIp/callerUserAgent).
 */
import { useEffect, useRef, useState } from "react";
import { shortUserAgent } from "@/lib/user-agent";
import IpCell from "./IpCell";

export default function SourceCell({
  ip,
  userAgent,
}: {
  ip: string | null;
  userAgent: string | null;
}) {
  return (
    <div className="space-y-0.5">
      <IpCell ip={ip} />
      {userAgent && <UserAgentLabel ua={userAgent} />}
    </div>
  );
}

function UserAgentLabel({ ua }: { ua: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Đóng popover khi bấm ra ngoài (cùng pattern với IpCell).
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(ua);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API có thể bị chặn (ngữ cảnh không bảo mật) — người dùng vẫn bôi đen tay được.
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Bấm để xem / copy User-Agent đầy đủ"
        className="block max-w-40 truncate text-left text-xs text-zinc-400 hover:text-sky-600"
      >
        {shortUserAgent(ua)}
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-72 rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs shadow-lg">
          <p className="mb-2 break-all font-mono leading-relaxed text-zinc-600 select-all">{ua}</p>
          <button
            type="button"
            onClick={copy}
            className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-sky-600 hover:bg-sky-50"
          >
            {copied ? "✓ Đã copy" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
