/**
 * GET /api/admin/ip-lookup?ip=1.2.3.4 — proxy tra cứu địa lý IP.
 *
 * ⚠️ DEMO: KHÔNG có auth (giống /api/admin/orders). Production BẮT BUỘC phải bảo vệ —
 * nếu không nó là một open IP-lookup proxy bất kỳ ai cũng gọi được.
 *
 * Luôn trả HTTP 200 (trừ thiếu param) kèm `kind` để client render thông báo thay vì
 * throw — đồng bộ với phong cách "result marker tường minh" của codebase.
 */
import { ipLookupService } from "./ip-lookup.service";

export async function GET(req: Request) {
  const ip = new URL(req.url).searchParams.get("ip")?.trim();
  if (!ip) {
    return Response.json({ error: "Thiếu query param ?ip=" }, { status: 400 });
  }
  return Response.json(await ipLookupService.lookup(ip));
}
