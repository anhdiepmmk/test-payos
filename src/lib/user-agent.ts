/**
 * Rút gọn chuỗi User-Agent (rất dài) thành nhãn ngắn "Trình duyệt / Hệ điều hành" để
 * hiển thị gọn trong bảng admin — bản đầy đủ vẫn xem được khi hover (title).
 *
 * Cố ý KHÔNG thêm thư viện parse UA: regex đủ dùng cho mục đích audit demo. Thứ tự nhận
 * diện trình duyệt QUAN TRỌNG (Edge/Opera giả danh Chrome; Chrome giả danh Safari).
 */

/** Bên gọi non-browser hay gặp (vd webhook PayOS gọi bằng axios). Khớp tiền tố token. */
const HTTP_CLIENTS = ["axios", "Go-http-client", "okhttp", "python-requests", "curl", "node-fetch", "got"];

function detectBrowser(ua: string): string | null {
  if (/\bEdg(?:e|A|iOS)?\//.test(ua)) return "Edge";
  if (/\b(?:OPR|Opera)\//.test(ua)) return "Opera";
  if (/\bChrome\//.test(ua)) return "Chrome";
  if (/\bFirefox\//.test(ua)) return "Firefox";
  if (/\bSafari\//.test(ua)) return "Safari";
  return null;
}

function detectOs(ua: string): string | null {
  if (/Windows/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Macintosh|Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

export function shortUserAgent(ua: string | null): string {
  if (!ua) return "—";

  // Non-browser client (webhook caller...): hiện tên client cho gọn, vd "axios".
  for (const client of HTTP_CLIENTS) {
    if (ua.toLowerCase().startsWith(client.toLowerCase())) return client;
  }

  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  if (browser && os) return `${browser} / ${os}`;
  if (browser) return browser;
  if (os) return os;

  // Fallback: token đầu trước "/" (vd "MyApp/1.0" → "MyApp"), nếu trống thì "Khác".
  return ua.split("/")[0]?.trim() || "Khác";
}
