/**
 * Nghiệp vụ tra cứu địa lý IP (proxy server-side, on-demand).
 *
 * Vì sao proxy ở server: tránh CORS + giữ chỗ đổi provider có API key mà không lộ ra
 * client; short-circuit IP nội bộ/loopback NGAY (không tốn request ra ngoài).
 * Provider mặc định: ipwho.is (HTTPS, free, không cần key). Đổi qua env IP_LOOKUP_BASE_URL.
 *
 * Feature này có service nhưng KHÔNG có repository (không chạm DB) — chứng minh tầng
 * controller/service áp dụng đồng nhất kể cả khi không có truy cập dữ liệu.
 */
import axios from "axios";
import { isPrivateIp } from "@/lib/ip";
import type { IpLookupResult } from "@/lib/ip-types";
import { logger } from "@/lib/logger";

const BASE = process.env.IP_LOOKUP_BASE_URL ?? "https://ipwho.is";

export const ipLookupService = {
  async lookup(ip: string): Promise<IpLookupResult> {
    if (isPrivateIp(ip)) {
      return base(ip, "private", "IP nội bộ/loopback — không tra cứu");
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
        return base(ip, "error", data.message ?? `provider trả HTTP ${res.status}`);
      }

      return {
        kind: "public",
        ip,
        country: data.country ?? null,
        region: data.region ?? null,
        city: data.city ?? null,
        isp: data.connection?.isp ?? null,
        lat: data.latitude ?? null,
        lon: data.longitude ?? null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "lookup failed";
      logger.warn({ ip, err }, "ip-lookup: goi provider that bai");
      return base(ip, "error", message);
    }
  },
};

/** Dựng IpLookupResult rỗng (các field địa lý = null) cho nhánh private/error. */
function base(ip: string, kind: "private" | "error", message: string): IpLookupResult {
  return { kind, ip, country: null, region: null, city: null, isp: null, lat: null, lon: null, message };
}
