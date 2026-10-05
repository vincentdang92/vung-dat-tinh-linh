// "Server giả" đăng nhập nhanh: chỉ cần email + mật khẩu đúng định dạng là vào được (chưa xác thực thật).
// - Phiên đăng nhập là chuỗi ký HMAC (email + hạn 30 ngày), server không cần nhớ phiên.
// - Mỗi tài khoản (email) gắn với tối đa 1 nhân vật, tạo đúng 1 lần, không đổi được.
// Sau này đổi sang Supabase Auth thật chỉ cần thay file này.

import { createHmac, createHash, timingSafeEqual, randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailError, passwordError, normalizeEmail, SESSION_MS } from '../../shared/auth.ts';
import type { AuthResult, CharacterSummary } from '../../shared/auth.ts';
import { nameError, normalizeName } from '../../shared/names.ts';
import { CLASSES } from '../../shared/data.ts';
import type { ClassId } from '../../shared/data.ts';
import { ProfileStore } from './store.ts';
import { World } from './world.ts';
import type { Profile } from './world.ts';

export interface Account {
  email: string;
  profileToken: string | null; // null = chưa tạo nhân vật; đã có thì không bao giờ đổi
  createdAt: string;
}

// ------------------------------------------------------------------ lưu tài khoản

/** Bảng `accounts` trên Supabase, luôn kèm bản sao file cục bộ `data/accounts/*.json`. */
export class AccountStore {
  private dir: string;
  private db: SupabaseClient | null;
  private dbOff = false; // bảng chưa tạo trên Supabase -> chỉ dùng file

  constructor(dataDir: string, db: SupabaseClient | null) {
    this.dir = join(dataDir, 'accounts');
    mkdirSync(this.dir, { recursive: true });
    this.db = db;
  }

  private file(email: string) {
    return join(this.dir, `${createHash('sha256').update(email).digest('hex').slice(0, 32)}.json`);
  }

  private readFile(path: string): Account | null {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8'));
      if (typeof raw.email !== 'string') return null;
      return { email: raw.email, profileToken: raw.profileToken ?? null, createdAt: raw.createdAt ?? new Date().toISOString() };
    } catch {
      return null;
    }
  }

  private readLocal(email: string): Account | null {
    const f = this.file(email);
    return existsSync(f) ? this.readFile(f) : null;
  }

  private async writeLocal(a: Account) {
    const f = this.file(a.email);
    await writeFile(`${f}.tmp`, JSON.stringify(a), 'utf8');
    await rename(`${f}.tmp`, f);
  }

  private live(): SupabaseClient | null {
    return this.dbOff ? null : this.db;
  }

  private dbError(err: { code?: string; message?: string }) {
    const missing = err.code === '42P01' || err.code === 'PGRST205' || /accounts/.test(err.message ?? '') && /not (exist|find)|schema cache/.test(err.message ?? '');
    if (missing) {
      this.dbOff = true;
      console.warn('[Auth] Chưa có bảng "accounts" trên Supabase (hãy chạy supabase/schema.sql). Tạm lưu tài khoản ra file cục bộ.');
    } else {
      console.error('[Auth] Lỗi Supabase:', err.message);
    }
  }

  async get(email: string): Promise<Account | null> {
    const db = this.live();
    if (db) {
      const { data, error } = await db.from('accounts').select('email, profile_token, created_at').eq('email', email).maybeSingle();
      if (error) this.dbError(error);
      else if (data) {
        const a: Account = { email: data.email, profileToken: data.profile_token ?? null, createdAt: data.created_at };
        void this.writeLocal(a).catch((e) => console.error('[Auth] Lỗi writeLocal:', e));
        return a;
      } else {
        // tạo lúc chưa có bảng trên Supabase -> đồng bộ lên
        const local = this.readLocal(email);
        if (local) await this.save(local);
        return local;
      }
    }
    return this.readLocal(email);
  }

  async save(a: Account): Promise<void> {
    await this.writeLocal(a);
    const db = this.live();
    if (db) {
      const { error } = await db.from('accounts')
        .upsert({ email: a.email, profile_token: a.profileToken, created_at: a.createdAt }, { onConflict: 'email' });
      if (error) this.dbError(error);
    }
  }

  /** Email đang sở hữu nhân vật này (để không cho 2 tài khoản nhận cùng 1 nhân vật cũ). */
  async ownerOf(profileToken: string): Promise<string | null> {
    const db = this.live();
    if (db) {
      const { data, error } = await db.from('accounts').select('email').eq('profile_token', profileToken).limit(1);
      if (error) this.dbError(error);
      else if (data && data.length) return data[0].email;
    }
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      const a = this.readFile(join(this.dir, f));
      if (a?.profileToken === profileToken) return a.email;
    }
    return null;
  }
}

// ------------------------------------------------------------------ khoá ký phiên

/** Lấy AUTH_SECRET từ môi trường; nếu không có thì tạo 1 lần và lưu vào thư mục dữ liệu. */
export function loadAuthSecret(dataDir: string, fromEnv?: string): string {
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  mkdirSync(dataDir, { recursive: true });
  const f = join(dataDir, 'auth-secret.txt');
  if (existsSync(f)) {
    const s = readFileSync(f, 'utf8').trim();
    if (s.length >= 16) return s;
  }
  const s = randomBytes(32).toString('hex');
  writeFileSync(f, s);
  console.log(`[Auth] Chưa có AUTH_SECRET, đã tạo khoá mới tại ${f}`);
  return s;
}

// ------------------------------------------------------------------ dịch vụ đăng nhập

type Fail = { ok: false; msg: string; code?: 'auth' };
export type AuthReply = { ok: true; res: AuthResult } | Fail;
export type JoinReply = { ok: true; prof: Profile; created: boolean } | Fail;

const EXPIRED: Fail = { ok: false, msg: 'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại', code: 'auth' };

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

export class AuthService {
  private secret: string;
  private accounts: AccountStore;
  private profiles: ProfileStore;
  private locks = new Map<string, Promise<unknown>>();
  now: () => number = Date.now;

  constructor(secret: string, accounts: AccountStore, profiles: ProfileStore) {
    this.secret = secret;
    this.accounts = accounts;
    this.profiles = profiles;
  }

  // ---------------------------------------------------------------- phiên

  private sig(payload: string) {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  sign(email: string, exp: number): string {
    const payload = b64(JSON.stringify({ e: email, x: exp }));
    return `${payload}.${this.sig(payload)}`;
  }

  verify(session: unknown): { email: string; exp: number } | null {
    if (typeof session !== 'string' || session.length > 600) return null;
    const [payload, sig] = session.split('.');
    if (!payload || !sig) return null;
    const want = Buffer.from(this.sig(payload));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    try {
      const { e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (typeof e !== 'string' || typeof x !== 'number' || x <= this.now() || emailError(e)) return null;
      return { email: e, exp: x };
    } catch {
      return null;
    }
  }

  /** Chạy tuần tự theo email (2 tab bấm tạo nhân vật cùng lúc chỉ ra 1 nhân vật). */
  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    this.locks.set(key, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(key) === run) this.locks.delete(key);
    }
  }

  private async account(email: string): Promise<Account> {
    let a = await this.accounts.get(email);
    if (!a) {
      a = { email, profileToken: null, createdAt: new Date(this.now()).toISOString() };
      await this.accounts.save(a);
    }
    return a;
  }

  private async summary(a: Account): Promise<CharacterSummary | null> {
    if (!a.profileToken) return null;
    const p = await this.profiles.load(a.profileToken);
    return p ? { name: p.name, cls: p.cls, lv: p.level } : null;
  }

  // ---------------------------------------------------------------- API

  /** Đăng nhập nhanh: đúng định dạng là vào, lần đầu thì tự tạo tài khoản. Nhớ 30 ngày. */
  async quickLogin(rawEmail: unknown, password: unknown): Promise<AuthReply> {
    const err = emailError(rawEmail) ?? passwordError(password);
    if (err) return { ok: false, msg: err };
    const email = normalizeEmail(rawEmail);
    return this.withLock(email, async () => {
      const a = await this.account(email);
      const expiresAt = this.now() + SESSION_MS;
      return { ok: true as const, res: { session: this.sign(email, expiresAt), email, expiresAt, character: await this.summary(a) } };
    });
  }

  /** Mở lại game: kiểm tra phiên còn hạn và lấy thông tin nhân vật mới nhất. */
  async me(session: unknown): Promise<AuthReply> {
    const v = this.verify(session);
    if (!v) return EXPIRED;
    const a = await this.account(v.email);
    return { ok: true, res: { session: session as string, email: v.email, expiresAt: v.exp, character: await this.summary(a) } };
  }

  /** Nhận lại nhân vật cũ lưu trên máy (trước khi có đăng nhập) làm nhân vật duy nhất của tài khoản. */
  async claim(session: unknown, legacyToken: unknown): Promise<AuthReply> {
    const v = this.verify(session);
    if (!v) return EXPIRED;
    return this.withLock(v.email, async (): Promise<AuthReply> => {
      const a = await this.account(v.email);
      if (a.profileToken) return { ok: false, msg: 'Tài khoản này đã có nhân vật' };
      if (!ProfileStore.validToken(legacyToken)) return { ok: false, msg: 'Không tìm thấy nhân vật cũ' };
      const prof = await this.profiles.load(legacyToken);
      if (!prof) return { ok: false, msg: 'Không tìm thấy nhân vật cũ' };
      const owner = await this.accounts.ownerOf(legacyToken);
      if (owner && owner !== v.email) return { ok: false, msg: 'Nhân vật này đã thuộc về tài khoản khác' };
      a.profileToken = legacyToken;
      await this.accounts.save(a);
      return { ok: true, res: { session: session as string, email: v.email, expiresAt: v.exp, character: { name: prof.name, cls: prof.cls, lv: prof.level } } };
    });
  }

  /** Vào game: nạp nhân vật của tài khoản, hoặc tạo nhân vật đầu tiên (chỉ 1 lần). */
  async resolveJoin(session: unknown, create?: { name?: unknown; cls?: unknown }): Promise<JoinReply> {
    const v = this.verify(session);
    if (!v) return EXPIRED;
    return this.withLock(v.email, async (): Promise<JoinReply> => {
      const a = await this.account(v.email);
      if (a.profileToken) {
        const prof = await this.profiles.load(a.profileToken);
        if (!prof) return { ok: false, msg: 'Không đọc được dữ liệu nhân vật, hãy thử lại sau' };
        return { ok: true, prof, created: false };
      }
      if (!create) return { ok: false, msg: 'Tài khoản chưa có nhân vật' };
      const err = nameError(create.name);
      if (err) return { ok: false, msg: err };
      const cls = create.cls as ClassId;
      if (typeof create.cls !== 'string' || !CLASSES[cls]) return { ok: false, msg: 'Môn phái không hợp lệ' };
      const prof = World.newProfile(randomUUID(), normalizeName(create.name), cls);
      await this.profiles.save(prof);
      a.profileToken = prof.token;
      await this.accounts.save(a);
      return { ok: true, prof, created: true };
    });
  }
}
