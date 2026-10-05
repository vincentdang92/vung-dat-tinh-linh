// Lưu nhân vật: hỗ trợ Supabase (PostgreSQL) và fallback file JSON cục bộ.
// Tự động tương thích với các tài khoản cũ (điền giá trị mặc định cho nhiệm vụ và mảnh trống).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CLASSES, WEAPONS } from '../../shared/data.ts';
import { isMapId } from '../../shared/map.ts';
import { normalizeLife } from '../../shared/life.ts';
import type { Profile } from './world.ts';

const TOKEN_RE = /^[0-9a-f-]{36}$/;

const firstArray = (...v: unknown[]) => v.find((x): x is number[] => Array.isArray(x));
const firstObject = (...v: unknown[]) =>
  v.find((x): x is Record<string, number> => typeof x === 'object' && x !== null && !Array.isArray(x));

/** Cột gốc của bảng profiles: thiếu cột này là lỗi thật, không được bỏ qua khi lưu. */
const REQUIRED_COLS = new Set(['token', 'name', 'cls', 'level', 'xp', 'gold', 'inv', 'weapon']);

export class ProfileStore {
  private dir: string;
  private supabase: SupabaseClient | null = null;
  private warnedColumns = new Set<string>();

  constructor(dir: string, supabaseUrl?: string, supabaseKey?: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });

    const isValidSupabase =
      Boolean(supabaseUrl && supabaseKey) &&
      !supabaseUrl?.includes('demo-project') &&
      !supabaseUrl?.includes('your-project') &&
      !supabaseKey?.includes('demo-') &&
      !supabaseKey?.includes('your-');

    if (isValidSupabase) {
      try {
        this.supabase = createClient(supabaseUrl!, supabaseKey!, {
          auth: { persistSession: false },
        });
        console.log(`[Store] Đã kết nối Supabase (${supabaseUrl})`);
      } catch (err) {
        console.error('[Store] Khởi tạo Supabase thất bại, fallback sang file JSON:', err);
      }
    } else {
      console.log(`[Store] Chưa có key Supabase hợp lệ -> Dùng lưu trữ file cục bộ tại: ${dir}`);
    }
  }

  static validToken(token: unknown): token is string {
    return typeof token === 'string' && TOKEN_RE.test(token);
  }

  /** Kết nối Supabase (null nếu đang dùng file cục bộ), dùng chung cho bảng tài khoản. */
  get db(): SupabaseClient | null {
    return this.supabase;
  }

  /** Chuẩn hoá và điền mặc định cho Profile cũ thiếu trường */
  static normalize(p: any): Profile {
    return {
      token: p.token,
      name: p.name,
      cls: p.cls,
      level: Number(p.level) || 1,
      xp: Number(p.xp) || 0,
      gold: Number(p.gold) || 0,
      inv: Array.isArray(p.inv) ? p.inv : [],
      weapon: p.weapon,
      // Postgres gấp tên cột không có ngoặc kép về chữ thường: Supabase trả `drumpieces`, `questprog`
      drumPieces: firstArray(p.drumPieces, p.drumpieces, p.drum_pieces) ?? [],
      quests: firstObject(p.quests) ?? { main1: 1 },
      questProg: firstObject(p.questProg, p.questprog, p.quest_prog) ?? {},
      title: typeof p.title === 'string' ? p.title : '',
      mapId: isMapId(p.mapId) ? p.mapId : isMapId(p.mapid) ? p.mapid : 'lang_tre',
      life: normalizeLife(p.life),
    };
  }

  /** Đọc dữ liệu từ file JSON cục bộ */
  private loadLocal(token: string): Profile | null {
    const file = join(this.dir, `${token}.json`);
    if (!existsSync(file)) return null;
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      if (!CLASSES[raw.cls] || !WEAPONS[raw.weapon] || !Array.isArray(raw.inv)) return null;
      raw.token = token;
      return ProfileStore.normalize(raw);
    } catch {
      return null;
    }
  }

  /** Ghi dữ liệu ra file JSON cục bộ */
  private saveLocal(p: Profile) {
    const file = join(this.dir, `${p.token}.json`);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(p));
    renameSync(tmp, file);
  }

  async load(token: string): Promise<Profile | null> {
    if (!ProfileStore.validToken(token)) return null;

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('profiles')
          .select('*')
          .eq('token', token)
          .maybeSingle();

        if (error) {
          console.error(`[Store] Lỗi đọc Supabase (token=${token}):`, error.message);
          return this.loadLocal(token);
        }

        if (data) {
          if (!CLASSES[data.cls] || !WEAPONS[data.weapon] || !Array.isArray(data.inv)) return null;
          const prof = ProfileStore.normalize(data);
          // Bảng chưa có cột `life` (chưa chạy migration): giữ tiến độ Nghề Sống từ bản lưu cục bộ
          if (!('life' in data)) {
            const local = this.loadLocal(token);
            if (local?.life) prof.life = local.life;
          }
          this.saveLocal(prof); // Cập nhật cache cục bộ
          return prof;
        }

        // Nếu trên Supabase chưa có (ví dụ tài khoản tạo từ trước khi cắm Supabase), nạp từ local và đồng bộ lên
        const local = this.loadLocal(token);
        if (local) {
          console.log(`[Store] Đang đồng bộ nhân vật cũ (${local.name}) lên Supabase...`);
          await this.save(local);
          return local;
        }

        return null;
      } catch (err) {
        console.error('[Store] Lỗi ngoại lệ khi truy vấn Supabase:', err);
        return this.loadLocal(token);
      }
    }

    return this.loadLocal(token);
  }

  async save(p: Profile): Promise<void> {
    if (!ProfileStore.validToken(p.token)) return;

    // Luôn lưu cache file cục bộ để an toàn tuyệt đối
    try {
      this.saveLocal(p);
    } catch (err) {
      console.error('[Store] Lỗi lưu cache cục bộ:', err);
    }

    if (this.supabase) {
      const fullPayload = {
        token: p.token,
        name: p.name,
        cls: p.cls,
        level: p.level,
        xp: p.xp,
        gold: p.gold,
        inv: p.inv,
        weapon: p.weapon,
        // Tên cột viết thường cho khớp Postgres (schema.sql không đặt ngoặc kép).
        // Trước đây gửi `drumPieces`/`questProg` nên Supabase báo thiếu cột, rơi xuống bản basic
        // và nhiệm vụ không bao giờ được lưu lên.
        drumpieces: p.drumPieces ?? [],
        quests: p.quests ?? {},
        questprog: p.questProg ?? {},
        title: p.title ?? '',
        mapid: p.mapId ?? 'lang_tre',
        life: p.life ?? { xp: {}, bag: {} },
        updated_at: new Date().toISOString(),
      };

      try {
        // Bảng thiếu cột nào (chưa chạy migration) thì bỏ đúng cột đó rồi lưu lại, không bỏ cả tiến độ
        let payload: Record<string, unknown> = fullPayload;
        for (let attempt = 0; attempt < 6; attempt++) {
          const { error } = await this.supabase.from('profiles').upsert(payload, { onConflict: 'token' });
          if (!error) break;
          const col = /'([a-z_]+)' column/i.exec(error.message)?.[1];
          if ((error.code === 'PGRST204' || error.message.includes('column')) && col && col in payload && !REQUIRED_COLS.has(col)) {
            if (!this.warnedColumns.has(col)) {
              this.warnedColumns.add(col);
              console.warn(`[Store] Bảng profiles thiếu cột "${col}", tạm bỏ qua khi lưu. Hãy chạy lại supabase/schema.sql.`);
            }
            const { [col]: _drop, ...rest } = payload;
            payload = rest;
            continue;
          }
          console.error(`[Store] Lỗi lưu Supabase (token=${p.token}):`, error.message);
          break;
        }
      } catch (err) {
        console.error('[Store] Lỗi ngoại lệ khi lưu Supabase:', err);
      }
    }
  }
}
