// Kiểm tra định dạng đăng nhập nhanh, dùng chung client (báo lỗi ngay) và server (kiểm tra lại).
// Bản thử nghiệm: chỉ cần email và mật khẩu đúng định dạng, chưa xác thực thật.

export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 20;
/** Ghi nhớ đăng nhập trên thiết bị trong 30 ngày. */
export const SESSION_DAYS = 30;
export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function normalizeEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

/** Trả câu báo lỗi, hoặc null nếu hợp lệ. */
export function emailError(raw: unknown): string | null {
  const e = normalizeEmail(raw);
  if (!e) return 'Hãy nhập email';
  if (e.length > EMAIL_MAX || !EMAIL_RE.test(e) || e.includes('..')) return 'Email chưa đúng định dạng';
  return null;
}

export function passwordError(raw: unknown): string | null {
  const p = typeof raw === 'string' ? raw : '';
  if (!p) return 'Hãy nhập mật khẩu';
  // đếm theo ký tự thật (kể cả chữ có dấu, emoji), không theo đơn vị UTF-16
  const n = [...p].length;
  if (n < PASSWORD_MIN || n > PASSWORD_MAX) return `Mật khẩu cần ${PASSWORD_MIN}–${PASSWORD_MAX} ký tự`;
  return null;
}

/** Thông tin nhân vật tóm tắt trả về cho màn hình chính. */
export interface CharacterSummary { name: string; cls: string; lv: number }

export interface AuthResult {
  session: string;
  email: string;
  expiresAt: number; // ms epoch
  character: CharacterSummary | null;
}
