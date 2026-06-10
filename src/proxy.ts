/**
 * Proxy (Next.js 16 — tên mới của middleware.ts): chạy trước MỌI request.
 * Nhiệm vụ duy nhất: đảm bảo mỗi visitor có cookie `uid` (danh tính ẩn danh cho demo multi-user).
 * Cookie name phải khớp USER_COOKIE trong lib/user.ts.
 */
import { NextResponse, type NextRequest } from "next/server";

export default function proxy(request: NextRequest) {
  if (request.cookies.get("uid")) {
    return NextResponse.next();
  }

  const uid = crypto.randomUUID();

  // Ghi uid vào header cookie của REQUEST trước khi forward — để chính lượt gọi
  // đầu tiên (chưa từng có cookie) cũng đọc được uid trong route handler,
  // không bị 401 ở request đầu đời.
  const requestHeaders = new Headers(request.headers);
  const existingCookie = requestHeaders.get("cookie");
  requestHeaders.set("cookie", existingCookie ? `${existingCookie}; uid=${uid}` : `uid=${uid}`);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set("uid", uid, {
    httpOnly: true, // JS phía client không đọc được — chỉ server dùng
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 năm
  });
  return response;
}

export const config = {
  // Bỏ qua asset tĩnh; webhook của PayOS không cần uid nhưng có cũng vô hại.
  matcher: ["/((?!_next|favicon\\.ico).*)"],
};
