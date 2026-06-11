/**
 * Rate-limit in-memory đơn giản (sliding window) — server-only.
 *
 * Vì sao tự viết thay vì thêm thư viện: demo chạy single-instance (next dev / 1 process),
 * không có Redis. Một Map<key, mốc-thời-gian[]> là đủ. Đánh đổi đã biết: state RESET khi
 * restart và KHÔNG chia sẻ giữa nhiều instance — chấp nhận được cho demo.
 *
 * Khóa nên dùng là IP (cf-connecting-ip), KHÔNG dùng cookie uid: uid do proxy.ts tự phát
 * cho mọi visitor nên giả mạo/xoay vòng được → giới hạn theo uid là vô nghĩa.
 *
 * GIẢ ĐỊNH TIN CẬY: app expose qua cloudflared nên `cf-connecting-ip` do Cloudflare đặt,
 * client KHÔNG giả mạo được (xem lib/ip.ts). Nếu deploy TRỰC TIẾP không qua proxy tin cậy,
 * `x-forwarded-for` là do client gửi → có thể spoof để né giới hạn; khi đó cần proxy tin cậy
 * ở phía trước.
 *
 * Cache trên globalThis để hot-reload của Next dev không xóa cửa sổ đếm (giống pattern
 * lib/payos.ts, lib/logger.ts).
 */
const g = globalThis as unknown as { __rateLimitHits?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__rateLimitHits ??= new Map());

/** Chặn trên số IP theo dõi đồng thời — vượt ngưỡng thì quét bỏ IP đã hết hạn
 *  (chống phình bộ nhớ khi bị flood từ nhiều IP khác nhau). */
const MAX_TRACKED_KEYS = 10_000;

export type RateLimitResult = { ok: boolean; retryAfterSec: number };

/**
 * Trả { ok } cho biết key còn được phép gọi không, kèm retryAfterSec (giây phải chờ
 * tới khi mốc cũ nhất rời khỏi cửa sổ — chỉ có nghĩa khi ok=false).
 *
 * Gọi hàm này TÍNH LUÔN một lượt: nếu ok thì mốc hiện tại được ghi nhận.
 */
export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - opts.windowMs;

  // Chống phình bộ nhớ: khi quá nhiều IP được theo dõi (vd bị flood đổi IP liên tục),
  // quét bỏ mọi key mà mốc mới nhất đã rời khỏi cửa sổ (IP đó đã ngừng gọi).
  if (hits.size > MAX_TRACKED_KEYS) {
    for (const [k, ts] of hits) {
      if (ts.length === 0 || ts[ts.length - 1] <= windowStart) hits.delete(k);
    }
  }

  // Lọc bỏ mốc đã rời khỏi cửa sổ.
  const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (recent.length >= opts.limit) {
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000));
    hits.set(key, recent); // ghi lại bản đã lọc (không thêm mốc mới khi đã bị chặn)
    return { ok: false, retryAfterSec };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true, retryAfterSec: 0 };
}
