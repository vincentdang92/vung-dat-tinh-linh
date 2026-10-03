// Lưu nhân vật: hỗ trợ Supabase (PostgreSQL) và fallback file JSON cục bộ.
// Tự động tương thích với các tài khoản cũ (điền giá trị mặc định cho nhiệm vụ và mảnh trống).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CLASSES, WEAPONS } from '../../shared/data.ts';
import type { Profile } from './world.ts';

const TOKEN_RE = /^[0-9a-f-]{36}$/;

export class ProfileStore {
  private dir: string;
  private supabase: SupabaseClient | null = null;

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
      drumPieces: Array.isArray(p.drumPieces) ? p.drumPieces : (Array.isArray(p.drum_pieces) ? p.drum_pieces : []),
      quests: typeof p.quests === 'object' && p.quests !== null ? p.quests : { main1: 1 },
      questProg: typeof p.questProg === 'object' && p.questProg !== null ? p.questProg : (typeof p.quest_prog === 'object' && p.quest_prog !== null ? p.quest_prog : {}),
      title: typeof p.title === 'string' ? p.title : '',
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
        drumPieces: p.drumPieces ?? [],
        quests: p.quests ?? {},
        questProg: p.questProg ?? {},
        title: p.title ?? '',
        updated_at: new Date().toISOString(),
      };

      try {
        const { error } = await this.supabase
          .from('profiles')
          .upsert(fullPayload, { onConflict: 'token' });

        if (error) {
          // Nếu bảng trên Supabase chưa có các cột mới, thử upsert dạng basic để không fail
          if (error.message.includes('column') || error.code === 'PGRST204') {
            const basicPayload = {
              token: p.token,
              name: p.name,
              cls: p.cls,
              level: p.level,
              xp: p.xp,
              gold: p.gold,
              inv: p.inv,
              weapon: p.weapon,
              updated_at: new Date().toISOString(),
            };
            await this.supabase.from('profiles').upsert(basicPayload, { onConflict: 'token' });
          } else {
            console.error(`[Store] Lỗi lưu Supabase (token=${p.token}):`, error.message);
          }
        }
      } catch (err) {
        console.error('[Store] Lỗi ngoại lệ khi lưu Supabase:', err);
      }
    }
  }
}
