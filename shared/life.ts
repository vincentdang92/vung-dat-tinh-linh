// Nghề Sống: câu cá, nấu nướng (Giai đoạn A), săn bắt & đặt bẫy (Giai đoạn B). Sau này thêm nuôi gà, trồng lúa.
// Dữ liệu + hàm thuần dùng chung cho server (quyết định thật) và client (hiển thị, gợi ý nút).
import { TILE } from './constants.ts';
import { T, tileAt, isSafe, isMapId } from './map.ts';
import type { GameMap, MapId } from './map.ts';

export type LifeSkill = 'fish' | 'cook' | 'hunt' | 'farm';
export const LIFE_SKILLS: LifeSkill[] = ['fish', 'hunt', 'cook', 'farm'];
export const LIFE_SKILL_NAMES: Record<LifeSkill, string> = {
  fish: 'Câu cá',
  hunt: 'Săn bắt',
  cook: 'Nấu nướng',
  farm: 'Canh nông',
};

/** XP nghề cần để đạt cấp 1..10 (cấp nghề tách khỏi cấp chiến đấu). */
const LIFE_XP = [0, 30, 80, 160, 280, 450, 680, 980, 1360, 1850];
export const LIFE_MAX_LV = LIFE_XP.length;
export function lifeLevel(xp = 0): number {
  let lv = 1;
  for (let i = 1; i < LIFE_XP.length; i++) if (xp >= LIFE_XP[i]) lv = i + 1;
  return lv;
}
/** XP cần để lên cấp tiếp theo (null nếu đã tối đa). */
export function lifeNext(xp = 0): number | null {
  const lv = lifeLevel(xp);
  return lv >= LIFE_MAX_LV ? null : LIFE_XP[lv];
}

// ------------------------------------------------------------ Vật phẩm Giỏ Tre

export type ItemKind = 'fish' | 'meat' | 'food' | 'mat' | 'junk';
export type FishTier = 'common' | 'uncommon' | 'rare' | 'legend';

export interface LifeItem {
  key: string;
  name: string;
  icon: string;
  kind: ItemKind;
  /** Giá bán cho NPC (0 = không bán được, chỉ bỏ đi). */
  sell: number;
  tier?: FishTier;
  /** Cân nặng ngẫu nhiên khi câu (kg). */
  kg?: [number, number];
  desc?: string;
  /** Đơn vị đếm riêng (mặc định theo loại: con, phần, cành…). */
  unit?: string;
}

export const LIFE_ITEMS: Record<string, LifeItem> = {
  // Thuỷ sản
  ca_ro: { key: 'ca_ro', name: 'Cá rô đồng', icon: '🐟', kind: 'fish', tier: 'common', sell: 3, kg: [0.1, 0.4] },
  ca_diec: { key: 'ca_diec', name: 'Cá diếc', icon: '🐟', kind: 'fish', tier: 'common', sell: 3, kg: [0.1, 0.35] },
  tom: { key: 'tom', name: 'Tôm càng', icon: '🦐', kind: 'fish', tier: 'common', sell: 3, kg: [0.05, 0.2] },
  cua_dong: { key: 'cua_dong', name: 'Cua đồng', icon: '🦀', kind: 'fish', tier: 'common', sell: 3, kg: [0.05, 0.15] },
  luon: { key: 'luon', name: 'Lươn đồng', icon: '🐍', kind: 'fish', tier: 'uncommon', sell: 7, kg: [0.2, 0.6], desc: 'Hay ra kiếm ăn ban đêm' },
  ca_tre: { key: 'ca_tre', name: 'Cá trê', icon: '🐟', kind: 'fish', tier: 'uncommon', sell: 6, kg: [0.3, 1.2], desc: 'Hay ra kiếm ăn ban đêm' },
  ca_chep: { key: 'ca_chep', name: 'Cá chép', icon: '🎏', kind: 'fish', tier: 'rare', sell: 10, kg: [0.8, 3.5] },
  ca_qua: { key: 'ca_qua', name: 'Cá quả (cá lóc)', icon: '🐟', kind: 'fish', tier: 'rare', sell: 12, kg: [0.6, 2.8] },
  ca_chep_vang: {
    key: 'ca_chep_vang', name: 'Cá Chép Vàng', icon: '✨', kind: 'fish', tier: 'legend', sell: 0, kg: [2, 6],
    desc: 'Cá chép đưa Ông Táo về trời. Đem đến Ông Táo để phóng sinh.',
  },
  // Nguyên liệu & rác
  cui: { key: 'cui', name: 'Cành củi', icon: '🪵', kind: 'mat', sell: 1, desc: 'Nhóm lửa trại' },
  dep_rach: { key: 'dep_rach', name: 'Chiếc dép rách', icon: '🩴', kind: 'junk', sell: 0, desc: 'Ai vứt xuống ao thế này?' },
  bay: { key: 'bay', name: 'Bẫy thòng lọng', icon: '🪢', kind: 'mat', sell: 0, unit: 'cái', desc: 'Đặt ở bãi cỏ ngoài làng, quay lại sau 5–15 phút để thu' },
  // Săn bắt
  thit_tho: { key: 'thit_tho', name: 'Thịt thỏ rừng', icon: '🐇', kind: 'meat', sell: 4 },
  thit_ga: { key: 'thit_ga', name: 'Thịt gà rừng', icon: '🐓', kind: 'meat', sell: 5 },
  thit_le: { key: 'thit_le', name: 'Thịt le le', icon: '🦆', kind: 'meat', sell: 5, desc: 'Le le là loài vịt trời nhỏ ở đầm sen' },
  thit_lon: { key: 'thit_lon', name: 'Thịt lợn rừng', icon: '🐗', kind: 'meat', sell: 9 },
  long_ga: { key: 'long_ga', name: 'Lông đuôi gà rừng', icon: '🪶', kind: 'mat', sell: 4, unit: 'chiếc', desc: 'Lông óng ả, các cô hay cài lên nón' },
  nanh_lon: { key: 'nanh_lon', name: 'Nanh lợn rừng', icon: '🦷', kind: 'mat', sell: 15, unit: 'chiếc', desc: 'Chiến tích của thợ săn gan dạ' },
  // Canh nông: Giống, nông sản, chăn nuôi
  giong_te: { key: 'giong_te', name: 'Giống lúa tẻ', icon: '🌾', kind: 'mat', sell: 2, desc: 'Lúa tẻ bông dài hạt chắc, gieo ngoài ruộng Vườn Nhà' },
  giong_nep: { key: 'giong_nep', name: 'Giống nếp cái hoa vàng', icon: '🌾', kind: 'mat', sell: 4, desc: 'Đặc sản nếp thơm dẻo, gieo ngoài ruộng Vườn Nhà' },
  thoc: { key: 'thoc', name: 'Thóc tẻ', icon: '🌾', kind: 'mat', sell: 3, desc: 'Thóc vàng óng, xay xát ra gạo tẻ và cám' },
  thoc_nep: { key: 'thoc_nep', name: 'Thóc nếp cái hoa vàng', icon: '🌾', kind: 'mat', sell: 5, desc: 'Thóc nếp thơm dẻo, đồ xôi ngày hội' },
  gao_te: { key: 'gao_te', name: 'Gạo tẻ', icon: '🍚', kind: 'mat', sell: 4, desc: 'Hạt ngọc trời ban, nấu cơm dẻo trắng ngần' },
  gao_nep: { key: 'gao_nep', name: 'Gạo nếp cái hoa vàng', icon: '🍚', kind: 'mat', sell: 6, desc: 'Hạt nếp tròn mẩy, đồ xôi ngọt thơm' },
  cam_gao: { key: 'cam_gao', name: 'Cám gạo', icon: '🥣', kind: 'mat', sell: 2, desc: 'Cám gạo thơm, thức ăn bổ dưỡng cho đàn gà' },
  rom: { key: 'rom', name: 'Rơm vàng', icon: '🌾', kind: 'mat', sell: 1, desc: 'Rơm rạ phơi khô, lót chuồng gà hoặc đun bếp' },
  ga_con: { key: 'ga_con', name: 'Gà con giống', icon: '🐥', kind: 'mat', sell: 6, desc: 'Gà Ri lông vàng óng, thả vào chuồng để nuôi' },
  trung_ga: { key: 'trung_ga', name: 'Trứng gà ta', icon: '🥚', kind: 'food', sell: 4, desc: 'Trứng gà vỏ hồng, lòng đỏ tươi ngon' },
  trung_hai_long: { key: 'trung_hai_long', name: 'Trứng gà hai lòng', icon: '✨', kind: 'food', sell: 15, desc: 'Trứng gà hai lòng đỏ cực hiếm, mang lại điềm lành' },
  phan_ga: { key: 'phan_ga', name: 'Phân chuồng hoai mục', icon: '💩', kind: 'mat', sell: 2, desc: 'Bón lót cho ruộng lúa giúp tăng 25% sản lượng' },
  // Món ăn
  ca_nuong: { key: 'ca_nuong', name: 'Cá nướng trui', icon: '🍢', kind: 'food', sell: 6 },
  tom_nuong: { key: 'tom_nuong', name: 'Tôm nướng', icon: '🍤', kind: 'food', sell: 6 },
  luon_nuong: { key: 'luon_nuong', name: 'Lươn nướng lá lốt', icon: '🥓', kind: 'food', sell: 16 },
  canh_cua: { key: 'canh_cua', name: 'Canh cua rau đay', icon: '🍲', kind: 'food', sell: 12 },
  ca_kho: { key: 'ca_kho', name: 'Cá kho tộ', icon: '🍛', kind: 'food', sell: 28 },
  canh_chua: { key: 'canh_chua', name: 'Canh chua cá', icon: '🥣', kind: 'food', sell: 30 },
  tho_nuong: { key: 'tho_nuong', name: 'Thỏ nướng sả ớt', icon: '🍖', kind: 'food', sell: 10 },
  ga_nuong: { key: 'ga_nuong', name: 'Gà rừng nướng lá chanh', icon: '🍗', kind: 'food', sell: 14 },
  le_om: { key: 'le_om', name: 'Le le om chuối đậu', icon: '🍲', kind: 'food', sell: 18 },
  lon_nuong: { key: 'lon_nuong', name: 'Lợn rừng nướng riềng mẻ', icon: '🥩', kind: 'food', sell: 26 },
  trung_luoc: { key: 'trung_luoc', name: 'Trứng luộc nước dừa', icon: '🥚', kind: 'food', sell: 8 },
  com_nam: { key: 'com_nam', name: 'Cơm nắm muối vừng', icon: '🍙', kind: 'food', sell: 14 },
  xoi_ga: { key: 'xoi_ga', name: 'Xôi gà nếp cái hoa vàng', icon: '🍛', kind: 'food', sell: 24 },
};

// ------------------------------------------------------------ Món ăn: hiệu ứng

export type BuffStat = 'atk' | 'def' | 'hp' | 'khi' | 'speed';
export interface FoodDef {
  /** Hồi ngay % máu tối đa. */
  heal?: number;
  /** Hồi ngay Khí. */
  khi?: number;
  /** Buff (chỉ 1 buff ăn uống một lúc; ăn món mới thay món cũ). */
  buff?: { stat: BuffStat; pct: number; ms: number; label: string };
  desc: string;
}

const MIN = 60_000;
export const FOODS: Record<string, FoodDef> = {
  trung_ga: { heal: 0.1, khi: 15, desc: 'Hồi 10% máu và 15 Khí' },
  trung_hai_long: { heal: 0.3, khi: 50, desc: 'Hồi 30% máu và 50 Khí' },
  ca_nuong: { heal: 0.25, desc: 'Hồi 25% máu' },
  tom_nuong: { khi: 30, desc: 'Hồi 30 Khí' },
  luon_nuong: { buff: { stat: 'atk', pct: 0.08, ms: 10 * MIN, label: '+8% Công' }, desc: '+8% Công trong 10 phút' },
  canh_cua: { heal: 0.1, buff: { stat: 'def', pct: 0.15, ms: 10 * MIN, label: '+15% Thủ' }, desc: 'Hồi 10% máu, +15% Thủ trong 10 phút' },
  ca_kho: { buff: { stat: 'khi', pct: 0.5, ms: 15 * MIN, label: '+1 Khí mỗi 2 giây' }, desc: 'Tự hồi 1 Khí mỗi 2 giây trong 15 phút' },
  canh_chua: { heal: 0.2, buff: { stat: 'hp', pct: 0.12, ms: 15 * MIN, label: '+12% Máu tối đa' }, desc: 'Hồi 20% máu, +12% Máu tối đa trong 15 phút' },
  tho_nuong: { heal: 0.4, desc: 'Hồi 40% máu' },
  ga_nuong: { heal: 0.1, buff: { stat: 'speed', pct: 0.06, ms: 10 * MIN, label: '+6% Tốc chạy' }, desc: 'Hồi 10% máu, +6% Tốc chạy trong 10 phút' },
  le_om: { heal: 0.15, khi: 40, desc: 'Hồi 15% máu và 40 Khí' },
  lon_nuong: { buff: { stat: 'atk', pct: 0.1, ms: 15 * MIN, label: '+10% Công' }, desc: '+10% Công trong 15 phút' },
  trung_luoc: { heal: 0.15, khi: 25, desc: 'Hồi 15% máu và 25 Khí' },
  com_nam: { heal: 0.2, buff: { stat: 'hp', pct: 0.1, ms: 15 * MIN, label: '+10% Máu tối đa' }, desc: 'Hồi 20% máu, +10% Máu tối đa trong 15 phút' },
  xoi_ga: { heal: 0.25, buff: { stat: 'atk', pct: 0.12, ms: 15 * MIN, label: '+12% Công' }, desc: 'Hồi 25% máu, +12% Công trong 15 phút' },
};

/** Áp buff ăn uống lên chỉ số (vừa phải, cho vui). */
export function applyFoodBuff<S extends { maxHp: number; atk: number; def: number; speed: number }>(s: S, buffKey: string | undefined): S {
  const b = buffKey ? FOODS[buffKey]?.buff : undefined;
  if (!b) return s;
  if (b.stat === 'atk') s.atk += Math.max(1, Math.round(s.atk * b.pct));
  else if (b.stat === 'def') s.def += Math.max(1, Math.round(s.def * b.pct));
  else if (b.stat === 'hp') s.maxHp += Math.max(1, Math.round(s.maxHp * b.pct));
  else if (b.stat === 'speed') s.speed = Math.round(s.speed * (1 + b.pct));
  return s;
}

// ------------------------------------------------------------ Công thức nấu

export interface Recipe {
  key: string; // = mã món ăn làm ra
  name: string;
  /** Mỗi dòng: lấy đủ `qty` từ một trong các nguyên liệu `keys` (ưu tiên theo thứ tự). */
  needs: { keys: string[]; qty: number }[];
  minLv: number;
  xp: number;
  /** 'any': nướng được ở lửa trại hoặc bếp; 'bep': cần nồi niêu ở Bếp Ông Táo. */
  fire: 'any' | 'bep';
}

export const RECIPES: Record<string, Recipe> = {
  ca_nuong: { key: 'ca_nuong', name: 'Cá nướng trui', needs: [{ keys: ['ca_ro', 'ca_diec', 'ca_tre'], qty: 1 }], minLv: 1, xp: 6, fire: 'any' },
  tom_nuong: { key: 'tom_nuong', name: 'Tôm nướng', needs: [{ keys: ['tom'], qty: 2 }], minLv: 1, xp: 6, fire: 'any' },
  trung_luoc: { key: 'trung_luoc', name: 'Trứng luộc nước dừa', needs: [{ keys: ['trung_ga', 'trung_hai_long'], qty: 1 }], minLv: 1, xp: 6, fire: 'any' },
  tho_nuong: { key: 'tho_nuong', name: 'Thỏ nướng sả ớt', needs: [{ keys: ['thit_tho'], qty: 1 }], minLv: 1, xp: 7, fire: 'any' },
  canh_cua: { key: 'canh_cua', name: 'Canh cua rau đay', needs: [{ keys: ['cua_dong'], qty: 2 }], minLv: 2, xp: 10, fire: 'bep' },
  ga_nuong: { key: 'ga_nuong', name: 'Gà rừng nướng lá chanh', needs: [{ keys: ['thit_ga'], qty: 1 }], minLv: 2, xp: 10, fire: 'any' },
  com_nam: { key: 'com_nam', name: 'Cơm nắm muối vừng', needs: [{ keys: ['gao_te'], qty: 2 }], minLv: 2, xp: 10, fire: 'bep' },
  luon_nuong: { key: 'luon_nuong', name: 'Lươn nướng lá lốt', needs: [{ keys: ['luon'], qty: 1 }], minLv: 3, xp: 12, fire: 'any' },
  xoi_ga: { key: 'xoi_ga', name: 'Xôi gà nếp cái hoa vàng', needs: [{ keys: ['gao_nep'], qty: 2 }, { keys: ['thit_ga'], qty: 1 }], minLv: 3, xp: 15, fire: 'bep' },
  le_om: { key: 'le_om', name: 'Le le om chuối đậu', needs: [{ keys: ['thit_le'], qty: 1 }], minLv: 3, xp: 14, fire: 'bep' },
  ca_kho: { key: 'ca_kho', name: 'Cá kho tộ', needs: [{ keys: ['ca_chep', 'ca_qua'], qty: 1 }], minLv: 4, xp: 18, fire: 'bep' },
  lon_nuong: { key: 'lon_nuong', name: 'Lợn rừng nướng riềng mẻ', needs: [{ keys: ['thit_lon'], qty: 1 }], minLv: 4, xp: 20, fire: 'any' },
  canh_chua: {
    key: 'canh_chua', name: 'Canh chua cá',
    needs: [{ keys: ['ca_tre', 'ca_qua', 'ca_chep'], qty: 1 }, { keys: ['tom'], qty: 1 }], minLv: 5, xp: 22, fire: 'bep',
  },
};

// ------------------------------------------------------------ Giỏ Tre (túi nguyên liệu riêng)

export const BAG_KINDS = 36; // số loại khác nhau
export const STACK_MAX = 99;

export type Bag = Record<string, number>;
export const bagCount = (bag: Bag, key: string) => bag[key] ?? 0;
export function bagCanAdd(bag: Bag, key: string, qty: number): boolean {
  const has = bag[key] ?? 0;
  if (has + qty > STACK_MAX) return false;
  if (has > 0) return true;
  return Object.keys(bag).filter((k) => bag[k] > 0).length < BAG_KINDS;
}
export function bagAdd(bag: Bag, key: string, qty: number) { bag[key] = (bag[key] ?? 0) + qty; }
export function bagTake(bag: Bag, key: string, qty: number): boolean {
  if ((bag[key] ?? 0) < qty) return false;
  bag[key] -= qty;
  if (bag[key] <= 0) delete bag[key];
  return true;
}

/** Chọn nguyên liệu cho công thức (có thể trộn các loại trong cùng một dòng). null nếu thiếu. */
export function pickIngredients(bag: Bag, r: Recipe): Record<string, number> | null {
  const left: Bag = { ...bag };
  const use: Record<string, number> = {};
  for (const need of r.needs) {
    let q = need.qty;
    for (const k of need.keys) {
      const take = Math.min(q, left[k] ?? 0);
      if (take > 0) { left[k] -= take; use[k] = (use[k] ?? 0) + take; q -= take; }
      if (!q) break;
    }
    if (q > 0) return null;
  }
  return use;
}

// ------------------------------------------------------------ Câu cá

export type FishSpot = 'ao' | 'ao_sen' | 'song' | 'ben';
export const SPOT_NAMES: Record<FishSpot, string> = {
  ao: 'Ao Làng', ao_sen: 'Ao Sen', song: 'Sông Ma', ben: 'Bến Đò',
};

interface FishEntry { key: string; w: number; night?: true; minLv?: number }
export const FISH_TABLE: Record<FishSpot, FishEntry[]> = {
  ao: [
    { key: 'ca_ro', w: 40 }, { key: 'ca_diec', w: 30 }, { key: 'cua_dong', w: 15 },
    { key: 'ca_chep', w: 6, minLv: 3 }, { key: 'cui', w: 10 }, { key: 'dep_rach', w: 5 },
  ],
  ao_sen: [
    { key: 'tom', w: 30 }, { key: 'cua_dong', w: 25 }, { key: 'ca_ro', w: 20 }, { key: 'luon', w: 12, night: true },
    { key: 'ca_chep', w: 5, minLv: 2 }, { key: 'cui', w: 8 }, { key: 'dep_rach', w: 5 },
  ],
  song: [
    { key: 'ca_chep', w: 25 }, { key: 'ca_qua', w: 18 }, { key: 'ca_tre', w: 15, night: true }, { key: 'luon', w: 10 },
    { key: 'tom', w: 15 }, { key: 'cui', w: 10 }, { key: 'dep_rach', w: 5 },
  ],
  ben: [
    { key: 'tom', w: 25 }, { key: 'ca_ro', w: 15 }, { key: 'ca_chep', w: 22 }, { key: 'ca_qua', w: 14, minLv: 2 },
    { key: 'ca_tre', w: 10, night: true }, { key: 'cui', w: 10 }, { key: 'dep_rach', w: 4 },
  ],
};

export const FISH = {
  /** Cá cắn câu sau 3–12 giây. */
  biteMin: 3000,
  biteMax: 12_000,
  /** Cửa sổ bấm "Giật!" (ms), rộng thêm theo cấp Câu cá. */
  window: (lv: number) => 700 + 40 * (lv - 1),
  /** Dung sai độ trễ mạng phía server. */
  lag: 300,
  /** Cá to: khoảng nghỉ giữa các lần giật tiếp. */
  tugMin: 500,
  tugMax: 1300,
  /** Phải ngoài giao tranh bao lâu mới thả câu được. */
  calmMs: 3000,
  /** Khoảng cách tối đa từ mép nhân vật tới ô nước. */
  reach: 26,
  /** Ngồi câu cùng bạn trong bán kính này: cá cắn nhanh hơn. */
  socialR: 96,
  socialMult: 0.85,
  /** Tỉ lệ Cá Chép Vàng: 0,5% + 0,1% mỗi cấp nghề. */
  legend: (lv: number) => 0.005 + 0.001 * (lv - 1),
};

export const TUGS: Record<FishTier, number> = { common: 1, uncommon: 1, rare: 2, legend: 3 };
export const FISH_XP: Record<FishTier | 'junk', number> = { common: 5, uncommon: 8, rare: 14, legend: 40, junk: 2 };

/** Giờ Việt Nam (UTC+7) từ mốc ms. */
export const vnHour = (now: number) => new Date(now + 7 * 3600_000).getUTCHours();
export const vnDay = (now: number) => new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
export const isNight = (now: number) => { const h = vnHour(now); return h >= 18 || h < 6; };

/**
 * Chỗ câu gần nhân vật: ô nước gần nhất trong tầm với. Trả về loại chỗ câu và tâm ô nước
 * (làm vị trí phao). null nếu không đứng cạnh nước.
 */
export function fishSpotAt(map: GameMap, x: number, y: number, radius = 10): { spot: FishSpot; x: number; y: number } | null {
  const tx0 = Math.floor(x / TILE), ty0 = Math.floor(y / TILE);
  let best: { d: number; tx: number; ty: number } | null = null;
  for (let ty = ty0 - 2; ty <= ty0 + 2; ty++) {
    for (let tx = tx0 - 2; tx <= tx0 + 2; tx++) {
      if (tileAt(map, tx, ty) !== T.WATER) continue;
      const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
      const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      const d = Math.hypot(x - cx, y - cy) - radius;
      if (d <= FISH.reach && (!best || d < best.d)) best = { d, tx, ty };
    }
  }
  if (!best) return null;
  let spot: FishSpot = 'ao';
  if (map.id === 'dam_sen') spot = best.ty >= 44 ? 'ben' : best.ty >= 27 ? 'ao_sen' : 'song';
  return { spot, x: best.tx * TILE + TILE / 2, y: best.ty * TILE + TILE / 2 };
}

/** Quay loài cá theo chỗ câu, giờ và cấp nghề. */
export function rollFish(spot: FishSpot, lv: number, night: boolean, rnd: () => number): string {
  if (rnd() < FISH.legend(lv)) return 'ca_chep_vang';
  const pool = FISH_TABLE[spot].filter((e) => (!e.night || night) && (e.minLv ?? 1) <= lv);
  const total = pool.reduce((s, e) => s + e.w, 0);
  let r = rnd() * total;
  for (const e of pool) { r -= e.w; if (r < 0) return e.key; }
  return pool[pool.length - 1].key;
}

/** Số lần phải giật trúng (cá to phải giật nhiều lần). */
export const tugsFor = (key: string) => TUGS[LIFE_ITEMS[key]?.tier ?? 'common'];

// ------------------------------------------------------------ Săn bắt & đặt bẫy

/**
 * Thú rừng (quái hiền, cờ `critter` trong MONSTERS): hạ được thì thịt vào thẳng Giỏ Tre của người
 * gây nhiều sát thương nhất, không rơi vàng/vũ khí (tránh cày vàng bằng thú hiền).
 */
export const CRITTER_LOOT: Record<string, { meat: string; xp: number; extra?: { key: string; p: number } }> = {
  rabbit: { meat: 'thit_tho', xp: 6 },
  fowl: { meat: 'thit_ga', xp: 6, extra: { key: 'long_ga', p: 0.3 } },
  lele: { meat: 'thit_le', xp: 7 },
  boar: { meat: 'thit_lon', xp: 16, extra: { key: 'nanh_lon', p: 0.25 } },
};

/** Tên con vật theo loại thịt (để báo "Bẫy được Thỏ rừng"). */
export const CATCH_NAME: Record<string, string> = {
  thit_tho: 'Thỏ rừng', thit_ga: 'Gà rừng', thit_le: 'Le le', thit_lon: 'Lợn rừng',
};

export const HUNT = {
  /** Mỗi cấp Săn bắt +6% cơ hội được thêm 1 phần thịt. */
  bonus: (lv: number) => 0.06 * (lv - 1),
  /** Bẫy sập sau 5–15 phút thực, nhanh hơn 4% mỗi cấp. */
  trapMin: 5 * MIN,
  trapMax: 15 * MIN,
  trapSpeed: (lv: number) => 1 - 0.04 * (lv - 1),
  /** Số bẫy đặt cùng lúc: 2 → 3 (cấp 4) → 4 (cấp 7). */
  trapCount: (lv: number) => 2 + Math.floor((lv - 1) / 3),
  /** Các bẫy phải cách nhau; đứng trong tầm này mới thu được. */
  trapGap: 48,
  trapReach: 44,
  trapXp: 6,
};
export const BAY_PRICE = 6;

interface TrapEntry { key: string; w: number }
/** Bẫy sập được con gì theo bản đồ ('' = con mồi giãy thoát). */
export const TRAP_TABLE: Record<MapId, TrapEntry[]> = {
  lang_tre: [{ key: 'thit_tho', w: 50 }, { key: 'thit_ga', w: 35 }, { key: '', w: 15 }],
  dam_sen: [{ key: 'thit_le', w: 60 }, { key: 'thit_tho', w: 20 }, { key: '', w: 20 }],
};

export function rollTrap(map: MapId, lv: number, rnd: () => number): string {
  const pool = TRAP_TABLE[map].map((e) => (e.key ? e : { ...e, w: e.w * Math.max(0, 1 - 0.08 * (lv - 1)) }));
  const total = pool.reduce((s, e) => s + e.w, 0);
  let r = rnd() * total;
  for (const e of pool) { r -= e.w; if (r < 0) return e.key; }
  return pool[0].key;
}

/** Chỗ đặt bẫy: bãi cỏ ngoài làng (không trong vùng an toàn, không trong đấu trường boss). */
export function trapSpotOk(map: GameMap, x: number, y: number): boolean {
  if (isSafe(map, x, y)) return false;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (ty <= map.arenaToRow) return false;
  const t = tileAt(map, tx, ty);
  return t === T.GRASS || t === T.GRASS2 || t === T.FLOWER;
}

// ------------------------------------------------------------ Kinh tế

/** Mỗi ngày bán nông/thuỷ sản cho NPC tối đa chừng này vàng; vượt mức giá còn 1/4. */
export const SELL_DAILY_CAP = 300;
export const unitSellPrice = (key: string, soldToday: number) => {
  const base = LIFE_ITEMS[key]?.sell ?? 0;
  if (base <= 0) return 0;
  return soldToday >= SELL_DAILY_CAP ? Math.max(1, Math.floor(base / 4)) : base;
};
export const CUI_PRICE = 3;

// ------------------------------------------------------------ Nấu nướng & lửa trại

export const COOK_MS = 2000;
export const COOK_RANGE = 70; // đứng cách lửa/bếp
export const CAMPFIRE_MS = 90_000;
export const EAT_CD = 1500;
/** Nấu cạnh người khác: +50% XP nghề Bếp ("Quây quần bên bếp lửa"). */
export const COOK_SOCIAL_MULT = 1.5;

// ------------------------------------------------------------ Canh Nông: Nuôi Gà & Trồng Lúa Nước

export type CropKind = 'giong_te' | 'giong_nep';
export type PlotState = 'empty' | 'plowed' | 'planted';

export interface PlotData {
  id: number; // 0..7
  state: PlotState;
  crop?: CropKind;
  progress?: number; // 0..1 (1 = chín rộ)
  waterUntil?: number; // ms đất còn ẩm
  fertilized?: boolean; // bón phân gà (+25% sản lượng thóc)
  pest?: boolean; // có sâu bọ / chim sẻ phá lúa
  lastUpdate?: number; // ms
}

export interface ChickenData {
  id: number;
  bornAt: number; // ms sinh ra
  fedTime: number; // ms tổng thời gian được ăn no
  laidTime: number; // ms thời gian ăn no kể từ lần đẻ trứng gần nhất
}

export interface FarmCheer {
  by: string; // tên người chúc
  text: string; // lời chúc / câu ca dao
  time: number; // ms
}

export interface FarmData {
  plots: PlotData[];
  chickens: ChickenData[];
  troughFood: number; // 0..10 lượng thóc/cám trong máng
  troughUntil?: number; // ms khi 1 đơn vị thức ăn hết hạn
  eggs: number; // trứng gà ta chờ nhặt (tối đa 20)
  goldenEggs: number; // trứng hai lòng chờ nhặt
  manure: number; // phân gà chờ dọn (tối đa 10)
  likes: number; // số lượt thả tim
  cheers: FarmCheer[]; // sổ lưu bút (tối đa 20)
  lastUpdate?: number; // ms cập nhật lần cuối
}

export interface FarmVisitSelf {
  ownerName: string;
  farmLv: number;
  plots: PlotData[];
  chickens: ChickenData[];
  troughFood: number;
  eggs: number;
  goldenEggs: number;
  manure: number;
  likes: number;
  cheers: FarmCheer[];
}

export const FARM = {
  plotCount: 8,
  maxChickens: 6,
  maxTrough: 10,
  maxEggs: 20,
  maxManure: 10,
  waterDurationMs: 120_000, // 2 phút mỗi lần tưới nước
  chickGrowMs: 180_000,     // 3 phút ăn no để gà con lớn thành gà đẻ
  eggLayMs: 120_000,        // 2 phút ăn no đẻ 1 quả trứng
  troughPerGrainMs: 180_000,// 1 đơn vị thóc/cám nuôi cả đàn trong 3 phút
  crops: {
    giong_te: { name: 'Lúa tẻ', durationMs: 180_000, yieldKey: 'thoc', yieldQty: 4, strawQty: 2, xp: 12, seedCost: 4 },
    giong_nep: { name: 'Lúa nếp', durationMs: 300_000, yieldKey: 'thoc_nep', yieldQty: 4, strawQty: 2, xp: 18, seedCost: 8 },
  } as Record<CropKind, { name: string; durationMs: number; yieldKey: string; yieldQty: number; strawQty: number; xp: number; seedCost: number }>,
  chickCost: 15,
  socialWaterXp: 2,
  socialWaterGold: 1,
  socialWeedXp: 3,
  socialWeedGold: 2,
};

export const FOLK_CHEERS = [
  'Cày đồng đang buổi ban trưa, mồ hôi thánh thót như mưa ruộng cày.',
  'Ơn trời mưa nắng phải thì, nơi thì bừa cạn nơi thì cày sâu.',
  'Lúa chiêm lấp ló đầu bờ, hễ nghe tiếng sấm phất cờ mà lên.',
  'Gà béo thóc đầy bồ, gia đạo bình an muôn thuở!',
  'Mùa vàng bội thu, cơm dẻo canh ngọt!',
  'Nhất nước, nhì phân, tam cần, tứ giống.',
];

/** Tạo farm mới mặc định */
export function defaultFarm(): FarmData {
  const plots: PlotData[] = [];
  for (let i = 0; i < FARM.plotCount; i++) {
    plots.push({ id: i, state: 'empty' });
  }
  return {
    plots,
    chickens: [],
    troughFood: 0,
    eggs: 0,
    goldenEggs: 0,
    manure: 0,
    likes: 0,
    cheers: [],
  };
}

/** Cập nhật tiến độ lúa nước theo thời gian thực (hỗ trợ offline tuyệt đối) */
export function updateFarmPlots(plots: PlotData[], now: number, rnd: () => number = Math.random) {
  for (const pl of plots) {
    if (pl.state !== 'planted' || !pl.crop) continue;
    const info = FARM.crops[pl.crop];
    if (!info) continue;
    const last = pl.lastUpdate ?? now;
    pl.lastUpdate = now;
    if ((pl.progress ?? 0) >= 1) {
      pl.progress = 1;
      continue;
    }
    if (pl.pest) continue; // có sâu bọ thì dừng lớn

    const dt = Math.max(0, now - last);
    if (dt <= 0) continue;

    const waterUntil = pl.waterUntil ?? 0;
    let wetDt = 0;
    if (waterUntil > last) {
      wetDt = Math.min(now, waterUntil) - last;
    }
    const dryDt = Math.max(0, dt - wetDt);
    const effectiveMs = wetDt + dryDt * 0.5;
    const curProg = pl.progress ?? 0;
    const addProg = effectiveMs / info.durationMs;
    const newProg = Math.min(1, curProg + addProg);

    // Xác suất xuất hiện sâu rầy / chim sẻ khi lớn từ 30% đến 80%
    if (newProg >= 0.3 && newProg < 0.85 && curProg < 0.8 && !pl.pest) {
      if (rnd() < 0.08) {
        pl.pest = true;
      }
    }
    pl.progress = newProg;
  }
}

/** Cập nhật đàn gà theo thời gian thực (hỗ trợ offline tuyệt đối) */
export function updateFarmChickens(farm: FarmData, now: number, rnd: () => number = Math.random) {
  if (!farm.chickens || farm.chickens.length === 0) return;
  const last = farm.lastUpdate ?? now;
  farm.lastUpdate = now;
  const dt = Math.max(0, now - last);
  if (dt <= 0) return;

  // Tính lượng thời gian đàn gà được ăn no
  let remUnitTime = Math.max(0, (farm.troughUntil ?? 0) - last);
  const totalFoodTime = remUnitTime + (farm.troughFood ?? 0) * FARM.troughPerGrainMs;
  const fedDuration = Math.min(dt, totalFoodTime);
  const remainingTotal = totalFoodTime - fedDuration;

  farm.troughFood = Math.min(FARM.maxTrough, Math.floor(remainingTotal / FARM.troughPerGrainMs));
  const remCurrent = remainingTotal % FARM.troughPerGrainMs;
  farm.troughUntil = remCurrent > 0 ? now + remCurrent : 0;

  if (fedDuration <= 0) return;

  for (const c of farm.chickens) {
    const wasAdult = (c.fedTime ?? 0) >= FARM.chickGrowMs;
    c.fedTime = (c.fedTime ?? 0) + fedDuration;
    const isAdult = c.fedTime >= FARM.chickGrowMs;

    let adultFeedMs = 0;
    if (wasAdult) {
      adultFeedMs = fedDuration;
    } else if (isAdult) {
      adultFeedMs = c.fedTime - FARM.chickGrowMs;
    }

    if (adultFeedMs > 0) {
      const totalLaid = (c.laidTime ?? 0) + adultFeedMs;
      const eggsProduced = Math.floor(totalLaid / FARM.eggLayMs);
      c.laidTime = totalLaid % FARM.eggLayMs;

      for (let i = 0; i < eggsProduced; i++) {
        if ((farm.eggs + farm.goldenEggs) < FARM.maxEggs) {
          if (rnd() < 0.08) farm.goldenEggs = (farm.goldenEggs ?? 0) + 1;
          else farm.eggs = (farm.eggs ?? 0) + 1;
        }
        if (farm.manure < FARM.maxManure && rnd() < 0.5) {
          farm.manure = (farm.manure ?? 0) + 1;
        }
      }
    }
  }
}

// ------------------------------------------------------------ Dữ liệu lưu

/** Bẫy đã đặt: mốc giờ thật nên vẫn "sập" khi đang offline. `catch` quay sẵn lúc đặt ('' = sổng). */
export interface TrapData { id: number; map: MapId; x: number; y: number; readyAt: number; catch: string }

export interface LifeData {
  xp: Partial<Record<LifeSkill, number>>;
  bag: Bag;
  /** Buff ăn uống đang có: hết hạn theo giờ thật (ms). */
  buff?: { key: string; until: number };
  sold?: { day: string; gold: number };
  best?: { key: string; kg: number };
  /** Câu đố dân gian đã trả lời trong ngày (mỗi câu 1 lần/ngày). */
  trivia?: { day: string; done: number[] };
  traps?: TrapData[];
  farm?: FarmData;
}

/** Bẫy gửi cho client: chỉ vị trí và thời gian còn lại, không lộ con mồi. */
export interface TrapSelf { id: number; map: MapId; x: number; y: number; left: number }

/** Phần gửi cho client. */
export interface LifeSelf {
  xp: Partial<Record<LifeSkill, number>>;
  bag: Bag;
  buff?: { key: string; left: number };
  soldToday: number;
  best?: { key: string; kg: number };
  triviaDone: number[];
  traps: TrapSelf[];
  farm: FarmData;
}

export function normalizeLife(v: unknown): LifeData {
  const o = (typeof v === 'object' && v !== null && !Array.isArray(v) ? v : {}) as Partial<LifeData>;
  const bag: Bag = {};
  if (o.bag && typeof o.bag === 'object') {
    for (const [k, n] of Object.entries(o.bag)) {
      const q = Math.floor(Number(n));
      if (LIFE_ITEMS[k] && q > 0) bag[k] = Math.min(STACK_MAX, q);
    }
  }
  const xp: LifeData['xp'] = {};
  if (o.xp && typeof o.xp === 'object') {
    for (const s of LIFE_SKILLS) {
      const n = Math.floor(Number((o.xp as Record<string, unknown>)[s]));
      if (n > 0) xp[s] = n;
    }
  }
  const out: LifeData = { xp, bag };
  if (o.buff && FOODS[o.buff.key]?.buff && Number.isFinite(o.buff.until)) out.buff = { key: o.buff.key, until: o.buff.until };
  if (o.sold && typeof o.sold.day === 'string') out.sold = { day: o.sold.day, gold: Number(o.sold.gold) || 0 };
  if (o.best && LIFE_ITEMS[o.best.key]) out.best = { key: o.best.key, kg: Number(o.best.kg) || 0 };
  if (o.trivia && typeof o.trivia.day === 'string' && Array.isArray(o.trivia.done)) {
    out.trivia = { day: o.trivia.day, done: o.trivia.done.filter((n) => Number.isInteger(n)) };
  }
  if (Array.isArray(o.traps)) {
    const traps = o.traps
      .filter((t) => t && Number.isInteger(t.id) && isMapId(t.map) && Number.isFinite(t.x) && Number.isFinite(t.y)
        && Number.isFinite(t.readyAt) && typeof t.catch === 'string' && (t.catch === '' || !!LIFE_ITEMS[t.catch]))
      .slice(0, HUNT.trapCount(LIFE_MAX_LV))
      .map((t) => ({ id: t.id, map: t.map, x: t.x, y: t.y, readyAt: t.readyAt, catch: t.catch }));
    if (traps.length) out.traps = traps;
  }

  // Chuẩn hoá nông trại
  const f = o.farm;
  const farm = defaultFarm();
  if (f && typeof f === 'object') {
    if (Array.isArray(f.plots)) {
      for (let i = 0; i < FARM.plotCount; i++) {
        const p = f.plots[i];
        if (p && (p.state === 'empty' || p.state === 'plowed' || p.state === 'planted')) {
          farm.plots[i] = {
            id: i,
            state: p.state,
            crop: p.crop && (p.crop === 'giong_te' || p.crop === 'giong_nep') ? p.crop : undefined,
            progress: Number.isFinite(p.progress) ? Math.max(0, Math.min(1, Number(p.progress))) : undefined,
            waterUntil: Number.isFinite(p.waterUntil) ? Number(p.waterUntil) : undefined,
            fertilized: !!p.fertilized,
            pest: !!p.pest,
            lastUpdate: Number.isFinite(p.lastUpdate) ? Number(p.lastUpdate) : undefined,
          };
        }
      }
    }
    if (Array.isArray(f.chickens)) {
      farm.chickens = f.chickens
        .filter((c) => c && Number.isInteger(c.id) && Number.isFinite(c.bornAt))
        .slice(0, FARM.maxChickens)
        .map((c) => ({
          id: c.id,
          bornAt: Number(c.bornAt),
          fedTime: Math.max(0, Number(c.fedTime) || 0),
          laidTime: Math.max(0, Number(c.laidTime) || 0),
        }));
    }
    farm.troughFood = Math.max(0, Math.min(FARM.maxTrough, Math.floor(Number(f.troughFood) || 0)));
    farm.troughUntil = Number.isFinite(f.troughUntil) ? Number(f.troughUntil) : undefined;
    farm.eggs = Math.max(0, Math.min(FARM.maxEggs, Math.floor(Number(f.eggs) || 0)));
    farm.goldenEggs = Math.max(0, Math.min(FARM.maxEggs, Math.floor(Number(f.goldenEggs) || 0)));
    farm.manure = Math.max(0, Math.min(FARM.maxManure, Math.floor(Number(f.manure) || 0)));
    farm.likes = Math.max(0, Math.floor(Number(f.likes) || 0));
    farm.lastUpdate = Number.isFinite(f.lastUpdate) ? Number(f.lastUpdate) : undefined;
    if (Array.isArray(f.cheers)) {
      farm.cheers = f.cheers
        .filter((c) => c && typeof c.by === 'string' && typeof c.text === 'string' && Number.isFinite(c.time))
        .slice(-20)
        .map((c) => ({ by: c.by.slice(0, 20), text: c.text.slice(0, 100), time: Number(c.time) }));
    }
  }
  out.farm = farm;

  return out;
}
