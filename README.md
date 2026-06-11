# 💳 Demo Mua Gói với PayOS — Next.js (VietQR + Webhook)

Demo hoàn chỉnh tích hợp cổng thanh toán **[PayOS](https://payos.vn)** (chuyển khoản VietQR / Napas 247) vào **Next.js**:
người dùng chọn một trong 4 gói (**VIP / Pro / Max 5x / Max 20x**), quét VietQR bằng app ngân hàng,
và gói được **kích hoạt tự động ở backend qua webhook**.

Tài liệu này viết cho dev nhận bàn giao: đọc xong là hiểu **toàn bộ luồng**, chạy được demo, và biết
mở rộng thành production. Đọc theo thứ tự mục lục là dễ nhất.

**Stack:** Next.js 16 (App Router) · `@payos/node` (SDK server) · `@payos/payos-checkout` (nhúng QR)
· SQLite + Drizzle ORM · zod (validation) · dayjs (giờ Việt Nam UTC+7) · pino (logging)
· axios + TanStack Query (frontend).

---

## Mục lục

1. [Kiến trúc tổng quan](#1-kiến-trúc-tổng-quan)
2. [Luồng thanh toán chi tiết (quan trọng nhất)](#2-luồng-thanh-toán-chi-tiết-quan-trọng-nhất)
3. [Cấu trúc thư mục](#3-cấu-trúc-thư-mục)
4. [Database (SQLite + Drizzle)](#4-database-sqlite--drizzle)
5. [Chuẩn bị tài khoản PayOS](#5-chuẩn-bị-tài-khoản-payos)
6. [Cài đặt & chạy](#6-cài-đặt--chạy)
7. [Thiết lập Webhook với Cloudflare Tunnel](#7-thiết-lập-webhook-với-cloudflare-tunnel)
8. [Giải phẫu webhook handler](#8-giải-phẫu-webhook-handler)
9. [Multi-user: vì sao giao dịch không lẫn nhau](#9-multi-user-vì-sao-giao-dịch-không-lẫn-nhau)
10. [Edge cases & cách xử lý](#10-edge-cases--cách-xử-lý)
11. [Bảo mật — Q&A](#11-bảo-mật--qa)
12. [PayOS: phí, quota & chống lạm dụng tạo đơn](#12-payos-phí-quota--chống-lạm-dụng-tạo-đơn)
13. [Trang Admin](#13-trang-admin)
14. [Hạn chế & hướng mở rộng](#14-hạn-chế--hướng-mở-rộng)
15. [Troubleshooting](#15-troubleshooting)
16. [Tài liệu tham khảo (toàn bộ link hữu ích)](#16-tài-liệu-tham-khảo-toàn-bộ-link-hữu-ích)

---

## 1. Kiến trúc tổng quan

```
 ┌──────────────────┐    HTTP/JSON     ┌─────────────────────┐   HTTPS (SDK)    ┌─────────┐
 │   TRÌNH DUYỆT    │◀───────────────▶ │   NEXT.JS SERVER    │◀───────────────▶ │  PayOS  │
 │                  │                  │    (API Routes)     │                  │         │
 │  · Trang bán gói │                  │                     │     webhook      │         │
 │  · iframe PayOS  │                  │  ┌───────────────┐  │ ◀────POST────────│         │
 │    (VietQR nhúng)│                  │  │ SQLite app.db │  │  (ký HMAC-SHA256)└────┬────┘
 │  · Trang /admin  │                  │  └───────────────┘  │                       │
 └────────┬─────────┘                  └─────────────────────┘                       │
          │ quét VietQR                                                              │
          ▼                                                                          │
 ┌──────────────────┐         chuyển khoản Napas 247          ┌──────────────┐       │
 │  APP NGÂN HÀNG   │────────────────────────────────────────▶│  Ngân hàng   │──────▶┘
 └──────────────────┘                                         └──────────────┘  báo có tiền
```

### Nguyên tắc vàng (đọc kỹ trước khi sửa code)

1. **Gói CHỈ được kích hoạt ở backend, trong webhook handler, SAU KHI verify chữ ký HMAC.**
   Hàm `activateIfPending()` trong `repositories/orders.repository.ts` là nơi DUY NHẤT
   trong codebase được phép gán gói cho user (gọi từ `features/webhooks/webhooks.service.ts`
   sau khi verify). Không có đường nào khác.
2. **Client không bao giờ được gửi giá tiền.** Frontend chỉ gửi `planId`; server tra giá
   từ `lib/plans.ts`. Ai sửa JS trong DevTools để gửi `amount: 1` cũng vô nghĩa.
3. **`onSuccess` phía client chỉ là tín hiệu UI** (để đóng QR cho mượt). Nó KHÔNG phải
   bằng chứng đã thanh toán — bằng chứng là webhook đã verify chữ ký.

---

## 2. Luồng thanh toán chi tiết (quan trọng nhất)

### 2.1 Sequence diagram

```
 User           Browser (React)            Next.js server              PayOS            Ngân hàng
  │                   │                          │                       │                  │
  │ (1) bấm Mua ngay  │                          │                       │                  │
  │──────────────────▶│                          │                       │                  │
  │                   │ (2) POST /api/payments   │                       │                  │
  │                   │     body: {planId:"pro"} │                       │                  │
  │                   │─────────────────────────▶│                       │                  │
  │                   │                          │ (3) zod validate,     │                  │
  │                   │                          │     tra giá 20.000đ,  │                  │
  │                   │                          │     sinh orderCode    │                  │
  │                   │                          │ (4) paymentRequests   │                  │
  │                   │                          │     .create({...})    │                  │
  │                   │                          │──────────────────────▶│                  │
  │                   │                          │◀──────────────────────│                  │
  │                   │                          │   checkoutUrl, qrCode │                  │
  │                   │                          │ (5) INSERT đơn PENDING│                  │
  │                   │◀─────────────────────────│ {orderCode,           │                  │
  │                   │                          │  checkoutUrl,         │                  │
  │                   │                          │  expiredAt}           │                  │
  │ (6) modal mở, iframe /embedded/ hiện VietQR  │                       │                  │
  │◀──────────────────│                          │                       │                  │
  │                   │ ... poll GET /api/payments/[orderCode] mỗi 3s ...│                  │
  │                   │                          │                       │                  │
  │ (7) mở app ngân hàng, quét QR, xác nhận chuyển khoản                 │                  │
  │─────────────────────────────────────────────────────────────────────────────────────▶ │
  │                   │                          │                       │ (8) tiền về tài  │
  │                   │                          │                       │     khoản nhận   │
  │                   │                          │                       │◀─────────────────│
  │                   │                          │ (9) POST /api/webhooks/payos             │
  │                   │                          │     {code,desc,data,signature}           │
  │                   │                          │◀──────────────────────│                  │
  │                   │                          │ (10) verify HMAC      │                  │
  │                   │                          │      → activateIfPending:                │
  │                   │                          │      đơn PENDING→PAID,│                  │
  │                   │                          │      user.currentPlan=pro                │
  │                   │                          │      + ghi webhook_events                │
  │                   │                          │────── 200 OK ────────▶│                  │
  │                   │ (11) iframe postMessage  │                       │                  │
  │                   │      "PAID" → onSuccess  │                       │                  │
  │                   │      modal: "chờ webhook xác nhận…"              │                  │
  │                   │ (12) poll thấy status=PAID → toast "Đã kích hoạt"│                  │
  │◀──────────────────│      modal tự đóng, banner hiện gói mới          │                  │
```

> Lưu ý: bước (11) và bước (9)–(10) **chạy song song, không rõ cái nào tới trước** — đây là lý
> do client luôn poll server thay vì tin `onSuccess`. Xem [Edge cases](#10-edge-cases--cách-xử-lý) #8, #9.

### 2.2 Diễn giải từng bước kèm code thật

**Bước 1–2 — Bấm "Mua ngay"** (`app/components/PlansDashboard.tsx`):
frontend chỉ gửi `planId`, dùng TanStack Query mutation + axios:

```ts
const createPayment = useMutation({
  mutationFn: api.createPayment, // POST /api/payments { planId }
  onSuccess: (res, planId) => {
    setPending({ orderCode: res.orderCode, checkoutUrl: res.checkoutUrl, ... });
  },
  onError: (err) => showToast("error", extractErrorMessage(err)),
});
```

**Bước 3 — Server validate + tra giá** (`app/api/payments/route.ts`):

```ts
const parsed = CreatePaymentBody.safeParse(raw); // zod: planId ∈ {vip, pro, max5x, max20x}
if (!parsed.success) {
  return Response.json({ error: "planId không hợp lệ" }, { status: 400 });
}
const plan = getPlan(parsed.data.planId)!; // GIÁ do server quyết định, không tin client

// orderCode duy nhất toàn cục: timestamp ms (13 số) + 3 số ngẫu nhiên < MAX_SAFE_INTEGER
const orderCode = Number(`${Date.now()}${random3digits}`);
```

**Bước 4 — Gọi PayOS tạo payment link** (cùng file):

```ts
const link = await payos.paymentRequests.create({
  orderCode,
  amount: plan.price,
  description: plan.description, // memo chuyển khoản — PayOS giới hạn 9 KÝ TỰ!
  returnUrl: `${base}/`,         // bắt buộc; base = Origin của request trình duyệt
  cancelUrl: `${base}/`,         //   (PHẢI cùng origin với trang nhúng iframe — xem ghi chú dưới)
  expiredAt,                     // unix GIÂY (không phải ms!) — dayjs().add(15,"minute").unix()
});
```

> ⚠️ **Trang embedded của PayOS so khớp `redirect_uri` với `returnUrl` của payment link theo
> kiểu SO SÁNH CHUỖI CHÍNH XÁC — kể cả dấu `/` cuối** (đã kiểm chứng thực nghiệm: cùng một
> link, `redirect_uri=http://localhost:3002` → lỗi *"Thông tin truyền lên không hợp lệ"*,
> thêm đúng một dấu `/` cuối → QR hiện). Vì vậy demo này làm 2 việc:
> 1. `requestOrigin()` lấy origin từ header `Origin` của chính request trình duyệt
>    (chạy port nào/tunnel nào cũng tự khớp); `NEXT_PUBLIC_BASE_URL` chỉ là fallback.
> 2. Server **trả về + lưu vào đơn** đúng nguyên chuỗi `returnUrl` đã gửi PayOS; client đưa
>    NGUYÊN chuỗi đó vào `RETURN_URL` của lib — không bao giờ tự dựng lại từ `window.location`.

Response của PayOS chứa `checkoutUrl` (trang thanh toán), `qrCode` (chuỗi VietQR thô),
`paymentLinkId`, `accountNumber`… Demo này dùng `checkoutUrl` cho iframe nhúng.

**Bước 5 — Lưu đơn PENDING** gắn với `userId` (cookie) — webhook sau này chỉ biết
`orderCode`, phải nhờ bản ghi này mới biết kích hoạt gói nào cho ai:

```ts
addOrder({
  orderCode, userId, planId: plan.id, amount: plan.price,
  description: plan.description, checkoutUrl: link.checkoutUrl,
  expiredAt, status: "PENDING", createdAt: nowIso(),
});
```

**Bước 6 — Mở iframe VietQR** (`app/components/CheckoutModal.tsx`) bằng thư viện
chính chủ `@payos/payos-checkout` (⚠️ KHÔNG phải package cũ `payos-checkout` đã deprecated):

```tsx
const config: PayOSConfig = {
  RETURN_URL: returnUrl, // NGUYÊN chuỗi server đã gửi PayOS lúc tạo link (so khớp chính xác!)
  ELEMENT_ID: "payos-embedded-container",
  CHECKOUT_URL: checkoutUrl,
  embedded: true,                          // cờ config — open() KHÔNG có tham số
  onSuccess: () => setPhase("confirming"), // chỉ là tín hiệu UI!
  onCancel:  () => { api.cancelOrder(orderCode); onClose(); },
  onExit:    () => onClose(),
};
const { open, exit } = usePayOS(config);

// exit() của lib console.error nếu container/iframe không còn trong DOM
// → chỉ gọi khi iframe thật sự đang gắn (xem safeExit trong CheckoutModal.tsx)
function safeExit() {
  if (document.getElementById(CONTAINER_ID)?.querySelector("iframe")) exit();
}

useEffect(() => {
  open();                  // chèn iframe vào #payos-embedded-container
  return () => safeExit(); // dọn iframe — đồng thời chống StrictMode mount 2 lần
}, [checkoutUrl]);
```

```tsx
{/* Container BẮT BUỘC có height cố định — iframe của lib là height:100% */}
<div id="payos-embedded-container" className="h-[480px] w-full" />
```

**Bước 7–8 — User quét QR, ngân hàng chuyển tiền.** Không có code — đời thật. 💸

**Bước 9–10 — PayOS bắn webhook, server kích hoạt** — xem [mục 8](#8-giải-phẫu-webhook-handler).

**Bước 11–12 — Client biết kết quả** (`CheckoutModal.tsx`): một query poll duy nhất
cover cả hai chiều race (webhook trước hay postMessage trước đều đúng):

```tsx
const orderQuery = useQuery({
  queryKey: ["order", orderCode],
  queryFn: () => api.getOrder(orderCode), // đọc DB của TA — không hỏi thẳng PayOS
  refetchInterval: phase === "confirming" ? 1_500 : 3_000,
  enabled: phase === "qr" || phase === "confirming",
});

useEffect(() => {
  if (orderStatus === "PAID") { setPhase("paid"); onPaid(); }      // webhook đã xử lý xong
  if (orderStatus === "EXPIRED" && phase === "qr") setPhase("expired");
}, [orderStatus]);
```

### 2.3 Payload webhook mẫu (PayOS gửi đến server)

```json
{
  "code": "00",
  "desc": "success",
  "success": true,
  "data": {
    "orderCode": 1765430000123,
    "amount": 20000,
    "description": "GOI PRO",
    "accountNumber": "0358815514",
    "reference": "FT25162123456789",
    "transactionDateTime": "2026-06-11 10:25:00",
    "currency": "VND",
    "paymentLinkId": "ab12cd34ef56gh78ij90",
    "code": "00",
    "desc": "Thành công",
    "counterAccountBankId": "970422",
    "counterAccountBankName": "MB Bank",
    "counterAccountName": "NGUYEN VAN A",
    "counterAccountNumber": "0123456789",
    "virtualAccountName": "PHAM NGOC DIEP",
    "virtualAccountNumber": "CASS0358815514"
  },
  "signature": "8d8640d802576397a1ce45ebda7f835055768ac7ad2e0bfb77f9b8f12cca4c7f"
}
```

| Field | Ý nghĩa |
|---|---|
| `code` / `desc` (ngoài cùng) | Mã kết quả của *thông báo* ("00" = giao dịch thành công) |
| `data.orderCode` | **Khóa đối soát** — trùng orderCode ta gửi khi tạo link |
| `data.amount` | Số tiền THẬT đã nhận — ta đối chiếu với giá gói trước khi kích hoạt |
| `data.description` | Memo chuyển khoản (chính là `plan.description`) |
| `data.reference` | Mã tham chiếu giao dịch phía ngân hàng — lưu lại để đối soát sao kê |
| `data.transactionDateTime` | Thời điểm ngân hàng ghi nhận |
| `data.counterAccount*` | Thông tin người chuyển khoản |
| `data.virtualAccount*` | Tài khoản ảo nhận tiền (PayOS sinh riêng cho mỗi payment link) |
| `signature` | **HMAC-SHA256 của object `data`** ký bằng Checksum Key — lớp bảo vệ chính |

---

## 3. Cấu trúc thư mục

Toàn bộ mã nguồn nằm trong `src/` (alias `@/*` → `./src/*`). Kiến trúc **feature-based** +
phân tầng **controller → service → repository**:

- **Controller** (`features/*/*.controller.ts`): CHỈ lo HTTP — đọc body/param, validate
  (zod), gọi service, map kết quả ra `Response`. Không chứa nghiệp vụ.
- **Service** (`features/*/*.service.ts`): toàn bộ nghiệp vụ. Gọi repository + hạ tầng
  (payos, plans, datetime…). KHÔNG bao giờ chạm thẳng `db`/Drizzle.
- **Repository** (`repositories/*.repository.ts`): NƠI DUY NHẤT chạm Drizzle/`db`,
  mỗi file một bảng. Chỉ truy cập dữ liệu thuần.
- **Domain** (`domain/orders.domain.ts`): quy tắc đơn hàng dùng CHUNG nhiều feature
  (lazy-expiry, kiểm tra sở hữu) — tầng trung lập, không feature nào import lẫn nhau.
- `app/api/**/route.ts`: **delegator mỏng** — chỉ `export { GET, POST… } from` controller
  tương ứng (Next.js bắt buộc route handler phải nằm ở đây).

Chiều phụ thuộc (không vòng): `controller → service → domain → repository → lib/db`.

```
src/
  app/                          ROUTING — route.ts chỉ là delegator mỏng
    api/{payments,webhooks,account,admin,webhook-events}/route.ts
    components/  admin/  page.tsx  layout.tsx  globals.css
  proxy.ts                      Next 16 middleware (PHẢI nằm trong src/)
  features/
    payments/    .controller  .service  .schema  .helpers
    webhooks/    .controller  .service  .schema
    account/     .controller  .service
    admin/       admin-orders | webhook-events | ip-lookup  (.controller + .service)
  repositories/  orders | users | webhook-events  (.repository.ts)
  domain/        orders.domain.ts
  lib/           plans payos db/ datetime logger user ip ip-types api  (hạ tầng dùng chung)
```

| File | Vai trò — đọc file này khi muốn… |
|---|---|
| `lib/plans.ts` | …đổi giá/tên/quyền lợi gói. Nguồn sự thật về GIÁ (server quyết định) |
| `lib/payos.ts` | …hiểu cách khởi tạo SDK PayOS (singleton, đọc key từ `.env.local`) |
| `lib/db/schema.ts` | …xem cấu trúc 3 bảng `users` / `orders` / `webhook_events` |
| `repositories/orders.repository.ts` | …hiểu truy cập DB đơn hàng. **`activateIfPending()` = nơi duy nhất kích hoạt gói** (transaction nguyên tử) |
| `repositories/{users,webhook-events}.repository.ts` | …truy cập bảng `users` / `webhook_events` |
| `domain/orders.domain.ts` | …xem lazy-expiry + check sở hữu dùng chung nhiều feature |
| `features/payments/payments.service.ts` | …hiểu tạo payment link, poll trạng thái, hủy đơn |
| `features/webhooks/webhooks.service.ts` | …**hiểu webhook — nghiệp vụ quan trọng nhất repo** |
| `features/account/account.service.ts` | …gói hiện tại + lịch sử đơn của user |
| `features/admin/*.service.ts` | …số liệu Admin: đơn (`admin-orders`), nhật ký webhook (`webhook-events`), tra cứu IP (`ip-lookup`) |
| `features/*/*.schema.ts` | …xem zod validate input gì (co-located theo feature) |
| `features/*/*.controller.ts` | …xem lớp HTTP mỏng: validate input + map sang `Response` |
| `lib/datetime.ts` | …hiểu quy ước thời gian: lưu UTC, hiển thị UTC+7 (dayjs) |
| `lib/logger.ts` | …cấu hình pino |
| `lib/user.ts` + `proxy.ts` | …hiểu danh tính user ẩn danh (cookie `uid`; Next 16 đổi tên middleware thành proxy) |
| `lib/ip.ts` + `lib/ip-types.ts` | …trích IP client từ headers + kiểu kết quả tra cứu địa lý |
| `lib/api.ts` | …xem frontend gọi API thế nào (axios instance + hàm typed) |
| `app/api/**/route.ts` | …delegator mỏng; nghiệp vụ thật nằm ở `features/*/*.controller.ts` |
| `app/components/CheckoutModal.tsx` | …hiểu lifecycle iframe PayOS + máy trạng thái 5 phase |
| `app/components/PlansDashboard.tsx` | …hiểu luồng UI tổng (TanStack Query) |
| `app/admin/page.tsx` | …trang Admin theo dõi đơn + webhook |
| `scripts/register-webhook.mjs` | …đăng ký webhook bằng API thay vì dashboard |
| `drizzle.config.ts` | …cấu hình drizzle-kit (schema → SQLite) |
| `.env.example` | …biết cần biến môi trường gì |

---

## 4. Database (SQLite + Drizzle)

```
 ┌────────────────────┐        ┌─────────────────────────┐       ┌──────────────────────┐
 │       users        │        │         orders          │       │    webhook_events    │
 ├────────────────────┤        ├─────────────────────────┤       ├──────────────────────┤
 │ id (cookie uid) PK │◀──┐    │ order_code PK           │       │ id PK autoincrement  │
 │ current_plan       │   └────│ user_id                 │       │ received_at          │
 │ activated_at       │        │ plan_id, amount         │   ┌───│ order_code (nullable)│
 └────────────────────┘        │ description             │   │   │ signature_valid      │
                               │ checkout_url, expired_at│◀──┘   │ result               │
                               │ status: PENDING|PAID|   │       │ amount, reference    │
                               │   CANCELLED|EXPIRED     │       │ code, desc           │
                               │ created_at, paid_at     │       └──────────────────────┘
                               │ reference, note         │        (ghi MỌI delivery,
                               │ counter_account_name    │         kể cả sai chữ ký)
                               └─────────────────────────┘
```

- File DB: `data/app.db` — **đã gitignore**, không bao giờ commit dữ liệu.
- Schema sync bằng `drizzle-kit push`, **tự chạy** trước `npm run dev` / `npm run build`
  (script `predev`/`prebuild`) — clone repo về là chạy được, không cần nhớ lệnh migrate.
- **Seed dữ liệu demo:** vì `data/` không commit, clone về DB sẽ rỗng. `predev` còn chạy
  `npm run db:seed` để nạp sẵn dữ liệu mẫu (6 users, 19 đơn, 11 webhook) → mở app là có nội
  dung ngay. Seed **chỉ chạy khi bảng `orders` trống** nên không bao giờ đè dữ liệu thật.
  Nạp tay: `npm run db:seed`; nạp lại từ đầu (xóa sạch rồi seed): `npm run db:seed -- --force`.
  Dữ liệu mẫu **đã làm sạch** thông tin nhạy cảm (tên/số TK/reference/IP/signature đều là giá
  trị giả) — xem chi tiết trong `scripts/seed.mjs`.
- Quy ước thời gian: cột `*_at` lưu **ISO UTC**; `expired_at` lưu **unix giây** (khớp PayOS).
  Khi hiển thị mới đổi sang giờ Việt Nam qua `formatDateTime()` (dayjs + `Asia/Ho_Chi_Minh`).
- Muốn đổi sang Postgres/MySQL: chỉ cần sửa `lib/db/index.ts` (driver) + `drizzle.config.ts`,
  toàn bộ queries giữ nguyên (Drizzle ORM).

---

## 5. Chuẩn bị tài khoản PayOS

1. Đăng ký tài khoản tại <https://my.payos.vn>, tạo **kênh thanh toán** và liên kết tài khoản
   ngân hàng nhận tiền.
2. Vào kênh → **Thông tin kênh** lấy 3 khóa: **Client ID**, **API Key**, **Checksum Key**.
   Dùng nút copy 📋 trên dashboard — **đừng gõ tay/chép từ ảnh chụp màn hình, Checksum Key dài
   64 ký tự rất dễ bị thiếu** (thiếu là lỗi chữ ký, xem [Troubleshooting](#15-troubleshooting)).
3. ⚠️ **PayOS KHÔNG có môi trường sandbox.** Mọi QR quét ra là **tiền thật** chuyển vào tài
   khoản nhận của kênh. Vì vậy demo để giá gói rẻ nhất 10.000đ — test bằng gói VIP.

---

## 6. Cài đặt & chạy

Yêu cầu: **Node.js ≥ 20** (SDK `@payos/node` v2 yêu cầu). Repo có sẵn `.nvmrc` ghim
**Node 24.15.0** — dùng `nvm use` để khớp phiên bản đã kiểm thử.

```bash
# 0. (tùy chọn) khớp Node version theo .nvmrc
nvm use

# 1. Cài dependencies
npm install

# 2. Tạo file env và điền 3 khóa PayOS (mục 5)
cp .env.example .env.local
#    → mở .env.local điền PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY

# 3. Chạy (schema DB tự sync nhờ predev)
npm run dev
#    → http://localhost:3000        (trang mua gói)
#    → http://localhost:3000/admin  (trang admin theo dõi)

# Muốn log pino dễ đọc (tùy chọn):
npm run dev | npx pino-pretty
```

Đến đây bấm "Mua ngay" đã **hiện được QR** (tạo payment link là server gọi thẳng API PayOS,
không cần tunnel). Nhưng thanh toán xong **gói sẽ KHÔNG kích hoạt** — vì PayOS chưa biết đường
gọi webhook vào máy bạn. Làm tiếp mục 7.

---

## 7. Thiết lập Webhook với Cloudflare Tunnel

### Vì sao cần tunnel?

Webhook = PayOS **chủ động gọi HTTP POST đến server của bạn**. `localhost:3000` chỉ tồn tại
trong máy bạn — PayOS (trên internet) không gọi vào được. Tunnel mở một URL công khai
`https://...` trỏ về localhost.

### Các bước (làm đúng THỨ TỰ)

```bash
# Terminal A — app phải chạy TRƯỚC
npm run dev

# Terminal B — mở tunnel (cài cloudflared theo docs Cloudflare)
cloudflared tunnel --url http://localhost:3000
# → in ra URL dạng: https://abc-xyz-123.trycloudflare.com
```

1. Tự kiểm tra: mở `https://abc-xyz-123.trycloudflare.com/api/webhooks/payos` trên trình duyệt
   → thấy `{"ok":true,...}` là tunnel thông.
2. Vào <https://my.payos.vn> → kênh thanh toán → **Thiết lập nâng cao** → ô **Webhook Url**, dán:

   ```
   https://abc-xyz-123.trycloudflare.com/api/webhooks/payos
   ```

3. Bấm **Lưu**. Ngay lúc này **PayOS gửi một request kiểm tra** đến URL đó — app + tunnel phải
   đang chạy và trả 2XX thì mới lưu thành công (handler của ta đã xử lý sẵn request test này —
   xem mục 8). Mở trang `/admin` sẽ thấy event `TEST_WEBHOOK` xuất hiện trong webhook log. ✅

> **Lưu ý quick tunnel:** URL `trycloudflare.com` **đổi mỗi lần chạy lại cloudflared** → mỗi lần
> demo phải cập nhật lại ô Webhook Url. Muốn URL cố định: dùng Cloudflare **named tunnel**
> (cần domain riêng) hoặc deploy hẳn lên server.

### Cách B — đăng ký bằng API thay vì dashboard

```bash
npm run register-webhook -- https://abc-xyz-123.trycloudflare.com/api/webhooks/payos
```

Script `scripts/register-webhook.mjs` gọi `payos.webhooks.confirm(url)` — tác dụng y hệt dán
vào dashboard. Phụ lục: dùng [ngrok](https://ngrok.com/docs) thay cloudflared cũng được
(`ngrok http 3000`).

---

## 8. Giải phẫu webhook handler

Nghiệp vụ: `features/webhooks/webhooks.service.ts` — **phần quan trọng nhất repo** (route
`app/api/webhooks/payos/route.ts` chỉ là delegator; controller đọc raw body + IP rồi gọi
service). Method: **HTTP POST** (hàm GET chỉ là probe tự kiểm tra tunnel, PayOS không gọi GET).

### Thứ tự xử lý

```
POST /api/webhooks/payos
  │
  ├─ (0) Body không phải JSON / sai shape (zod)  → ghi event BAD_JSON           → 200
  ├─ (1) payos.webhooks.verify(body)  ── throw ─▶  ghi event INVALID_SIGNATURE  → 200
  │       (HMAC-SHA256 trên object `data`, ký bằng Checksum Key)
  ├─ (2) orderCode=123 / desc="Ma giao dich thu nghiem"/"VQRIO123"
  │       → request KIỂM TRA của PayOS khi lưu Webhook Url → event TEST_WEBHOOK → 200
  ├─ (3) data.code !== "00" → giao dịch thất bại → event TX_FAILED              → 200
  └─ (4) activateIfPending(orderCode, {amount, reference, ...})
          ├─ ACTIVATED          → đơn PENDING→PAID + user.current_plan = gói của đơn
          ├─ ALREADY_PAID       → webhook trùng/retry → không làm gì (idempotent)
          ├─ UNKNOWN_ORDER      → không có đơn (DB bị xóa? webhook của env khác?)
          ├─ AMOUNT_MISMATCH    → tiền nhận ≠ giá gói → KHÔNG kích hoạt, ghi note
          └─ PAID_AFTER_CANCEL  → tiền về sau khi hủy → KHÔNG kích hoạt, cần hoàn tiền
                                                          ↓ tất cả các nhánh
                                              ghi webhook_events + pino log → 200
```

### Vì sao verify được chữ ký mà KHÔNG cần raw body?

Khác Stripe (ký trên raw body), PayOS ký **trên object `data`**: sort key theo alphabet, nối
thành chuỗi `key1=value1&key2=value2`, rồi HMAC-SHA256 bằng Checksum Key. Vì vậy
`await request.json()` xong đưa thẳng vào `payos.webhooks.verify()` là đủ — **đừng** bê code
giữ raw body từ các guide Stripe sang.

```ts
const data = await payos.webhooks.verify(body); // throw nếu chữ ký sai
```

### Vì sao luôn trả HTTP 200 (kể cả khi từ chối xử lý)?

- PayOS chỉ cần biết "endpoint còn sống và đã nhận được". Việc **từ chối ở tầng nghiệp vụ**
  (không kích hoạt) đã đủ an toàn — trả 4xx/5xx chỉ khiến PayOS retry/đánh dấu webhook lỗi.
- Lúc bấm Lưu Webhook Url, PayOS cần response 2XX thì mới cho lưu.

### Idempotency — vì sao webhook gửi trùng vẫn an toàn?

`activateIfPending()` chạy trong **transaction** (`repositories/orders.repository.ts`): chỉ đơn ở trạng thái
PENDING mới chuyển được sang PAID, và chuyển đúng một lần. Webhook đến lần 2/3/replay → đơn đã
PAID → trả `ALREADY_PAID`, không cộng gì thêm. Giả định chuẩn của mọi hệ thống webhook:
**at-least-once delivery** — server phải tự lo chuyện trùng lặp.

### Best practice logging (áp dụng trong repo này)

- **Log MỌI delivery** bằng pino (structured JSON): orderCode, amount, kết quả xử lý.
- **Ghi MỌI delivery vào bảng `webhook_events`** — kể cả sai chữ ký/test/trùng. Tác dụng:
  - Audit: "ngày X có nhận webhook cho đơn Y không?"
  - Đối soát với sao kê ngân hàng qua `reference`.
  - Debug "tiền về mà gói không lên" — nhìn `/admin` thấy ngay delivery bị gì.
  - Production: nền tảng cho alerting (INVALID_SIGNATURE tăng bất thường = có kẻ dò webhook).
- Trả 2XX **nhanh**, xử lý nhẹ trong handler. Nếu sau này xử lý nặng (gửi email, gọi service
  khác) → đẩy vào queue, đừng làm trong request webhook.

---

## 9. Multi-user: vì sao giao dịch không lẫn nhau

Câu hỏi kinh điển: *"Nhiều user cùng mua một gói cùng lúc, tiền người này có kích hoạt nhầm
gói cho người kia không?"* — **Không**, vì:

```
 User A ─ bấm mua Pro ─▶ orderCode 1765430000111 ─▶ payment link A ─▶ QR A (số TK ảo riêng)
 User B ─ bấm mua Pro ─▶ orderCode 1765430000222 ─▶ payment link B ─▶ QR B (số TK ảo riêng)
                                                                        │
 A quét QR A, chuyển 20k ──▶ ngân hàng ──▶ PayOS khớp với payment link A ──▶ webhook {orderCode: …111}
                                                                        │
 Server: orderCode …111 → đơn của A (user_id lưu lúc tạo) → kích hoạt Pro cho ĐÚNG A
```

1. **Mỗi lần bấm mua = một payment link riêng với orderCode duy nhất toàn cục**
   (timestamp ms + 3 số ngẫu nhiên). Hai user cùng mua "Pro" vẫn là 2 QR khác nhau —
   nội dung QR trỏ về chính payment link đó (PayOS sinh số tài khoản ảo riêng cho từng link).
2. **PayOS khớp giao dịch bằng payment link/QR, KHÔNG khớp bằng memo** — nên
   `description: "GOI PRO"` trùng nhau giữa các user là vô hại.
3. **Webhook chỉ chứa orderCode** → server tra bảng `orders` lấy `user_id` đã lưu lúc tạo đơn
   → `activateIfPending` gán gói cho đúng user đó.
4. **Danh tính user** = cookie `uid` (httpOnly, do `proxy.ts` phát cho mọi trình duyệt —
   demo không cần đăng nhập). Mọi API account/orders chỉ trả dữ liệu của user gọi;
   poll/hủy đơn của người khác bị chặn bằng check sở hữu (trả 404).

> Test nhanh: mở thêm cửa sổ ẩn danh (cookie khác = user khác) — hai bên có gói/lịch sử
> độc lập hoàn toàn; trang `/admin` thì thấy đơn của cả hai.

---

## 10. Edge cases & cách xử lý

Demo xử lý **18 tình huống ngoài happy path**. Cột "Nơi xử lý" trỏ đúng file để đọc code.

| # | Tình huống (vì sao xảy ra thật) | Hành vi của hệ thống | Nơi xử lý |
|---|---|---|---|
| 1 | **QR hết hạn** — user mở QR rồi để đó quá 15 phút | Countdown trong modal → phase `expired` + nút "Tạo QR mới" (orderCode mới); server lazy chuyển PENDING→EXPIRED khi đơn được đọc | `CheckoutModal.tsx`, `getOrder()` |
| 2 | **Webhook gửi trùng/retry** — chuẩn at-least-once | Transaction chỉ cho PENDING→PAID một lần; lần sau trả `ALREADY_PAID` (no-op) | `activateIfPending()` |
| 3 | **Sai chữ ký** — kẻ giả mạo hoặc cấu hình sai key | `verify()` throw → ghi event `INVALID_SIGNATURE`, KHÔNG đụng trạng thái nào, vẫn trả 200 | webhook route |
| 4 | **Webhook cho đơn không tồn tại** — DB bị xóa/reset, hoặc webhook của môi trường khác trỏ chung kênh | `UNKNOWN_ORDER` → log cảnh báo kèm gợi ý đối soát bằng `payos.paymentRequests.get(orderCode)` | webhook route |
| 5 | **Sai số tiền** — user không quét QR mà chuyển tay vào số tài khoản ảo với số tiền khác | `AMOUNT_MISMATCH` → KHÔNG kích hoạt, ghi `note` vào đơn (cảnh báo vàng ở admin + lịch sử) | `activateIfPending()` |
| 6 | **Trả tiền sau khi đã hủy đơn** — race: bấm hủy đúng lúc tiền đang chuyển | `PAID_AFTER_CANCEL` → KHÔNG kích hoạt, note "cần hoàn tiền thủ công" | `activateIfPending()` |
| 7 | **Giao dịch thất bại phía PayOS** (`data.code !== "00"`) | Ghi event `TX_FAILED`, không kích hoạt | webhook route |
| 8 | **Webhook không tới** — tunnel chết / quên đăng ký URL, user ĐÃ trả tiền | Modal sang phase `timeout` sau 30s: giải thích nguyên nhân + nút "Kiểm tra lại"; đơn vẫn PENDING — webhook tới muộn vẫn kích hoạt bình thường | `CheckoutModal.tsx` |
| 9 | **User đóng modal rồi mới thanh toán** — đã chụp màn hình QR | Đóng modal thủ công KHÔNG hủy đơn; webhook về vẫn kích hoạt; UI tự cập nhật khi focus lại tab (refetchOnWindowFocus); đơn PENDING có nút "Tiếp tục thanh toán" | `PlansDashboard.tsx`, `OrderHistory.tsx` |
| 10 | **Double-click "Mua ngay"** → 2 đơn trùng | Mọi nút Mua bị disable khi đang tạo link hoặc modal đang mở | `PlanCard.tsx` |
| 11 | **Tạo link thất bại** — key sai, PayOS lỗi, mất mạng | 400 (zod) / 502 kèm message PayOS; toast đỏ, nút phục hồi để thử lại | payments route + UI |
| 12 | **Request kiểm tra của PayOS** khi bấm Lưu Webhook Url | Nhận diện orderCode 123 / desc "Ma giao dich thu nghiem"/"VQRIO123" → trả 200 ngay (không tra đơn) | webhook route |
| 13 | **Body webhook không phải JSON / sai shape** | Ghi event `BAD_JSON`, trả 200, không crash | webhook route |
| 14 | **Race hủy đơn ↔ webhook về cùng lúc** | Transaction + guard theo status: thao tác trước thắng, thao tác sau thành no-op/ghi note — không có trạng thái "rách" | `repositories/orders.repository.ts` |
| 15 | **Nhiều user mua cùng lúc** | orderCode duy nhất toàn cục + mỗi đơn một QR riêng + webhook map orderCode→userId (mục 9) | payments route, `activateIfPending()` |
| 16 | **Kẻ xấu biết webhook URL, POST payload giả** | Không có Checksum Key → không ký được → rơi vào case #3 | webhook route |
| 17 | **Kẻ xấu replay payload thật** bắt được từ log/network | Idempotent (case #2) → no-op | `activateIfPending()` |
| 18 | **User A poll/hủy đơn của user B** (đoán orderCode) | Check sở hữu `order.userId !== uid` → 404 đồng nhất | `[orderCode]/route.ts` |

---

## 11. Bảo mật — Q&A

### "Webhook URL bị lộ thì sao? Ai cũng POST vào được mà?"

**Không sao — URL không phải là bí mật.** Bí mật là **Checksum Key**. Ba lớp bảo vệ:

1. **Chữ ký HMAC-SHA256** (lớp chính): mọi payload PayOS gửi đều ký bằng Checksum Key
   (chỉ PayOS và server mình có, nằm trong `.env.local`). Kẻ biết URL nhưng không có key
   → không tạo nổi `signature` hợp lệ → `payos.webhooks.verify()` throw → request bị ghi
   nhận `INVALID_SIGNATURE` và bỏ qua. Sửa 1 ký tự trong `data` (vd đổi amount) cũng làm
   chữ ký sai → chống cả **giả mạo** lẫn **sửa đổi**.
2. **Idempotency**: replay nguyên văn một payload thật cũng vô hại — đơn đã PAID là no-op.
3. **Đối chiếu nghiệp vụ**: qua được 2 lớp trên vẫn phải đúng đơn PENDING + đúng số tiền
   mới kích hoạt.

### "Có nên whitelist IP cho webhook endpoint không?"

**Không.** PayOS **không công bố danh sách IP tĩnh** cho webhook (đã kiểm tra docs chính thức)
→ whitelist IP sẽ **vỡ âm thầm** khi PayOS đổi hạ tầng, và cũng không cần thiết vì chữ ký HMAC
đã là lớp xác thực mật mã mạnh hơn IP. Docs PayOS chỉ lưu ý chiều ngược lại: nếu site đứng sau
Cloudflare/dịch vụ chống DDoS, **đừng chặn nhầm** request webhook của PayOS. Production muốn
thêm lớp: rate-limit endpoint + alert khi `INVALID_SIGNATURE` tăng bất thường — không dùng IP.

### "Method của webhook là gì?"

**POST**, body JSON, server phải trả 2XX. (Route có thêm GET trả `{ok:true}` — chỉ để dev tự
mở trình duyệt kiểm tra tunnel, PayOS không gọi GET.)

### Checklist bảo mật của demo này

- ✅ `.env.local` nằm trong `.gitignore` (template ignore `.env*`, ta thêm `!.env.example`
  để file mẫu vẫn được commit). Kiểm tra: `git check-ignore .env.local` phải in ra path.
- ✅ 3 khóa PayOS **không có prefix `NEXT_PUBLIC_`** → Next.js không bao giờ đưa vào bundle
  client. SDK PayOS chỉ được import trong code server.
- ✅ Mọi input validate bằng zod; giá tiền do server quyết.
- ✅ Kích hoạt theo `planId` + `amount` **đã lưu trong đơn**, đối chiếu với số tiền webhook.
- ⚠️ Trang `/admin` và các API admin **không có auth — chủ đích để demo cho dễ**. Production
  bắt buộc chặn (auth admin, basic auth, IP nội bộ…).
- ⚠️ Nếu nghi ngờ key bị lộ (đã gửi qua chat/chụp màn hình): tạo lại key trên my.payos.vn.

---

## 12. PayOS: phí, quota & chống lạm dụng tạo đơn

> **TL;DR cho dev mới:** PayOS **không miễn phí hoàn toàn** — họ bán "gói thu hộ" theo số
> giao dịch. NHƯNG **chỉ đơn ĐÃ THANH TOÁN thành công mới trừ quota**; đơn PENDING/EXPIRED/
> CANCELLED không tính. Vì vậy spam tạo đơn **không đốt được quota** của bạn — rủi ro thật chỉ
> là **dính rate-limit 429 của PayOS + phình DB**. Đó là lý do repo có rate-limit theo IP +
> tái dùng đơn + lazy-sweep (mục 12.4).

### 12.1 Mô hình tính phí (PayOS thu tiền thế nào)

PayOS kiếm tiền bằng **gói thu hộ** tính theo *số giao dịch thành công*, KHÔNG phải dịch vụ free vô điều kiện.

**Gói miễn phí (tier free)** — đủ cho demo này:

| Gói | Số giao dịch | Điều kiện |
|---|---|---|
| FREE-100 | 100 | mọi ngân hàng, **nhận 1 lần** |
| PIONEER-500 | 500 | mọi ngân hàng, **nhận 1 lần** |
| OCB-1000 / KLB-1000 | 1.000 | **lặp lại miễn phí**, nhưng **chỉ khi tài khoản nhận thuộc bank cụ thể** (OCB / Kiên Long) |

**Gói trả phí** — khi vượt tier free / không dùng bank ưu đãi. Hai kiểu **loại trừ nhau, KHÔNG cộng dồn**:

- **Gói cố định**: bó 1.000 / 5.000 / 20.000 / 100.000 giao dịch, **phí phẳng, không phụ thuộc giá trị đơn** → hợp đơn giá trị cao.
- **Gói Flex**: phí = **% giá trị giao dịch** → hợp đơn giá trị thấp.

> ⚠️ KHÔNG có chuyện "vừa mua gói vừa bị trừ % mỗi giao dịch" — **gói chính là cách tính phí**, chọn 1 trong 2 kiểu.
>
> 💲 **Số tiền VND cụ thể không công khai** (PayOS giấu giá) → xem nút **"Mua gói"** trong dashboard <https://my.payos.vn> hoặc liên hệ sales.

### 12.2 Quota tính theo đơn ĐÃ THANH TOÁN (đã xác nhận với support)

Cảnh báo email ở **80%** và **95%**; **hết 100%** gói → PayOS **khoá tính năng tạo đơn** cho tới khi có gói mới.

Quan trọng: **chỉ đơn `PAID` + xác nhận thành công mới trừ vào gói.** Đơn `PENDING` chưa trả tiền, đơn `EXPIRED`, đơn `CANCELLED` → **không tính**. (Xác nhận trực tiếp với support PayOS; dashboard FREE-100 hiển thị 2/100 dù đã tạo nhiều đơn test chưa thanh toán.)

→ Hệ quả bảo mật: **spam tạo đơn PENDING KHÔNG đốt được quota, không khoá được khách thật mua hàng.** Đây không phải lỗ hổng kiểu "wallet-DoS".

### 12.3 Rate-limit của PayOS (mã 429)

Endpoint tạo link có rate-limit, trả **HTTP 429 ("Too Many Request — Gọi API quá nhiều")** — nhưng **PayOS không công bố con số** (bao nhiêu req/giây). Gọi `paymentRequests.create` quá nhanh (vd bị spam) có thể dính 429; lúc đó **khách thật cũng tạo đơn lỗi**.

### 12.4 Các lớp chống lạm dụng trong repo này

| Lớp | File | Chống cái gì |
|---|---|---|
| **Rate-limit theo IP** (5 đơn / 60s / IP) | `lib/rate-limit.ts` + `payments.controller.ts` | Giữ tần suất `create` dưới ngưỡng 429 của PayOS. Khoá theo `cf-connecting-ip` chứ KHÔNG theo `uid` (uid do `proxy.ts` tự phát cho mọi visitor → giả mạo/xoay vòng được). IP loopback/private (vd `::1`, `127.0.0.1` — localhost dev) thì bỏ qua để không chặn dev. |
| **Tái dùng đơn PENDING** cùng user+plan | `payments.service.ts` (`findReusablePending`) | Double-click / thử lại cùng plan → trả lại link cũ, **0 lần gọi `create` mới**. Link PayOS bất biến (SDK không có API update) nên cùng plan ⇒ link cũ vẫn đúng. |
| **Lazy-sweep PENDING quá hạn** | `orders.repository.ts` (`expireAllStale`), gọi ở admin/account service | Dọn đơn PENDING quá `expiredAt` → EXPIRED, kể cả đơn "rác" không ai poll, nên DB không phình vô hạn. Không cần cron. |

Khi dính rate-limit, server trả **HTTP 429** kèm header `Retry-After` — cả với giới hạn của ta (`payments.controller.ts`) lẫn khi PayOS ném `TooManyRequestError` (`payments.service.ts` map sang `PaymentRateLimitError`). **Không auto-retry** (retry khi đang bị limit chỉ làm tệ hơn). Đơn **chưa được `insert`** khi PayOS 429 (insert nằm sau lời gọi PayOS) → không để lại đơn PENDING mồ côi.

Phía frontend (`PlansDashboard.tsx`): 429 vào `onError` của mutation → hiện toast + **đọc `Retry-After` để khoá nút Mua kèm đếm ngược "Thử lại sau m:ss"**, tự bật lại khi hết giờ. Modal KHÔNG mở (chỉ mở ở `onSuccess`) nên không có QR rỗng/iframe vỡ — UX mượt, user không bấm lại để dính 429 lần nữa.

> **Rác link trên PayOS thì sao?** Mỗi `create` tạo một link thật trên tài khoản PayOS, nhưng link **tự hết hạn sau 15 phút** (theo `expiredAt`) và **tốn 0đ + 0 quota** (chưa thanh toán) → thuần thẩm mỹ trong dashboard. **Không chủ động huỷ** (huỷ = thêm lời gọi API = thêm rủi ro 429, đổi lấy lợi ích = 0).

---

## 13. Trang Admin

Mở <http://localhost:3000/admin> (có link "Trang Admin →" ngay trên trang chính):

- **📦 Đơn hàng (mọi user)** — ai (userId rút gọn, hover xem full) mua **gói nào**, **lúc mấy
  giờ** (tạo / thanh toán, giờ VN), bao nhiêu tiền, trạng thái, người chuyển khoản, mã tham
  chiếu ngân hàng, cảnh báo bất thường (`note`). Kèm tổng doanh thu PAID + đếm đơn theo trạng
  thái. Tự refresh 5s.
- **📡 Webhook log** — mỗi dòng một delivery: thời gian nhận, orderCode, chữ ký hợp lệ hay
  không, kết quả xử lý (`ACTIVATED` / `ALREADY_PAID` / `INVALID_SIGNATURE` / `TEST_WEBHOOK`…),
  số tiền, reference. Tự refresh 3s — **khi demo, mở trang này cạnh trang mua gói để cả team
  nhìn thấy webhook chạy realtime**.

---

## 14. Hạn chế & hướng mở rộng

| Hiện tại (demo) | Hướng production |
|---|---|
| Cookie `uid` ẩn danh, không đăng nhập | Auth thật (NextAuth/Clerk…), map `orders.user_id` sang user thật |
| SQLite file local | Postgres/MySQL/Turso — chỉ cần sửa `lib/db/index.ts` + `drizzle.config.ts`. **Lưu ý:** deploy serverless (Vercel) filesystem không bền vững, SQLite local sẽ mất — bắt buộc DB ngoài |
| Mua 1 lần, gói sau ghi đè gói trước | Gói có thời hạn/gia hạn: PayOS là thanh toán MỘT LẦN, không có recurring billing — tự lưu `expiresAt` và xây logic nhắc gia hạn |
| Tin webhook là nguồn sự thật duy nhất | Thêm job đối soát định kỳ: `payos.paymentRequests.get(orderCode)` cho các đơn PENDING quá lâu (vá được cả case webhook thất lạc + UNKNOWN_ORDER) |
| Admin không auth | Chặn `/admin` + `/api/admin/*` + `/api/webhook-events` |
| Xử lý webhook trong request | Nếu thêm việc nặng (email, đồng bộ hệ thống khác): ghi nhận → đẩy queue → trả 200 ngay |
| Tunnel đổi URL mỗi lần chạy | Deploy lên server có domain cố định → đặt Webhook Url một lần là xong |

---

## 15. Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp → cách xử lý |
|---|---|
| Bấm Mua → lỗi "Không tạo được link thanh toán" | Key sai/thiếu trong `.env.local` (nhất là **Checksum Key bị copy thiếu**) → copy lại bằng nút 📋 trên dashboard. Xem message chi tiết trong toast + log pino |
| QR không hiện (modal trống) | (a) Container iframe thiếu height cố định; (b) cài nhầm package cũ `payos-checkout` thay vì `@payos/payos-checkout` — API khác nhau (`open(true)` vs `embedded: true` + `open()`) |
| Iframe báo **"Thông tin truyền lên không hợp lệ"** thay vì QR | `redirect_uri` mà lib gửi lên ≠ `returnUrl` của payment link — PayOS so khớp **CHÍNH XÁC từng ký tự, kể cả dấu `/` cuối** (kiểm chứng thực nghiệm bằng curl). Đã fix 2 tầng: returnUrl lấy theo header `Origin` của request (`requestOrigin()`), và server trả về + lưu nguyên chuỗi `returnUrl` để client đưa thẳng vào `RETURN_URL` của lib. Lưu ý: đơn PENDING tạo TRƯỚC fix mang returnUrl cũ → "Tiếp tục thanh toán" vẫn lỗi, hãy Hủy và mua đơn mới |
| Console cảnh báo `Blocked cross-origin request to /_next/webpack-hmr from *.trycloudflare.com` | Mở app dev qua domain tunnel — Next chặn dev resources cross-origin theo mặc định. Đã thêm `allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app"]` vào `next.config.ts` (chỉ ảnh hưởng dev; cần **restart dev server** sau khi đổi config) |
| Console error `Element ID:payos-embedded-container not exist` | Gọi `exit()` của lib khi container đã unmount (vd trong cleanup của effect lúc đóng modal). Đã fix bằng `safeExit()` trong `CheckoutModal.tsx` — chỉ gọi `exit()` khi iframe còn gắn trong DOM. Nếu sửa lifecycle modal, giữ nguyên pattern này |
| Bấm Lưu Webhook Url trên dashboard báo lỗi | App hoặc tunnel **chưa chạy** lúc bấm Lưu (PayOS gửi request kiểm tra ngay và cần 2XX). Chạy `npm run dev` + cloudflared trước; mở URL webhook trên trình duyệt thấy `{ok:true}` rồi hãy Lưu |
| Thanh toán xong, QR đóng nhưng **gói không kích hoạt** | Webhook không tới server: tunnel chết / Webhook Url cũ (quick tunnel **đổi URL mỗi lần chạy**!) → cập nhật lại ô Webhook Url. Kiểm tra `/admin` webhook log: không có event mới = PayOS không gọi vào được |
| Modal hiện "PayOS đã ghi nhận… webhook chưa tới" (timeout) | Chính là case trên — đơn vẫn PENDING, sửa tunnel/URL xong webhook tới muộn vẫn kích hoạt |
| `SQLITE_ERROR: no such table` | Schema chưa sync — chạy `npm run db:push` (bình thường `predev` tự chạy; chỉ gặp khi chạy `next dev` trực tiếp không qua npm script) |
| Webhook log toàn `INVALID_SIGNATURE` | Checksum Key trong `.env.local` không khớp kênh đang bắn webhook (sai kênh / key thiếu ký tự) |
| PayOS từ chối tạo link, lỗi liên quan description | `description` vượt **9 ký tự** (giới hạn với tài khoản ngân hàng thường) — sửa trong `lib/plans.ts`; dài nhất hiện tại là `"GOI MAX20"` = đúng 9 |
| Giờ hiển thị lệch | Quên extend plugin utc/timezone của dayjs — mọi format phải đi qua `lib/datetime.ts`, đừng tự `new Date().toLocaleString()` |
| Lỗi build dính `better-sqlite3` / `pino` | Thiếu `serverExternalPackages: ["better-sqlite3", "pino"]` trong `next.config.ts` |
| Số liệu biến mất sau khi xóa `data/` | Đúng thiết kế — SQLite local là dữ liệu demo. Đơn cũ thanh toán SAU khi xóa DB sẽ ra `UNKNOWN_ORDER` trong webhook log |

---

## 16. Tài liệu tham khảo (toàn bộ link hữu ích)

### Tài liệu chính thức PayOS

| Link | Đọc khi nào |
|---|---|
| <https://payos.vn/docs/> | Tổng quan tích hợp — bắt đầu từ đây |
| <https://payos.vn/docs/api/> | API reference: tạo payment link, ràng buộc `orderCode` / `description` (9 ký tự) / `expiredAt` (unix giây), lấy/hủy payment link |
| <https://payos.vn/docs/du-lieu-tra-ve/webhook/> | Cấu trúc payload webhook + yêu cầu trả 2XX |
| <https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/> | Cách PayOS tính chữ ký (HMAC-SHA256, sort key) — nền tảng của mục 8 & 11 |
| <https://payos.vn/docs/sample/> | Danh sách toàn bộ sample chính chủ mọi ngôn ngữ |
| <https://my.payos.vn> | Dashboard: tạo kênh, lấy 3 khóa, cấu hình **Webhook Url**, xem/**Mua gói** (giá VND) |
| <https://payos.vn/thong-bao-han-che-tinh-nang-tao-don/> | Chính sách khoá tạo đơn khi hết gói (cảnh báo 80%/95%, mục 12.2) |
| <https://payos.vn/cong-thanh-toan-mien-phi-2026/> | Gói miễn phí 2026 & cấu trúc tier free (mục 12.1) |

### Mã nguồn chính chủ payOS (GitHub)

| Link | Đọc khi nào |
|---|---|
| <https://github.com/payOSHQ/payos-lib-node> | SDK `@payos/node` đang dùng — xem types/method mới |
| <https://github.com/payOSHQ/payos-checkout-react-lib> | Thư viện nhúng `@payos/payos-checkout` đang dùng cho iframe QR |
| <https://github.com/payOSHQ/payos-demo-nodejs> | Demo backend Express chính chủ — tham khảo cách xử lý webhook test ("Ma giao dich thu nghiem", "VQRIO123") |
| <https://github.com/payOSHQ/payos-demo-java-spring> · <https://github.com/payOSHQ/payos-demo-dotnet-core> · <https://github.com/payOSHQ/payos-demo-python-django> · <https://github.com/payOSHQ/payos-demo-php-laravel> · <https://github.com/payOSHQ/payos-demo-golang> | Demo backend các ngôn ngữ khác (nếu team cần port) |
| <https://github.com/payOSHQ/payos-demo-react-native> · <https://github.com/payOSHQ/payos-flutter-demo> | Demo mobile |

### npm packages

| Link | Ghi chú |
|---|---|
| <https://www.npmjs.com/package/@payos/node> | SDK server v2 (yêu cầu Node ≥ 20) |
| <https://www.npmjs.com/package/@payos/payos-checkout> | Lib nhúng checkout. ⚠️ Package cũ `payos-checkout` (không có scope `@payos/`) đã **DEPRECATED** — đừng cài nhầm |

### Công cụ & thư viện liên quan

| Link | Dùng cho |
|---|---|
| <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/> | Cloudflare quick tunnel (mục 7) |
| <https://ngrok.com/docs> | Tunnel thay thế |
| <https://orm.drizzle.team> | Drizzle ORM + drizzle-kit |
| <https://tanstack.com/query/latest> | TanStack Query (poll, cache, refetchOnWindowFocus) |
| <https://day.js.org/docs/en/timezone/timezone> | dayjs timezone plugin (giờ VN) |
| <https://zod.dev> | zod validation |
| <https://getpino.io> | pino logging |
| <https://axios-http.com> | axios |

---

*Demo được xây để bàn giao nội bộ — nếu có thắc mắc về luồng, đọc mục 2 + 8 trước, sau đó
mở trang `/admin` và làm một giao dịch 10.000đ để nhìn mọi thứ chạy thật.* 🚀
