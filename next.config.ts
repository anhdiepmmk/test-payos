import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 là native module, pino dùng worker thread —
  // hai package này phải chạy từ node_modules thật, không được bundle vào server build.
  serverExternalPackages: ["better-sqlite3", "pino"],
  // Chốt workspace root tại thư mục dự án (máy dev có lockfile lạ ở thư mục cha).
  turbopack: { root: __dirname },
};

export default nextConfig;
