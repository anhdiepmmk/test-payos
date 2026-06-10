/**
 * Trích IP client từ headers của Request (server-only — chỉ dùng trong route handlers).
 *
 * App này expose qua cloudflared tunnel nên thứ tự ưu tiên rất quan trọng:
 *   1. cf-connecting-ip — cloudflared/Cloudflare đặt = IP GỐC của bên gọi (đã bóc tunnel).
 *      Với webhook PayOS đây là IP server PayOS thật → đáng tin nhất, kiểm tra đầu tiên.
 *   2. x-forwarded-for — HOP ĐẦU (client gốc); các hop sau là proxy trung gian.
 *   3. x-real-ip — fallback của một số proxy.
 * Localhost trực tiếp (trình duyệt → next dev, không qua tunnel): các header này thường
 * vắng mặt → trả null (UI hiển thị "—", không có nút tra cứu).
 */
export function getClientIp(req: Request): string | null {
  const h = req.headers;

  const cf = h.get("cf-connecting-ip");
  if (cf) return normalizeIp(cf);

  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return normalizeIp(first);
  }

  const real = h.get("x-real-ip");
  if (real) return normalizeIp(real);

  return null;
}

/** Bóc tiền tố IPv4-mapped-IPv6: "::ffff:1.2.3.4" → "1.2.3.4". */
function normalizeIp(ip: string): string {
  const v = ip.trim();
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(v);
  return m ? m[1] : v;
}

/**
 * IP nội bộ/loopback/link-local/CGNAT → KHÔNG tra cứu địa lý (provider sẽ báo lỗi/vô nghĩa).
 * Proxy /api/admin/ip-lookup dùng hàm này để short-circuit trước khi gọi ra ngoài.
 */
export function isPrivateIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (v === "::1" || v === "localhost") return true;
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true; // IPv6 ULA / link-local

  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 0 || a === 10 || a === 127) return true; // this-host / private / loopback
  if (a === 192 && b === 168) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  return false;
}
