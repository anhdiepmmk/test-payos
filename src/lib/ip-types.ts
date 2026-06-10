/**
 * Kết quả tra cứu địa lý IP — dùng CHUNG bởi route server (app/api/admin/ip-lookup)
 * và client (lib/api.ts + IpCell). Tách riêng file type-only để client import được mà
 * không kéo code server (giống quy ước "chỉ import TYPE" trong lib/api.ts).
 *
 * `kind` phân loại để UI hiển thị đúng thay vì throw:
 *   - "public"  : tra cứu thành công, có dữ liệu địa lý.
 *   - "private" : IP nội bộ/loopback → không gọi provider, các field địa lý = null.
 *   - "error"   : provider lỗi/timeout/không tìm thấy → kèm `message`.
 */
export interface IpLookupResult {
  kind: "public" | "private" | "error";
  ip: string;
  country: string | null;
  region: string | null;
  city: string | null;
  isp: string | null;
  lat: number | null;
  lon: number | null;
  message?: string;
}
