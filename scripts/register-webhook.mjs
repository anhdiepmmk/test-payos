/**
 * Đăng ký Webhook URL với PayOS bằng API (cách B — cách A là dán URL vào dashboard my.payos.vn).
 *
 * Cách dùng:
 *   npm run register-webhook -- https://<domain-tunnel>/api/webhooks/payos
 *
 * LƯU Ý: PayOS sẽ gửi một request kiểm tra đến URL này NGAY LẬP TỨC —
 * `npm run dev` và tunnel (cloudflared/ngrok) phải đang chạy thì đăng ký mới thành công.
 */
import { PayOS } from "@payos/node";

const url = process.argv[2];
if (!url || !url.startsWith("https://")) {
  console.error("Cách dùng: npm run register-webhook -- https://<domain-tunnel>/api/webhooks/payos");
  console.error("(URL phải là https — dùng cloudflared hoặc ngrok để có URL công khai)");
  process.exit(1);
}

const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID,
  apiKey: process.env.PAYOS_API_KEY,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY,
});

try {
  const result = await payos.webhooks.confirm(url);
  console.log("✅ Đăng ký webhook thành công:", result);
} catch (err) {
  console.error("❌ Đăng ký webhook thất bại:", err.message ?? err);
  console.error("Kiểm tra: dev server + tunnel có đang chạy không? URL có đúng /api/webhooks/payos không?");
  process.exit(1);
}
