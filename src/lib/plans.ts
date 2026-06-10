/**
 * Nguồn sự thật duy nhất về các gói và GIÁ.
 * Client chỉ gửi `planId` — server luôn tra giá ở đây, KHÔNG BAO GIỜ nhận giá từ client.
 *
 * Lưu ý: `description` trở thành nội dung chuyển khoản (memo) trên QR.
 * PayOS giới hạn TỐI ĐA 9 KÝ TỰ với tài khoản ngân hàng thường — xem README.
 */
export const PLAN_IDS = ["vip", "pro", "max5x", "max20x"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface Plan {
  id: PlanId;
  name: string;
  /** Giá VND — demo dùng giá nhỏ vì PayOS không có sandbox (tiền thật). */
  price: number;
  /** Memo chuyển khoản, TỐI ĐA 9 ký tự. */
  description: string;
  benefits: string[];
  highlight?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "vip",
    name: "VIP",
    price: 10_000,
    description: "GOI VIP",
    benefits: ["100 lượt sử dụng/tháng", "Hỗ trợ qua email"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 20_000,
    description: "GOI PRO",
    benefits: ["500 lượt sử dụng/tháng", "Hỗ trợ ưu tiên", "Truy cập API"],
    highlight: true,
  },
  {
    id: "max5x",
    name: "Max 5x",
    price: 50_000,
    description: "GOI MAX5",
    benefits: ["2.500 lượt sử dụng/tháng", "Mọi quyền lợi Pro", "Model nâng cao"],
  },
  {
    id: "max20x",
    name: "Max 20x",
    price: 100_000,
    description: "GOI MAX20",
    benefits: ["10.000 lượt sử dụng/tháng", "Mọi quyền lợi Max 5x", "Hỗ trợ 24/7"],
  },
];

export const getPlan = (id: string): Plan | undefined =>
  PLANS.find((p) => p.id === id);

export const formatVnd = (n: number): string =>
  new Intl.NumberFormat("vi-VN").format(n) + "đ";
