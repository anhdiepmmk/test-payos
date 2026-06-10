/**
 * Kết nối SQLite (better-sqlite3) + Drizzle — singleton trên globalThis
 * để hot-reload của Next dev không mở thêm connection mới liên tục.
 *
 * Schema được sync bằng `drizzle-kit push` (tự chạy qua npm script `predev`/`prebuild`).
 * better-sqlite3 là native module → đã khai báo trong next.config.ts `serverExternalPackages`.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

function createDb(): BetterSQLite3Database<typeof schema> {
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, "app.db"));
  sqlite.pragma("journal_mode = WAL"); // cho phép đọc song song khi đang ghi
  return drizzle(sqlite, { schema });
}

const g = globalThis as unknown as {
  __db?: BetterSQLite3Database<typeof schema>;
};

export const db = (g.__db ??= createDb());
