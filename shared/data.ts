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

export interface MonsterDef {
  kind: 'slime' | 'wolf' | 'boss';
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
}

export const MONSTERS: Record<'slime' | 'wolf' | 'boss', MonsterDef> = {
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
};

// Đòn Rễ Đâm của Chúa Mộc Tinh (báo trước vòng tròn rồi mới gây sát thương)
export const BOSS_SLAM = { every: 6500, telegraphMs: 1200, radius: 90, mult: 2.0 };

export const ITEMS = {
  potion: { key: 'potion', name: 'Bình máu' },
  leaf: { key: 'leaf', name: 'Lá Đa Cổ' },
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

/** Chỉ số nhân vật theo cấp + vũ khí + số mảnh Trống Đồng (+5% máu/mảnh). */
export function statsFor(cls: ClassId, level: number, weaponKey: string | null, drumPiecesCount = 0) {
  const c = CLASSES[cls];
  const w = weaponKey ? WEAPONS[weaponKey] : undefined;
  const lv = level - 1;
  const baseHp = Math.round(c.hp * (1 + 0.12 * lv));
  const maxHp = Math.round(baseHp * (1 + 0.05 * Math.max(0, drumPiecesCount)));
  return {
    maxHp,
    atk: Math.round(c.atk * (1 + 0.1 * lv)) + (w?.atk ?? 0),
    def: c.def + Math.floor(lv * 0.8),
    speed: c.speed,
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
