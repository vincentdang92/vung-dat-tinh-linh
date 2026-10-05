// Gọi API đăng nhập nhanh trên game server (server giả, chỉ kiểm tra định dạng).
import type { AuthResult } from '../../shared/auth.ts';
import { setAuth } from './state.ts';

/** Gốc API: VITE_API_URL, hoặc suy ra từ VITE_WS_URL (wss://host/ws -> https://host), hoặc cùng domain (Vite proxy /api). */
function apiBase(): string {
  const api = import.meta.env.VITE_API_URL as string | undefined;
  if (api) return api.replace(/\/$/, '');
  const ws = import.meta.env.VITE_WS_URL as string | undefined;
  if (ws) return ws.replace(/^ws/, 'http').replace(/\/ws\/?$/, '');
  return '';
}

export class ApiError extends Error {
  auth: boolean;
  constructor(msg: string, auth = false) { super(msg); this.auth = auth; }
}

async function call(path: string, init: RequestInit & { session?: string } = {}): Promise<AuthResult> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.session) headers.authorization = `Bearer ${init.session}`;
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('Không kết nối được server, hãy thử lại');
  }
  let body: any = null;
  try { body = await res.json(); } catch { /* không phải JSON */ }
  if (!res.ok) throw new ApiError(body?.error || 'Server đang lỗi, hãy thử lại sau', res.status === 401);
  return body as AuthResult;
}

/** Đăng nhập nhanh: đúng định dạng là vào, ghi nhớ 30 ngày. */
export async function quickLogin(email: string, password: string): Promise<AuthResult> {
  const r = await call('/api/auth/quick-login', { method: 'POST', body: JSON.stringify({ email, password }) });
  setAuth(r);
  return r;
}

/** Làm mới thông tin tài khoản (cấp nhân vật mới nhất). Phiên hết hạn thì tự đăng xuất. */
export async function refreshMe(session: string): Promise<void> {
  try {
    setAuth(await call('/api/auth/me', { session }));
  } catch (e) {
    if (e instanceof ApiError && e.auth) setAuth(null);
  }
}

/** Nhận lại nhân vật cũ lưu trên máy làm nhân vật của tài khoản. */
export async function claimLegacy(session: string, legacyToken: string): Promise<AuthResult> {
  const r = await call('/api/auth/claim', { method: 'POST', session, body: JSON.stringify({ legacyToken }) });
  setAuth(r);
  return r;
}

export function logout() {
  setAuth(null);
}
