/**
 * Seed dữ liệu DEMO cho SQLite (data/app.db).
 *
 * Vì sao cần: thư mục data/ bị .gitignore (dữ liệu runtime không commit) → ai
 * clone repo về sẽ có DB RỖNG, dashboard/webhook log/đơn hàng trống trơn. Script
 * này nạp sẵn một bộ dữ liệu mẫu (lấy từ DB thật rồi LÀM SẠCH thông tin nhạy cảm)
 * để demo có nội dung ngay.
 *
 * Cách dùng:
 *   npm run db:seed            # seed-NẾU-RỖNG: chỉ nạp khi bảng orders trống (an toàn)
 *   npm run db:seed -- --force # xóa sạch 3 bảng rồi nạp lại từ đầu
 *
 * Chạy TỰ ĐỘNG qua `predev` (sau db:push) nên `npm run dev` là đã có dữ liệu.
 *
 * LƯU Ý dữ liệu đã được làm sạch (KHÔNG phải dữ liệu thật):
 *   - Tên người chuyển khoản  → "NGUYEN VAN A"
 *   - Số TK người chuyển/merchant, mã giao dịch (reference) → giá trị giả
 *   - orderCode / paymentLinkId / signature → giá trị tổng hợp, nhất quán giữa
 *     bảng orders ↔ webhook_events ↔ rawPayload
 *   - IP client thật → dải IP tài liệu (RFC 5737 / RFC 3849: 203.0.113.x, 2001:db8::)
 *   - returnUrl (tunnel cloudflared thật) → http://localhost:3000/
 * Bộ webhook TEST_WEBHOOK (orderCode 123) giữ nguyên VÌ đó là ví dụ công khai
 * trong tài liệu PayOS, không chứa thông tin cá nhân.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath = path.join(process.cwd(), "data", "app.db");

// URL checkout giả, paymentLinkId = số thứ tự pad 0 cho đủ 32 ký tự (như PayOS).
const linkId = (n) => String(n).padStart(32, "0");
const checkoutUrl = (n) => `https://pay.payos.vn/web/${linkId(n)}`;

// --- users: 2 người đã kích hoạt VIP (khớp 2 đơn PAID), 4 người chưa mua ----
const USERS = [
  { id: "dce55c49-dbc2-4f83-82d3-78080c055d49", currentPlan: "vip", activatedAt: "2026-06-10T18:19:34.500Z" },
  { id: "fcb2c017-7018-4472-bd5f-d89237d5f6ee", currentPlan: "vip", activatedAt: "2026-06-10T20:07:52.679Z" },
  { id: "186e667e-9374-4eb9-8be5-8510b82b23fc", currentPlan: null, activatedAt: null },
  { id: "06fe72e2-c41e-47c0-a628-85020fba39d9", currentPlan: null, activatedAt: null },
  { id: "smoke-user", currentPlan: null, activatedAt: null },
  { id: "3f18ba57-7737-4c05-8a9b-6d2ec60cf3a7", currentPlan: null, activatedAt: null },
];

// --- orders: 17 EXPIRED + 2 PAID. `seq` chỉ dùng để dựng checkoutUrl/paymentLinkId.
const U1 = "dce55c49-dbc2-4f83-82d3-78080c055d49";
const U2 = "06fe72e2-c41e-47c0-a628-85020fba39d9";
const U3 = "fcb2c017-7018-4472-bd5f-d89237d5f6ee";
const U4 = "3f18ba57-7737-4c05-8a9b-6d2ec60cf3a7";
const IP6 = "2001:db8::abcd"; // RFC 3849 — thay cho IPv6 client thật
const LH = "http://localhost:3000/";

const ORDERS = [
  { seq: 1, orderCode: 1900000000000101, userId: U1, planId: "pro", amount: 20000, description: "GOI PRO", returnUrl: null, expiredAt: 1781115194, status: "EXPIRED", createdAt: "2026-06-10T17:58:14.786Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: null },
  { seq: 2, orderCode: 1900000000000202, userId: U1, planId: "max5x", amount: 50000, description: "GOI MAX5", returnUrl: null, expiredAt: 1781115217, status: "EXPIRED", createdAt: "2026-06-10T17:58:38.134Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: null },
  { seq: 3, orderCode: 1900000000000303, userId: U1, planId: "pro", amount: 20000, description: "GOI PRO", returnUrl: null, expiredAt: 1781115410, status: "EXPIRED", createdAt: "2026-06-10T18:01:51.116Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: null },
  { seq: 4, orderCode: 1900000000000404, userId: U1, planId: "pro", amount: 20000, description: "GOI PRO", returnUrl: null, expiredAt: 1781115633, status: "EXPIRED", createdAt: "2026-06-10T18:05:33.771Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: null },
  { seq: 5, orderCode: 1900000000000505, userId: U1, planId: "pro", amount: 20000, description: "GOI PRO", returnUrl: null, expiredAt: 1781115655, status: "EXPIRED", createdAt: "2026-06-10T18:05:55.888Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: null },
  { seq: 6, orderCode: 1900000000000606, userId: U1, planId: "pro", amount: 20000, description: "GOI PRO", returnUrl: null, expiredAt: 1781115694, status: "EXPIRED", createdAt: "2026-06-10T18:06:35.002Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: null },
  { seq: 7, orderCode: 1900000000000707, userId: U1, planId: "max5x", amount: 50000, description: "GOI MAX5", returnUrl: null, expiredAt: 1781115758, status: "EXPIRED", createdAt: "2026-06-10T18:07:38.698Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: null },
  { seq: 8, orderCode: 1900000000000808, userId: U1, planId: "max5x", amount: 50000, description: "GOI MAX5", returnUrl: null, expiredAt: 1781115771, status: "EXPIRED", createdAt: "2026-06-10T18:07:51.759Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: null },
  { seq: 9, orderCode: 1900000000000909, userId: U1, planId: "vip", amount: 10000, description: "GOI VIP", returnUrl: LH, expiredAt: 1781116417, status: "PAID", createdAt: "2026-06-10T18:18:37.900Z", paidAt: "2026-06-10T18:19:34.500Z", reference: "FT00000000000009", counterAccountName: "NGUYEN VAN A", note: null, creatorIp: null },
  { seq: 10, orderCode: 1900000000001010, userId: U2, planId: "max20x", amount: 100000, description: "GOI MAX20", returnUrl: LH, expiredAt: 1781116687, status: "EXPIRED", createdAt: "2026-06-10T18:23:08.382Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: null },
  { seq: 11, orderCode: 1900000000001111, userId: U2, planId: "vip", amount: 10000, description: "GOI VIP", returnUrl: LH, expiredAt: 1781116704, status: "EXPIRED", createdAt: "2026-06-10T18:23:24.969Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: null },
  { seq: 12, orderCode: 1900000000001212, userId: U3, planId: "pro", amount: 20000, description: "GOI PRO", returnUrl: LH, expiredAt: 1781122273, status: "EXPIRED", createdAt: "2026-06-10T19:56:13.753Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: IP6 },
  { seq: 13, orderCode: 1900000000001313, userId: U3, planId: "max20x", amount: 100000, description: "GOI MAX20", returnUrl: LH, expiredAt: 1781122419, status: "EXPIRED", createdAt: "2026-06-10T19:58:40.075Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: IP6 },
  { seq: 14, orderCode: 1900000000001414, userId: U3, planId: "pro", amount: 20000, description: "GOI PRO", returnUrl: LH, expiredAt: 1781122850, status: "EXPIRED", createdAt: "2026-06-10T20:05:51.500Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: IP6 },
  { seq: 15, orderCode: 1900000000001515, userId: U3, planId: "max5x", amount: 50000, description: "GOI MAX5", returnUrl: LH, expiredAt: 1781122861, status: "EXPIRED", createdAt: "2026-06-10T20:06:02.243Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: IP6 },
  { seq: 16, orderCode: 1900000000001616, userId: U3, planId: "max20x", amount: 100000, description: "GOI MAX20", returnUrl: LH, expiredAt: 1781122867, status: "EXPIRED", createdAt: "2026-06-10T20:06:08.492Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: IP6 },
  { seq: 17, orderCode: 1900000000001717, userId: U3, planId: "vip", amount: 10000, description: "GOI VIP", returnUrl: LH, expiredAt: 1781122877, status: "EXPIRED", createdAt: "2026-06-10T20:06:18.336Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: IP6 },
  { seq: 18, orderCode: 1900000000001818, userId: U3, planId: "vip", amount: 10000, description: "GOI VIP", returnUrl: LH, expiredAt: 1781122935, status: "PAID", createdAt: "2026-06-10T20:07:16.282Z", paidAt: "2026-06-10T20:07:52.679Z", reference: "FT00000000000018", counterAccountName: "NGUYEN VAN A", note: null, creatorIp: IP6 },
  { seq: 19, orderCode: 1900000000001919, userId: U4, planId: "vip", amount: 10000, description: "GOI VIP", returnUrl: LH, expiredAt: 1781147457, status: "EXPIRED", createdAt: "2026-06-11T02:55:57.812Z", paidAt: null, reference: null, counterAccountName: null, note: null, creatorIp: "203.0.113.20" },
];

// rawPayload của đơn PAID #18 — đã thay sạch số TK, tên, reference, orderCode,
// paymentLinkId, signature; giữ nguyên cấu trúc PayOS gửi về để demo replay/audit.
const PAID_PAYLOAD_18 = JSON.stringify({
  code: "00",
  desc: "success",
  success: true,
  data: {
    accountNumber: "1234567890",
    amount: 10000,
    description: "GOI VIP",
    reference: "FT00000000000018",
    transactionDateTime: "2026-06-11 03:07:51",
    virtualAccountNumber: "",
    counterAccountBankId: "01310001",
    counterAccountBankName: "",
    counterAccountName: "NGUYEN VAN A",
    counterAccountNumber: "0000000000",
    virtualAccountName: "",
    currency: "VND",
    orderCode: 1900000000001818,
    paymentLinkId: linkId(18),
    code: "00",
    desc: "success",
  },
  signature: "0".repeat(64),
});

// Webhook TEST (orderCode 123) — ví dụ CÔNG KHAI trong tài liệu PayOS, giữ nguyên.
const TEST_PAYLOAD_123 = JSON.stringify({
  code: "00",
  desc: "success",
  data: {
    orderCode: 123,
    amount: 3000,
    description: "VQRIO123",
    accountNumber: "12345678",
    reference: "TF230204212323",
    transactionDateTime: "2023-02-04 18:25:00",
    paymentLinkId: "124c33293c43417ab7879e14c8d9eb18",
    code: "00",
    desc: "Thành công",
    counterAccountBankId: "",
    counterAccountBankName: "",
    counterAccountName: "",
    counterAccountNumber: "",
    virtualAccountName: "",
    virtualAccountNumber: "",
    currency: "VND",
  },
  signature: "06ecfbf57c3bc92b74ee810ce0744d1c89243c1e8ef51736765dfcb56b529060",
});

// --- webhook_events: TEST_WEBHOOK + ACTIVATED + nhiều BAD_JSON + INVALID_SIGNATURE
const WEBHOOK_EVENTS = [
  { id: 1, receivedAt: "2026-06-10T18:16:18.778Z", orderCode: 123, code: null, desc: null, signatureValid: 1, result: "TEST_WEBHOOK", amount: null, reference: null, rawPayload: null, callerIp: null },
  { id: 2, receivedAt: "2026-06-10T18:19:34.497Z", orderCode: 1900000000000909, code: "00", desc: "success", signatureValid: 1, result: "ACTIVATED", amount: 10000, reference: "FT00000000000009", rawPayload: null, callerIp: null },
  { id: 3, receivedAt: "2026-06-10T18:49:26.194Z", orderCode: null, code: null, desc: null, signatureValid: 0, result: "BAD_JSON", amount: null, reference: null, rawPayload: "this-is-not-json", callerIp: null },
  { id: 4, receivedAt: "2026-06-10T19:05:39.460Z", orderCode: null, code: null, desc: null, signatureValid: 0, result: "BAD_JSON", amount: null, reference: null, rawPayload: "not-json", callerIp: "1.1.1.1" },
  { id: 5, receivedAt: "2026-06-10T19:05:39.475Z", orderCode: null, code: null, desc: null, signatureValid: 0, result: "BAD_JSON", amount: null, reference: null, rawPayload: "not-json", callerIp: "8.8.4.4" },
  { id: 6, receivedAt: "2026-06-10T19:05:39.489Z", orderCode: null, code: null, desc: null, signatureValid: 0, result: "BAD_JSON", amount: null, reference: null, rawPayload: "not-json", callerIp: "::1" },
  { id: 7, receivedAt: "2026-06-10T19:32:06.017Z", orderCode: null, code: null, desc: null, signatureValid: 0, result: "BAD_JSON", amount: null, reference: null, rawPayload: "this is not json", callerIp: "::1" },
  { id: 8, receivedAt: "2026-06-10T19:32:06.037Z", orderCode: null, code: null, desc: null, signatureValid: 0, result: "BAD_JSON", amount: null, reference: null, rawPayload: "not json", callerIp: "::1" },
  { id: 9, receivedAt: "2026-06-10T19:32:06.053Z", orderCode: null, code: null, desc: null, signatureValid: 0, result: "INVALID_SIGNATURE", amount: null, reference: null, rawPayload: '{"code":"00","desc":"x","data":{"orderCode":999111},"signature":"deadbeef"}', callerIp: "::1" },
  { id: 10, receivedAt: "2026-06-10T20:07:52.675Z", orderCode: 1900000000001818, code: "00", desc: "success", signatureValid: 1, result: "ACTIVATED", amount: 10000, reference: "FT00000000000018", rawPayload: PAID_PAYLOAD_18, callerIp: "203.0.113.218" },
  { id: 11, receivedAt: "2026-06-11T02:52:24.436Z", orderCode: 123, code: null, desc: null, signatureValid: 1, result: "TEST_WEBHOOK", amount: null, reference: null, rawPayload: TEST_PAYLOAD_123, callerIp: "203.0.113.195" },
];

// ---------------------------------------------------------------------------

if (!fs.existsSync(dbPath)) {
  console.error(`❌ Không thấy ${dbPath}. Chạy "npm run db:push" trước để tạo schema.`);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// Bảng phải tồn tại (drizzle-kit push đã tạo). Nếu chưa → báo lỗi rõ ràng.
const ordersExists = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'")
  .get();
if (!ordersExists) {
  console.error('❌ Chưa có bảng "orders". Chạy "npm run db:push" trước.');
  process.exit(1);
}

const force = process.argv.includes("--force");
const existing = db.prepare("SELECT COUNT(*) AS n FROM orders").get().n;

if (existing > 0 && !force) {
  console.log(`ℹ️  DB đã có ${existing} đơn — bỏ qua seed (dùng "--force" để nạp lại từ đầu).`);
  process.exit(0);
}

const insertUser = db.prepare(
  "INSERT INTO users (id, current_plan, activated_at) VALUES (@id, @currentPlan, @activatedAt)",
);
const insertOrder = db.prepare(
  `INSERT INTO orders
     (order_code, user_id, plan_id, amount, description, checkout_url, return_url,
      expired_at, status, created_at, paid_at, reference, counter_account_name, note, creator_ip)
   VALUES
     (@orderCode, @userId, @planId, @amount, @description, @checkoutUrl, @returnUrl,
      @expiredAt, @status, @createdAt, @paidAt, @reference, @counterAccountName, @note, @creatorIp)`,
);
const insertEvent = db.prepare(
  `INSERT INTO webhook_events
     (id, received_at, order_code, code, desc, signature_valid, result, amount, reference, raw_payload, caller_ip)
   VALUES
     (@id, @receivedAt, @orderCode, @code, @desc, @signatureValid, @result, @amount, @reference, @rawPayload, @callerIp)`,
);

const seed = db.transaction(() => {
  if (force) {
    db.prepare("DELETE FROM webhook_events").run();
    db.prepare("DELETE FROM orders").run();
    db.prepare("DELETE FROM users").run();
    // reset bộ đếm AUTOINCREMENT của webhook_events về 0
    db.prepare("DELETE FROM sqlite_sequence WHERE name='webhook_events'").run();
  }
  for (const u of USERS) insertUser.run(u);
  for (const { seq, ...o } of ORDERS) insertOrder.run({ ...o, checkoutUrl: checkoutUrl(seq) });
  for (const e of WEBHOOK_EVENTS) insertEvent.run(e);
});

seed();

console.log(
  `✅ Seed xong: ${USERS.length} users, ${ORDERS.length} orders, ${WEBHOOK_EVENTS.length} webhook events.`,
);
db.close();
