// Dữ liệu thiết kế game: lớp nhân vật, vũ khí, vật phẩm, quái.
// Cân bằng số liệu ở đây — server dùng để tính, client dùng để hiển thị.

export type ClassId = 'warrior' | 'archer' | 'mage';
export type Rarity = 'common' | 'rare' | 'epic';

export interface ClassDef {
  id: ClassId;
  name: string;
  desc: string;
  color: number;
  hp: number;
  atk: number;
  def: number;
  speed: number; // px/giây
  range: number; // tầm đánh thường (px)
  atkCd: number; // ms giữa 2 đòn đánh thường
  attack: 'melee' | 'arrow' | 'bolt';
  shotSpeed: number; // px/giây (đạn), 0 với cận chiến
  aoe: number; // bán kính nổ của đạn (0 = đơn mục tiêu)
  skill: { name: string; desc: string; cd: number };
  starterWeapon: string;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior', name: 'Thiết Kiếm Môn', desc: 'Đệ tử noi gương Phù Đổng, giáp dày, cận chiến mạnh.',
    color: 0xd9534f, hp: 150, atk: 12, def: 6, speed: 112, range: 46, atkCd: 700,
    attack: 'melee', shotSpeed: 0, aoe: 0,
    skill: { name: 'Quét Tre Ngà', desc: 'Quét vòng quanh người, 180% sát thương.', cd: 6000 },
    starterWeapon: 'wood_sword',
  },
  archer: {
    id: 'archer', name: 'Lạc Tiễn Cốc', desc: 'Truyền nhân nỏ thần, bắn xa, khinh công nhanh.',
    color: 0xf2b33d, hp: 105, atk: 10, def: 3, speed: 122, range: 200, atkCd: 650,
    attack: 'arrow', shotSpeed: 440, aoe: 0,
    skill: { name: 'Nỏ Liên Châu', desc: 'Bắn 5 mũi tên hình quạt.', cd: 5000 },
    starterWeapon: 'short_bow',
  },
  mage: {
    id: 'mage', name: 'Thủy Phù Quán', desc: 'Dùng bùa gọi mưa sấm, đánh lan cả đám quái.',
    color: 0x4f6fe0, hp: 90, atk: 14, def: 2, speed: 106, range: 175, atkCd: 900,
    attack: 'bolt', shotSpeed: 320, aoe: 38,
    skill: { name: 'Lôi Phù', desc: 'Sau 0.6s, sấm sét giáng xuống vùng 250% sát thương.', cd: 7000 },
    starterWeapon: 'oak_staff',
  },
};

export interface WeaponDef {
  key: string;
  name: string;
  cls: ClassId;
  rarity: Rarity;
  atk: number;
  range?: number; // cộng tầm đánh
  atkCd?: number; // cộng/trừ hồi chiêu đánh thường (ms, âm = nhanh hơn)
  aoe?: number; // cộng bán kính nổ
}

export const WEAPONS: Record<string, WeaponDef> = {
  wood_sword: { key: 'wood_sword', name: 'Kiếm Tre', cls: 'warrior', rarity: 'common', atk: 0 },
  iron_sword: { key: 'iron_sword', name: 'Kiếm Đồng Đông Sơn', cls: 'warrior', rarity: 'rare', atk: 6 },
  flame_blade: { key: 'flame_blade', name: 'Roi Sắt Phù Đổng', cls: 'warrior', rarity: 'epic', atk: 14, atkCd: -100 },

  short_bow: { key: 'short_bow', name: 'Nỏ Tre', cls: 'archer', rarity: 'common', atk: 0 },
  hunter_bow: { key: 'hunter_bow', name: 'Nỏ Đồng', cls: 'archer', rarity: 'rare', atk: 5, range: 25 },
  wind_bow: { key: 'wind_bow', name: 'Nỏ Móng Rùa', cls: 'archer', rarity: 'epic', atk: 12, atkCd: -150, range: 30 },

  oak_staff: { key: 'oak_staff', name: 'Quạt Giấy', cls: 'mage', rarity: 'common', atk: 0 },
  crystal_staff: { key: 'crystal_staff', name: 'Quạt Lông Hạc', cls: 'mage', rarity: 'rare', atk: 7, aoe: 6 },
  storm_staff: { key: 'storm_staff', name: 'Quạt Phong Lôi', cls: 'mage', rarity: 'epic', atk: 16, aoe: 14 },
};

export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0xcfcfcf,
  rare: 0x4aa3ff,
  epic: 0xc061ff,
};

export function weaponsFor(cls: ClassId, rarity: Rarity): WeaponDef[] {
  return Object.values(WEAPONS).filter((w) => w.cls === cls && w.rarity === rarity);
}

import type { MonsterKind } from './map.ts';

export interface MonsterDef {
  kind: MonsterKind;
  name: string;
  level: number;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  radius: number;
  aggro: number; // bán kính phát hiện người chơi
  leash: number; // đuổi xa khỏi điểm spawn tối đa
  atkRange: number;
  atkCd: number;
  xp: number;
  gold: [number, number];
  respawnMs: number;
  color: number;
  drops: { potion: number; rare: number; epic: number };
  /** Thú rừng: 'flee' bỏ chạy khi người lại gần, 'neutral' chỉ đánh lại khi bị đánh. */
  critter?: 'flee' | 'neutral';
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  slime: {
    kind: 'slime', name: 'Bánh Trôi Tinh', level: 1, hp: 34, atk: 7, def: 0, speed: 48, radius: 12,
    aggro: 100, leash: 220, atkRange: 22, atkCd: 1200, xp: 7, gold: [1, 4], respawnMs: 8000,
    color: 0xf5f0eb, drops: { potion: 0.25, rare: 0.03, epic: 0 },
  },
  wolf: {
    kind: 'wolf', name: 'Cáo Tinh', level: 4, hp: 85, atk: 13, def: 3, speed: 92, radius: 13,
    aggro: 150, leash: 280, atkRange: 26, atkCd: 1000, xp: 18, gold: [4, 10], respawnMs: 12000,
    color: 0xe07228, drops: { potion: 0.3, rare: 0.1, epic: 0.005 },
  },
  boss: {
    kind: 'boss', name: 'Chúa Mộc Tinh', level: 8, hp: 1400, atk: 22, def: 7, speed: 68, radius: 22,
    aggro: 150, leash: 170, atkRange: 34, atkCd: 1400, xp: 260, gold: [60, 120], respawnMs: 90000,
    color: 0x4a6b36, drops: { potion: 1, rare: 0.5, epic: 1 },
  },
  crab: {
    kind: 'crab', name: 'Cua Đá', level: 9, hp: 220, atk: 18, def: 14, speed: 48, radius: 14,
    aggro: 110, leash: 220, atkRange: 24, atkCd: 1300, xp: 40, gold: [6, 14], respawnMs: 12000,
    color: 0x78716c, drops: { potion: 0.35, rare: 0.15, epic: 0.02 },
  },
  frog: {
    kind: 'frog', name: 'Ếch Lửa', level: 10, hp: 170, atk: 24, def: 6, speed: 40, radius: 13,
    aggro: 160, leash: 260, atkRange: 160, atkCd: 1800, xp: 48, gold: [8, 16], respawnMs: 12000,
    color: 0x3d7a35, drops: { potion: 0.35, rare: 0.18, epic: 0.03 },
  },
  mada: {
    kind: 'mada', name: 'Ma Da', level: 12, hp: 260, atk: 28, def: 10, speed: 58, radius: 13,
    aggro: 140, leash: 240, atkRange: 26, atkCd: 1100, xp: 62, gold: [12, 22], respawnMs: 15000,
    color: 0x1e3a5f, drops: { potion: 0.4, rare: 0.22, epic: 0.05 },
  },
  serpent: {
    kind: 'serpent', name: 'Thuồng Luồng', level: 15, hp: 3200, atk: 38, def: 16, speed: 62, radius: 26,
    aggro: 180, leash: 200, atkRange: 42, atkCd: 1500, xp: 600, gold: [120, 250], respawnMs: 120000,
    color: 0x164e63, drops: { potion: 1, rare: 0.6, epic: 1 },
  },
  // ---- Thú rừng (Nghề Săn bắt): không rơi vàng/vũ khí, thịt vào thẳng Giỏ Tre ----
  // 'flee': thấy người trong bán kính `aggro` là bỏ chạy (chạy một quãng lại đứng thở), không đánh lại.
  rabbit: {
    kind: 'rabbit', name: 'Thỏ Rừng', level: 1, hp: 22, atk: 0, def: 0, speed: 104, radius: 10,
    aggro: 85, leash: 200, atkRange: 0, atkCd: 99999, xp: 2, gold: [0, 0], respawnMs: 20000,
    color: 0xc8b49a, drops: { potion: 0, rare: 0, epic: 0 }, critter: 'flee',
  },
  fowl: {
    kind: 'fowl', name: 'Gà Rừng', level: 1, hp: 18, atk: 0, def: 0, speed: 96, radius: 10,
    aggro: 80, leash: 200, atkRange: 0, atkCd: 99999, xp: 2, gold: [0, 0], respawnMs: 20000,
    color: 0xb45309, drops: { potion: 0, rare: 0, epic: 0 }, critter: 'flee',
  },
  lele: {
    kind: 'lele', name: 'Le Le', level: 2, hp: 20, atk: 0, def: 0, speed: 92, radius: 10,
    aggro: 90, leash: 180, atkRange: 0, atkCd: 99999, xp: 3, gold: [0, 0], respawnMs: 20000,
    color: 0x78716c, drops: { potion: 0, rare: 0, epic: 0 }, critter: 'flee',
  },
  // 'neutral': hiền cho tới khi bị đánh rồi mới húc lại
  boar: {
    kind: 'boar', name: 'Lợn Rừng', level: 5, hp: 160, atk: 11, def: 4, speed: 78, radius: 14,
    aggro: 0, leash: 220, atkRange: 24, atkCd: 1300, xp: 14, gold: [0, 0], respawnMs: 45000,
    color: 0x44403c, drops: { potion: 0, rare: 0, epic: 0 }, critter: 'neutral',
  },
};

// Đòn Rễ Đâm của Chúa Mộc Tinh (báo trước vòng tròn rồi mới gây sát thương)
export const BOSS_SLAM = { every: 6500, telegraphMs: 1200, radius: 90, mult: 2.0 };

// Đòn Quẫy Đuôi và Sóng Dữ của Thuồng Luồng
export const BOSS_SERPENT = {
  sweepEvery: 5500,
  sweepTelegraphMs: 900,
  sweepRadius: 85,
  sweepMult: 1.8,
  waveEvery: 8500,
  waveRadius: 130,
  waveMult: 1.5,
};

export const ITEMS = {
  potion: { key: 'potion', name: 'Bình máu' },
  leaf: { key: 'leaf', name: 'Lá Đa Cổ' },
  lotus_seed: { key: 'lotus_seed', name: 'Hạt Sen Đêm' },
  shoe: { key: 'shoe', name: 'Chiếc Hài Thêu' },
} as const;

export interface UltimateDef {
  name: string;
  desc: string;
}

export const ULTIMATES: Record<ClassId, UltimateDef> = {
  warrior: {
    name: 'Phù Đổng Thiên Vương',
    desc: 'Lấy đà 0.3s rồi nện đất: 300% sát thương vùng 110px, choáng quái 1.2s.',
  },
  archer: {
    name: 'Nỏ Thần Kim Quy',
    desc: 'Mưa tên vàng 3 giây quanh mục tiêu, mỗi 0.25s gây 60% sát thương.',
  },
  mage: {
    name: 'Thủy Long Quyển',
    desc: '6 dòng nước xoay quanh người 4s, chạm gây 80% và làm chậm 40% trong 1.5s.',
  },
};

// ------------------------------------------------------------------ Hệ Thống Võ Học & Nâng Cấp Kỹ Năng

export interface SkillData {
  sp: number;
  mainLv: number; // 1..5
  ultLv: number;  // 1..3
  passives: {
    atk: number;  // 0..5
    def: number;  // 0..5
    spd: number;  // 0..5
  };
}

export function defaultSkills(level = 1): SkillData {
  const totalSp = Math.max(0, level - 1);
  return {
    sp: totalSp,
    mainLv: 1,
    ultLv: 1,
    passives: { atk: 0, def: 0, spd: 0 },
  };
}

export function normalizeSkills(raw: any, level = 1): SkillData {
  const totalSp = Math.max(0, level - 1);
  if (!raw || typeof raw !== 'object') return defaultSkills(level);

  const mainLv = Math.max(1, Math.min(5, Math.floor(Number(raw.mainLv)) || 1));
  const ultLv = Math.max(1, Math.min(3, Math.floor(Number(raw.ultLv)) || 1));
  const p = raw.passives && typeof raw.passives === 'object' ? raw.passives : {};
  const atk = Math.max(0, Math.min(5, Math.floor(Number(p.atk)) || 0));
  const def = Math.max(0, Math.min(5, Math.floor(Number(p.def)) || 0));
  const spd = Math.max(0, Math.min(5, Math.floor(Number(p.spd)) || 0));

  const spent = (mainLv - 1) + (ultLv - 1) + atk + def + spd;
  if (spent > totalSp) {
    return defaultSkills(level);
  }

  return {
    sp: totalSp - spent,
    mainLv,
    ultLv,
    passives: { atk, def, spd },
  };
}

export interface SkillLevelDef {
  lv: number;
  desc: string;
  mult: number;
  cd: number; // ms
  special?: string;
}

export interface UltLevelDef {
  lv: number;
  desc: string;
  mult: number;
  radius: number;
  duration?: number;
  special?: string;
}

export interface PassiveSkillDef {
  id: 'atk' | 'def' | 'spd';
  name: string;
  desc: string;
  maxLv: number;
  perLevelText: string;
}

export const PASSIVE_SKILLS: Record<'atk' | 'def' | 'spd', PassiveSkillDef> = {
  atk: {
    id: 'atk',
    name: 'Cường Lực',
    desc: 'Tu luyện nội công, tăng sức công phá trong từng thế võ.',
    maxLv: 5,
    perLevelText: '+3 Công mỗi cấp (tối đa +15 Công)',
  },
  def: {
    id: 'def',
    name: 'Kim Cang',
    desc: 'Luyện khí hộ thể, thân như đồng đúc, khí huyết dồi dào.',
    maxLv: 5,
    perLevelText: '+2 Giáp, +20 Máu mỗi cấp (tối đa +10 Giáp, +100 Máu)',
  },
  spd: {
    id: 'spd',
    name: 'Thần Hành',
    desc: 'Khinh công linh hoạt, thân thủ phi phàm như gió lướt.',
    maxLv: 5,
    perLevelText: '+3% Tốc chạy, -0.2s hồi Khinh công mỗi cấp',
  },
};

export interface ClassSkillTree {
  main: {
    name: string;
    icon: string;
    maxLv: number;
    levels: SkillLevelDef[];
  };
  ult: {
    name: string;
    icon: string;
    maxLv: number;
    levels: UltLevelDef[];
  };
}

export const CLASS_SKILL_TREES: Record<ClassId, ClassSkillTree> = {
  warrior: {
    main: {
      name: 'Quét Tre Ngà',
      icon: '🗡️',
      maxLv: 5,
      levels: [
        { lv: 1, mult: 1.8, cd: 6000, desc: 'Vung kiếm tre quét vòng quanh người, gây 180% sát thương.' },
        { lv: 2, mult: 2.1, cd: 5500, desc: 'Kiếm khí sắc lẹm, gây 210% sát thương và giảm 0.5s hồi chiêu.' },
        { lv: 3, mult: 2.4, cd: 5000, desc: 'Tốc độ kiếm phong gia tăng, gây 240% sát thương và giảm 0.5s hồi chiêu.' },
        { lv: 4, mult: 2.7, cd: 4500, desc: 'Uy lực bạt sơn, gây 270% sát thương và giảm 0.5s hồi chiêu.' },
        { lv: 5, mult: 3.0, cd: 4000, desc: 'Đại thành tuyệt kỹ: Gây 300% sát thương, hất văng quái và làm choáng 0.6s!', special: 'Choáng 0.6s & Đẩy lùi quái' },
      ],
    },
    ult: {
      name: 'Phù Đổng Thiên Vương',
      icon: '🐎',
      maxLv: 3,
      levels: [
        { lv: 1, mult: 3.0, radius: 110, desc: 'Nện đất uy lực Phù Đổng: 300% sát thương vùng 110px, choáng quái 1.2s.' },
        { lv: 2, mult: 3.6, radius: 125, desc: 'Địa chấn rền vang: 360% sát thương vùng 125px, choáng quái 1.5s.' },
        { lv: 3, mult: 4.2, radius: 140, desc: 'Thần Gióng giáng thế: 420% sát thương vùng 140px, choáng quái 1.8s. Uy chấn bát phương!', special: 'Vùng nổ siêu rộng 140px & Choáng 1.8s' },
      ],
    },
  },
  archer: {
    main: {
      name: 'Nỏ Liên Châu',
      icon: '🏹',
      maxLv: 5,
      levels: [
        { lv: 1, mult: 0.9, cd: 5000, desc: 'Bắn 5 mũi tên hình quạt, mỗi mũi gây 90% sát thương.' },
        { lv: 2, mult: 1.0, cd: 4600, desc: 'Kỹ thuật kéo dây mượt hơn, gây 100% sát thương mỗi mũi, hồi chiêu nhanh hơn.' },
        { lv: 3, mult: 1.1, cd: 4200, desc: 'Tên tẩm hàn thiết, gây 110% sát thương và tăng phạm vi phủ quạt.' },
        { lv: 4, mult: 1.2, cd: 3800, desc: 'Tốc độ rút tên phi phàm, gây 120% sát thương, tên bay nhanh hơn.' },
        { lv: 5, mult: 1.3, cd: 3400, desc: 'Vạn tiễn tề phát: Bắn 7 mũi tên hình quạt (130% dmg/mũi), xuyên thấu quái đầu tiên!', special: 'Bắn 7 mũi tên & Xuyên thấu' },
      ],
    },
    ult: {
      name: 'Nỏ Thần Kim Quy',
      icon: '🐢',
      maxLv: 3,
      levels: [
        { lv: 1, mult: 0.6, radius: 90, duration: 3000, desc: 'Mưa tên vàng 3 giây (mỗi 0.25s gây 60% sát thương), vùng 90px.' },
        { lv: 2, mult: 0.75, radius: 105, duration: 3500, desc: 'Mưa tên vàng 3.5 giây (mỗi 0.25s gây 75% sát thương), vùng 105px.' },
        { lv: 3, mult: 0.9, radius: 120, duration: 4000, desc: 'Thần Nỏ uy linh 4 giây (mỗi 0.25s gây 90% sát thương), vùng 120px. Bách phát bách trúng!', special: 'Kéo dài 4 giây & Phủ diện rộng 120px' },
      ],
    },
  },
  mage: {
    main: {
      name: 'Lôi Phù',
      icon: '⚡',
      maxLv: 5,
      levels: [
        { lv: 1, mult: 2.5, cd: 7000, desc: 'Sau 0.6s, sấm sét giáng xuống vùng 72px gây 250% sát thương.' },
        { lv: 2, mult: 2.8, cd: 6400, desc: 'Lôi quang mạnh mẽ, vùng 78px gây 280% sát thương.' },
        { lv: 3, mult: 3.1, cd: 5800, desc: 'Triệu hồi thiên lôi nhanh hơn (0.5s), vùng 84px gây 310% sát thương.' },
        { lv: 4, mult: 3.5, cd: 5200, desc: 'Sấm sét kinh thiên, vùng 90px gây 350% sát thương.' },
        { lv: 5, mult: 4.0, cd: 4600, desc: 'Thiên kiếp giáng lâm (0.4s), vùng 96px gây 400% sát thương, tạo lôi trận làm chậm 50%!', special: 'Sấm giáng 0.4s, 400% dmg & Làm chậm 50%' },
      ],
    },
    ult: {
      name: 'Thủy Long Quyển',
      icon: '🐉',
      maxLv: 3,
      levels: [
        { lv: 1, mult: 0.8, radius: 70, duration: 4000, desc: '6 dòng nước xoay quanh người 4s, chạm gây 80% sát thương và làm chậm 40%.' },
        { lv: 2, mult: 1.0, radius: 80, duration: 5000, desc: '7 dòng nước xoay quanh người 5s, chạm gây 100% sát thương và làm chậm 50%.' },
        { lv: 3, mult: 1.25, radius: 90, duration: 6000, desc: 'Long Vương thức tỉnh: 8 dòng nước xoay 6s, chạm gây 125% sát thương và làm chậm 60%!', special: 'Xoay 6 giây, 8 dòng nước & Làm chậm 60%' },
      ],
    },
  },
};

/** Chỉ số nhân vật theo cấp + vũ khí + số mảnh Trống Đồng (+5% máu/mảnh) + Tranh Đông Hồ + Tâm Pháp. */
export function statsFor(
  cls: ClassId,
  level: number,
  weaponKey: string | null,
  drumPiecesCount = 0,
  prog?: Record<string, number>,
  passives?: { atk?: number; def?: number; spd?: number },
) {
  const c = CLASSES[cls];
  const w = weaponKey ? WEAPONS[weaponKey] : undefined;
  const lv = level - 1;
  const baseHp = Math.round(c.hp * (1 + 0.12 * lv));
  let maxHp = Math.round(baseHp * (1 + 0.05 * Math.max(0, drumPiecesCount)));
  let atk = Math.round(c.atk * (1 + 0.1 * lv)) + (w?.atk ?? 0);
  let def = c.def + Math.floor(lv * 0.8);
  let speed = c.speed;

  // Thưởng chỉ số vĩnh viễn từ Sổ Tay Tranh Đông Hồ
  if (prog?.codex_chan_trau) maxHp += 30; // Chăn Trâu Thổi Sáo
  if (prog?.codex_hung_dua) atk += 3;    // Hứng Dừa
  if (prog?.codex_dam_cuoi_chuot) def += 2; // Đám Cưới Chuột
  if (prog?.codex_vinh_hoa) speed = Math.round(speed * 1.05); // Vinh Hoa Phú Quý

  // Thưởng chỉ số từ Nội Công Tâm Pháp
  if (passives?.atk) atk += passives.atk * 3;
  if (passives?.def) { def += passives.def * 2; maxHp += passives.def * 20; }
  if (passives?.spd) speed = Math.round(speed * (1 + 0.03 * passives.spd));

  return {
    maxHp,
    atk,
    def,
    speed,
    range: c.range + (w?.range ?? 0),
    atkCd: Math.max(250, c.atkCd + (w?.atkCd ?? 0)),
    aoe: c.aoe + (w?.aoe ?? 0),
  };
}

/** Công thức sát thương. rnd trả về số trong [0,1). */
export function rollDamage(atk: number, mult: number, def: number, rnd: () => number) {
  const base = Math.max(1, atk * mult - def * 0.5);
  const crit = rnd() < 0.1;
  const v = Math.max(1, Math.round(base * (0.9 + rnd() * 0.2) * (crit ? 1.5 : 1)));
  return { v, crit };
}
