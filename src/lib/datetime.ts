/**
 * Mọi xử lý datetime trong dự án đi qua file này (dayjs).
 * Quy ước: LƯU TRỮ bằng UTC (ISO string / unix giây), HIỂN THỊ bằng giờ Việt Nam (UTC+7).
 */
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

// Bắt buộc extend 2 plugin này TRƯỚC khi gọi .tz() — quên là lệch giờ/throw.
dayjs.extend(utc);
dayjs.extend(timezone);

export const VN_TZ = "Asia/Ho_Chi_Minh";

/** Thời điểm hiện tại dạng ISO UTC — dùng khi ghi DB. */
export const nowIso = (): string => dayjs.utc().toISOString();

/** Unix giây hiện tại. */
export const nowUnix = (): number => dayjs().unix();

/** Unix giây của thời điểm `minutes` phút nữa — dùng cho expiredAt của PayOS (yêu cầu unix GIÂY, Int32). */
export const expiryUnix = (minutes: number): number =>
  dayjs().add(minutes, "minute").unix();

/** Format một mốc thời gian (ISO string hoặc unix giây) sang giờ Việt Nam để hiển thị. */
export const formatDateTime = (
  value: string | number | null | undefined,
): string => {
  if (value === null || value === undefined || value === "") return "—";
  const d = typeof value === "number" ? dayjs.unix(value) : dayjs(value);
  return d.tz(VN_TZ).format("DD/MM/YYYY HH:mm:ss");
};

/** Số giây còn lại đến mốc unix giây (không âm) — dùng cho countdown QR. */
export const secondsLeft = (expiredAtUnix: number): number =>
  Math.max(0, expiredAtUnix - dayjs().unix());

export default dayjs;
