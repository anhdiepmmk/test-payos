/**
 * Pino logger singleton (server-only).
 * Xuất JSON ra stdout — KHÔNG cấu hình transport pino-pretty ở đây
 * (transport chạy worker thread, lỗi khi Next bundle). Muốn log đẹp khi dev:
 *   npm run dev | npx pino-pretty
 * Cache trên globalThis để hot-reload của Next dev không tạo logger mới liên tục.
 */
import pino from "pino";

const g = globalThis as unknown as { __logger?: pino.Logger };

export const logger: pino.Logger = (g.__logger ??= pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined, // bỏ pid/hostname cho gọn
  timestamp: pino.stdTimeFunctions.isoTime,
}));
