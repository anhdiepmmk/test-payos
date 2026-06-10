/**
 * GET /api/admin/ip-lookup?ip=1.2.3.4 — proxy tra cứu địa lý IP (on-demand, server-side).
 *
 * Vì sao là proxy ở server chứ không gọi thẳng từ trình duyệt:
 *   - Tránh CORS + giữ chỗ để sau này đổi sang provider có API key mà không lộ key ra client.
 *   - Short-circuit IP nội bộ/loopback NGAY (không tốn request ra ngoài).
 * Provider mặc định: ipwho.is (HTTPS, free, không cần key). Đổi qua env IP_LOOKUP_BASE_URL.
 *
 * ⚠️ DEMO: route này KHÔNG có auth (giống /api/admin/orders). Production BẮT BUỘC phải
 * bảo vệ — nếu không nó là một open IP-lookup proxy bất kỳ ai cũng gọi được.
 *
 * Luôn trả HTTP 200 (trừ thiếu param) kèm `kind` để client render thông báo thay vì
 * throw — đồng bộ với phong cách "result marker tường minh" của codebase.
 */
import axios from "axios";
import { isPrivateIp } from "@/lib/ip";
import type { IpLookupResult } from "@/lib/ip-types";
import { logger } from "@/lib/logger";

const BASE = process.env.IP_LOOKUP_BASE_URL ?? "https://ipwho.is";

export async function GET(req: Request) {
  const ip = new URL(req.url).searchParams.get("ip")?.trim();
  if (!ip) {
    return Response.json({ error: "Thiếu query param ?ip=" }, { status: 400 });
  }

  if (isPrivateIp(ip)) {
    return Response.json(base(ip, "private", "IP nội bộ/loopback — không tra cứu"));
  }

  try {
    // Dùng axios (KHÔNG dùng fetch): fetch của Node/undici tự thêm header `Origin`,
    // khiến ipwho.is free plan trả 403 "CORS is not supported on the Free plan".
    // Axios (adapter http) không gửi Origin nên provider chấp nhận request server-side.
    const res = await axios.get<{
      success?: boolean;
      country?: string;
      region?: string;
      city?: string;
      latitude?: number;
      longitude?: number;
      connection?: { isp?: string };
      message?: string;
    }>(`${BASE}/${encodeURIComponent(ip)}`, { timeout: 8_000, validateStatus: () => true });
    const data = res.data;

    if (res.status < 200 || res.status >= 300 || data.success === false) {
      logger.warn({ ip, status: res.status, msg: data.message }, "ip-lookup: provider tra ve loi");
      return Response.json(
        base(ip, "error", data.message ?? `provider trả HTTP ${res.status}`),
      );
    }

    const result: IpLookupResult = {
      kind: "public",
      ip,
      country: data.country ?? null,
      region: data.region ?? null,
      city: data.city ?? null,
      isp: data.connection?.isp ?? null,
      lat: data.latitude ?? null,
      lon: data.longitude ?? null,
    };
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "lookup failed";
    logger.warn({ ip, err }, "ip-lookup: goi provider that bai");
    return Response.json(base(ip, "error", message));
  }
}

/** Dựng IpLookupResult rỗng (các field địa lý = null) cho nhánh private/error. */
function base(ip: string, kind: "private" | "error", message: string): IpLookupResult {
  return { kind, ip, country: null, region: null, city: null, isp: null, lat: null, lon: null, message };
}
