// Các bản đồ nhỏ 32 x 56 ô (1024 x 1792 px), sinh xác định (cùng seed)
// nên client và server dựng ra map giống hệt nhau, không cần gửi qua mạng.
//
// Bản đồ 'lang_tre' (vùng 1):
//   y 0..10   Gốc Đa Cổ — Chúa Mộc Tinh (nền đá cổ, có lối vào phía dưới)
//   y 11..26  Rừng Đa sâu — Cáo Tinh
//   y 27..42  Rừng thưa — Bánh Trôi Tinh, có hồ nước
//   y 43      Hàng rào cây, cổng làng ở giữa
//   y 44..55  Làng Tre (vùng an toàn, có giếng làng hồi phục sinh lực), cổng sang Đầm Sen ở mép đông
//
// Bản đồ 'dam_sen' (vùng 2):
//   y 0..10   Vực Thuồng Luồng (đấu trường giữa vòng nước, cầu gỗ phía dưới)
//   y 11..26  Sông Ma uốn khúc, 2 cây cầu
//   y 27..42  Đầm Sen: các ao sen chia ô bằng bờ đất
//   y 43      Hàng sậy, lối vào ở giữa
//   y 44..55  Bến Đò (vùng an toàn, chum sen hồi phục sinh lực), cổng về Làng Tre ở mép tây

import { TILE, PLAYER_RADIUS } from './constants.ts';

export const MAP_W = 32;
export const MAP_H = 56;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export type MapId = 'lang_tre' | 'dam_sen' | 'vuon_nha';
export const MAP_IDS: readonly MapId[] = ['lang_tre', 'dam_sen', 'vuon_nha'];
export const MAP_NAMES: Record<MapId, string> = {
  lang_tre: 'Làng Tre & Rừng Đa Cổ',
  dam_sen: 'Đầm Sen & Sông Ma',
  vuon_nha: 'Vườn Nhà — Nông Trại Quê Hương',
};
/** Tên vùng an toàn: nơi hồi sinh và xuất hiện khi vào lại game. */
export const SAFE_NAMES: Record<MapId, string> = {
  lang_tre: 'Làng Tre',
  dam_sen: 'Bến Đò',
  vuon_nha: 'Vườn Nhà',
};
export const isMapId = (v: unknown): v is MapId => typeof v === 'string' && (MAP_IDS as readonly string[]).includes(v);

// Mã ô. >= 10 là vật cản di chuyển.
export const T = {
  GRASS: 0,
  GRASS2: 1,
  PATH: 2,
  FLOWER: 3,
  STONE: 4,
  PLAZA: 5,
  PORTAL: 6, // cổng sang bản đồ khác
  LOTUS: 7, // lá sen trên nước nông, đi được
  BRIDGE: 8, // cầu gỗ bắc qua nước
  DOCK: 9, // sàn gỗ bến đò
  TREE: 10,
  WATER: 11,
  ROCK: 12,
  HOUSE: 13,
  FOUNTAIN: 14,
  REED: 15, // bụi sậy
} as const;

export type MonsterKind = 'slime' | 'wolf' | 'boss' | 'crab' | 'frog' | 'mada' | 'serpent'
  | 'rabbit' | 'fowl' | 'lele' | 'boar'; // thú rừng (Nghề Săn bắt)
export interface SpawnPoint { kind: MonsterKind; x: number; y: number }

/** Cổng: hình chữ nhật (px) dẫn sang bản đồ `to`, xuất hiện ở (tx, ty). `need`: id nhiệm vụ phải xong. */
export interface Portal {
  x: number; y: number; w: number; h: number;
  to: MapId; tx: number; ty: number;
  need?: 'main1';
  label: string;
}

export interface GameMap {
  id: MapId;
  tiles: Uint8Array;
  spawns: SpawnPoint[];
  playerSpawn: { x: number; y: number };
  fountain: { x: number; y: number; r: number };
  portals: Portal[];
  /** Hàng ô từ đây trở xuống là vùng an toàn; từ hàng `arenaToRow` trở lên là đấu trường boss. */
  safeFromRow: number;
  arenaToRow: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const px = (t: number) => t * TILE + TILE / 2;

/** Cổng nối Làng Tre (mép đông) và Bến Đò (mép tây), cùng hàng 48–50. */
const GATE_ROWS = [48, 49, 50];

const SLIME_SPAWNS: [number, number][] = [
  [6, 31], [11, 35], [21, 30], [26, 39], [8, 40], [19, 38], [12, 29], [27, 30],
];
const WOLF_SPAWNS: [number, number][] = [
  [6, 15], [24, 14], [10, 21], [22, 23], [27, 19], [5, 24],
];
const BOSS_SPAWN: [number, number] = [16, 5];
// Thú rừng ở bìa rừng (vùng Bánh Trôi Tinh, quái cấp thấp) cho người mới/không thích đánh nhau
const RABBIT_SPAWNS: [number, number][] = [[4, 36], [13, 33], [27, 39]];
const FOWL_SPAWNS: [number, number][] = [[9, 27], [21, 40], [29, 31]];
const BOAR_SPAWNS: [number, number][] = [[4, 29], [25, 41]];

export function buildMap(id: MapId = 'lang_tre'): GameMap {
  if (id === 'vuon_nha') return buildVuonNha();
  return id === 'dam_sen' ? buildDamSen() : buildLangTre();
}

function buildLangTre(seed = 1337): GameMap {
  const rnd = mulberry32(seed);
  const tiles = new Uint8Array(MAP_W * MAP_H);
  const set = (x: number, y: number, t: number) => {
    if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) tiles[y * MAP_W + x] = t;
  };

  // Nền cỏ ngẫu nhiên
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const r = rnd();
      set(x, y, r < 0.18 ? T.GRASS2 : r < 0.22 ? T.FLOWER : T.GRASS);
    }
  }

  // Rừng: cây ngẫu nhiên, dày hơn ở vùng sói
  for (let y = 11; y <= 42; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      const density = y <= 26 ? 0.13 : 0.08;
      const r = rnd();
      if (r < density) set(x, y, T.TREE);
      else if (r < density + 0.015) set(x, y, T.ROCK);
    }
  }

  // Hồ nước
  for (let y = 31; y <= 37; y++) {
    for (let x = 20; x <= 29; x++) {
      const dx = (x - 24.5) / 3.2, dy = (y - 34) / 2.4;
      if (dx * dx + dy * dy <= 1) set(x, y, T.WATER);
    }
  }

  // Đấu trường boss
  for (let y = 0; y <= 10; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const dx = x - 16, dy = y - 5.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= 5.2) set(x, y, T.STONE);
      else if (d <= 6.2) set(x, y, T.ROCK);
      else set(x, y, T.TREE);
    }
  }
  for (let y = 9; y <= 11; y++) for (let x = 14; x <= 17; x++) set(x, y, T.STONE);

  // Đường mòn chính giữa map
  for (let y = 11; y <= 47; y++) { set(15, y, T.PATH); set(16, y, T.PATH); }

  // Hàng rào cây giữa rừng và làng, có cổng
  for (let x = 0; x < MAP_W; x++) if (x < 13 || x > 18) set(x, 43, T.TREE);

  // Làng
  for (let y = 44; y <= 54; y++) for (let x = 1; x < MAP_W - 1; x++) set(x, y, T.PLAZA);
  const house = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, T.HOUSE);
  };
  house(3, 45, 5, 3);
  house(24, 45, 5, 3);
  house(3, 51, 4, 3);
  house(25, 51, 4, 3);
  for (let y = 48; y <= 49; y++) for (let x = 15; x <= 16; x++) set(x, y, T.FOUNTAIN);

  // Viền map
  for (let x = 0; x < MAP_W; x++) { set(x, 0, T.TREE); set(x, MAP_H - 1, T.TREE); }
  for (let y = 0; y < MAP_H; y++) { set(0, y, T.TREE); set(MAP_W - 1, y, T.TREE); }

  // Dọn trống quanh điểm spawn quái để không kẹt
  const clear = (cx: number, cy: number, r: number) => {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x <= 0 || y <= 0 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
        const t = tiles[y * MAP_W + x];
        if (t === T.TREE || t === T.ROCK) set(x, y, T.GRASS);
      }
    }
  };
  for (const [x, y] of SLIME_SPAWNS) clear(x, y, 1);
  for (const [x, y] of WOLF_SPAWNS) clear(x, y, 1);
  for (const [x, y] of [...RABBIT_SPAWNS, ...FOWL_SPAWNS, ...BOAR_SPAWNS]) clear(x, y, 1);

  // Cổng sang Đầm Sen ở mép đông làng (đặt sau mọi lần gọi rnd() nên bố cục cũ giữ nguyên)
  for (const r of GATE_ROWS) set(MAP_W - 1, r, T.PORTAL);
  // Cổng sang Vườn Nhà ở mép tây làng
  for (const r of GATE_ROWS) {
    set(0, r, T.PORTAL);
    set(1, r, T.PLAZA);
  }

  const spawns: SpawnPoint[] = [
    ...SLIME_SPAWNS.map(([x, y]) => ({ kind: 'slime' as const, x: px(x), y: px(y) })),
    ...WOLF_SPAWNS.map(([x, y]) => ({ kind: 'wolf' as const, x: px(x), y: px(y) })),
    { kind: 'boss', x: px(BOSS_SPAWN[0]), y: px(BOSS_SPAWN[1]) },
    ...RABBIT_SPAWNS.map(([x, y]) => ({ kind: 'rabbit' as const, x: px(x), y: px(y) })),
    ...FOWL_SPAWNS.map(([x, y]) => ({ kind: 'fowl' as const, x: px(x), y: px(y) })),
    ...BOAR_SPAWNS.map(([x, y]) => ({ kind: 'boar' as const, x: px(x), y: px(y) })),
  ];

  return {
    id: 'lang_tre',
    tiles,
    spawns,
    playerSpawn: { x: 16 * TILE, y: 52 * TILE + TILE / 2 },
    fountain: { x: 16 * TILE, y: 49 * TILE, r: 80 },
    portals: [
      {
        x: (MAP_W - 1) * TILE, y: GATE_ROWS[0] * TILE, w: TILE, h: GATE_ROWS.length * TILE,
        to: 'dam_sen', tx: px(3), ty: px(49), need: 'main1', label: 'Đầm Sen →',
      },
      {
        x: 0, y: GATE_ROWS[0] * TILE, w: TILE, h: GATE_ROWS.length * TILE,
        to: 'vuon_nha', tx: px(28), ty: px(49), label: '← Vườn Nhà',
      },
    ],
    safeFromRow: 44,
    arenaToRow: 10,
  };
}

function buildDamSen(seed = 2026): GameMap {
  const rnd = mulberry32(seed);
  const tiles = new Uint8Array(MAP_W * MAP_H);
  const set = (x: number, y: number, t: number) => {
    if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) tiles[y * MAP_W + x] = t;
  };
  const get = (x: number, y: number) => (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H ? tiles[y * MAP_W + x] : T.TREE);

  // Nền cỏ đầm lầy
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const r = rnd();
      set(x, y, r < 0.22 ? T.GRASS2 : r < 0.25 ? T.FLOWER : T.GRASS);
    }
  }

  // Sông Ma uốn khúc ngang bản đồ
  for (let x = 0; x < MAP_W; x++) {
    const cy = 18.5 + Math.sin(x / 4.2) * 3;
    for (let y = 11; y <= 26; y++) if (Math.abs(y - cy) <= 2.4) set(x, y, T.WATER);
  }

  // Đầm Sen: 4 ao, lá sen mọc ven bờ và rải rác giữa ao
  const pond = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || y === y0 || y === y1;
        set(x, y, rnd() < (edge ? 0.45 : 0.12) ? T.LOTUS : T.WATER);
      }
    }
  };
  pond(2, 29, 11, 34);
  pond(3, 37, 11, 41);
  pond(20, 28, 29, 33);
  pond(20, 36, 29, 41);

  // Sậy ven nước, cây thưa
  for (let y = 11; y <= 42; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      const t = get(x, y);
      if (t !== T.GRASS && t !== T.GRASS2 && t !== T.FLOWER) continue;
      const nearWater = [get(x - 1, y), get(x + 1, y), get(x, y - 1), get(x, y + 1)].includes(T.WATER);
      const r = rnd();
      if (nearWater && r < 0.18) set(x, y, T.REED);
      else if (r < 0.04) set(x, y, T.TREE);
    }
  }

  // Vực Thuồng Luồng: nền đá giữa vòng nước, xung quanh sậy và cây
  for (let y = 0; y <= 10; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const d = Math.hypot(x - 16, y - 5);
      if (d <= 4.2) set(x, y, T.STONE);
      else if (d <= 5.6) set(x, y, T.WATER);
      else set(x, y, rnd() < 0.5 ? T.REED : T.TREE);
    }
  }

  // Đường đất chính giữa bản đồ, gặp nước thì thành cầu
  for (let y = 9; y <= 47; y++) {
    for (const x of [15, 16]) set(x, y, get(x, y) === T.WATER ? T.BRIDGE : get(x, y) === T.STONE ? T.STONE : T.PATH);
  }
  // Cây cầu thứ hai bắc qua Sông Ma phía đông (dọn sậy ở 2 đầu cầu để đi lên được)
  for (const x of [26, 27]) {
    let y0 = -1, y1 = -1;
    for (let y = 11; y <= 26; y++) if (get(x, y) === T.WATER) { set(x, y, T.BRIDGE); if (y0 < 0) y0 = y; y1 = y; }
    if (y0 > 0) { set(x, y0 - 1, T.PATH); set(x, y1 + 1, T.PATH); }
  }

  // Hàng sậy ngăn đầm và bến, có lối vào ở giữa
  for (let x = 0; x < MAP_W; x++) if (x < 13 || x > 18) set(x, 43, T.REED);

  // Bến Đò: sàn gỗ, nước sông ở mép đông với cầu tàu, 2 nhà sàn, chum sen ở giữa
  for (let y = 44; y <= 54; y++) for (let x = 1; x < MAP_W - 1; x++) set(x, y, T.PLAZA);
  for (let y = 46; y <= 53; y++) for (let x = 2; x <= 23; x++) set(x, y, T.DOCK);
  for (let y = 44; y <= 54; y++) for (let x = 25; x <= 30; x++) set(x, y, T.WATER);
  for (let y = 49; y <= 50; y++) for (let x = 24; x <= 29; x++) set(x, y, T.DOCK);
  for (let y = 44; y <= 45; y++) for (let x = 3; x <= 6; x++) set(x, y, T.HOUSE);
  for (let y = 52; y <= 53; y++) for (let x = 19; x <= 22; x++) set(x, y, T.HOUSE);
  for (let y = 48; y <= 49; y++) for (let x = 15; x <= 16; x++) set(x, y, T.FOUNTAIN);
  for (let y = 44; y <= 47; y++) for (const x of [15, 16]) set(x, y, T.PATH);

  // Viền map, cổng về Làng Tre ở mép tây
  for (let x = 0; x < MAP_W; x++) { set(x, 0, T.TREE); set(x, MAP_H - 1, T.TREE); }
  for (let y = 0; y < MAP_H; y++) { set(0, y, T.TREE); set(MAP_W - 1, y, T.TREE); }
  for (const r of GATE_ROWS) { set(0, r, T.PORTAL); set(1, r, T.DOCK); }

  // Le le kiếm ăn trên bờ cỏ ven ao (dọn sậy/cây quanh chỗ xuất hiện; không dùng rnd() nên bố cục giữ nguyên)
  const LELE_SPAWNS: [number, number][] = [[13, 39], [18, 30], [6, 42], [24, 42]];
  for (const [cx, cy] of LELE_SPAWNS) {
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        const t = get(x, y);
        if (y < 43 && (t === T.REED || t === T.TREE)) set(x, y, T.GRASS);
      }
    }
    if (get(cx, cy) === T.WATER || get(cx, cy) === T.LOTUS) set(cx, cy, T.GRASS);
  }

  return {
    id: 'dam_sen',
    tiles,
    spawns: [
      // Cua Đá ở bờ đất quanh các ao sen
      { kind: 'crab', x: px(7), y: px(35) },
      { kind: 'crab', x: px(12), y: px(35) },
      { kind: 'crab', x: px(18), y: px(35) },
      { kind: 'crab', x: px(22), y: px(35) },
      // Ếch Lửa trên lá sen và ven nước
      { kind: 'frog', x: px(5), y: px(34) },
      { kind: 'frog', x: px(10), y: px(34) },
      { kind: 'frog', x: px(21), y: px(28) },
      { kind: 'frog', x: px(26), y: px(28) },
      // Ma Da phục kích ven Sông Ma
      { kind: 'mada', x: px(7), y: px(14) },
      { kind: 'mada', x: px(10), y: px(14) },
      { kind: 'mada', x: px(24), y: px(14) },
      { kind: 'mada', x: px(27), y: px(14) },
      // Chúa Thuồng Luồng trấn giữ Vực Sông Ma
      { kind: 'serpent', x: px(16), y: px(5) },
      // Le le (vịt trời) hiền lành, thấy người là chạy
      ...LELE_SPAWNS.map(([x, y]) => ({ kind: 'lele' as const, x: px(x), y: px(y) })),
    ],
    playerSpawn: { x: 16 * TILE, y: 52 * TILE + TILE / 2 },
    fountain: { x: 16 * TILE, y: 49 * TILE, r: 80 },
    portals: [{
      x: 0, y: GATE_ROWS[0] * TILE, w: TILE, h: GATE_ROWS.length * TILE,
      to: 'lang_tre', tx: px(28), ty: px(49), label: '← Làng Tre',
    }],
    safeFromRow: 44,
    arenaToRow: 10,
  };
}

function buildVuonNha(seed = 1990): GameMap {
  const rnd = mulberry32(seed);
  const tiles = new Uint8Array(MAP_W * MAP_H);
  const set = (x: number, y: number, t: number) => {
    if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) tiles[y * MAP_W + x] = t;
  };
  const get = (x: number, y: number) => (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H ? tiles[y * MAP_W + x] : T.TREE);

  // Nền cỏ thanh bình
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const r = rnd();
      set(x, y, r < 0.2 ? T.GRASS2 : r < 0.25 ? T.FLOWER : T.GRASS);
    }
  }

  // Viền map bằng hàng cây râm mát
  for (let x = 0; x < MAP_W; x++) { set(x, 0, T.TREE); set(x, MAP_H - 1, T.TREE); }
  for (let y = 0; y < MAP_H; y++) { set(0, y, T.TREE); set(MAP_W - 1, y, T.TREE); }

  // Gian nhà ngói ba gian ở phía nam sân
  for (let y = 39; y <= 42; y++) {
    for (let x = 14; x <= 21; x++) set(x, y, T.HOUSE);
  }

  // Sân gạch rộng rãi trước nhà
  for (let y = 43; y <= 53; y++) {
    for (let x = 11; x <= 25; x++) set(x, y, T.PLAZA);
  }

  // Giếng nước mát giữa sân
  for (let y = 46; y <= 47; y++) {
    for (let x = 18; x <= 19; x++) set(x, y, T.FOUNTAIN);
  }

  // Đường gạch nối từ sân ra cổng làng ở mép đông
  for (const r of GATE_ROWS) {
    for (let x = 25; x < MAP_W - 1; x++) set(x, r, T.PLAZA);
  }

  // Cổng về Làng Tre ở mép đông
  for (const r of GATE_ROWS) {
    set(MAP_W - 1, r, T.PORTAL);
  }

  // Ao cá gia đình ở góc tây-bắc (có sen và cầu ao để câu cá)
  for (let y = 6; y <= 16; y++) {
    for (let x = 4; x <= 15; x++) {
      const edge = x === 4 || x === 15 || y === 6 || y === 16;
      set(x, y, edge && rnd() < 0.4 ? T.LOTUS : T.WATER);
    }
  }
  // Cầu ao gỗ
  for (let x = 9; x <= 11; x++) {
    set(x, 16, T.DOCK);
    set(x, 17, T.PATH);
  }

  // Chuồng gà ở góc đông-bắc: nhà gỗ + sân rào gỗ
  for (let y = 19; y <= 21; y++) {
    for (let x = 22; x <= 26; x++) set(x, y, T.HOUSE);
  }
  for (let y = 22; y <= 25; y++) {
    for (let x = 21; x <= 27; x++) set(x, y, T.DOCK);
  }

  // Khu ruộng lúa nước 8 ô (chia 2 cột 4 hàng) ở mạn tây
  // Lối đi quanh ruộng bằng đất
  for (let y = 20; y <= 35; y++) {
    for (let x = 3; x <= 13; x++) {
      if (get(x, y) !== T.WATER && get(x, y) !== T.TREE) set(x, y, T.PATH);
    }
  }
  // 8 ô đất ruộng
  const plotCoords = [
    [5, 22], [9, 22],
    [5, 25], [9, 25],
    [5, 28], [9, 28],
    [5, 31], [9, 31],
  ];
  for (const [px, py] of plotCoords) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        set(px + dx, py + dy, T.GRASS);
      }
    }
  }

  // Đường đất nối giữa sân, ruộng, ao và chuồng gà
  for (let y = 18; y <= 43; y++) {
    set(16, y, T.PATH);
  }
  for (let x = 11; x <= 16; x++) {
    set(x, 28, T.PATH);
    set(x, 43, T.PATH);
  }
  for (let x = 16; x <= 21; x++) {
    set(x, 24, T.PATH);
  }

  return {
    id: 'vuon_nha',
    tiles,
    spawns: [],
    playerSpawn: { x: px(26), y: px(49) },
    fountain: { x: 19 * TILE, y: 47 * TILE, r: 80 },
    portals: [{
      x: (MAP_W - 1) * TILE, y: GATE_ROWS[0] * TILE, w: TILE, h: GATE_ROWS.length * TILE,
      to: 'lang_tre', tx: px(3), ty: px(49), label: 'Làng Tre →',
    }],
    safeFromRow: 0,
    arenaToRow: -1,
  };
}

/** Cổng mà vòng tròn nhân vật (tâm x, y) đang chạm vào, hoặc null. */
export function portalAt(map: GameMap, x: number, y: number): Portal | null {
  const r = PLAYER_RADIUS + 2;
  for (const p of map.portals) {
    if (x >= p.x - r && x <= p.x + p.w + r && y >= p.y - r && y <= p.y + p.h + r) return p;
  }
  return null;
}

export function tileAt(map: GameMap, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return T.TREE;
  return map.tiles[ty * MAP_W + tx];
}

export const blocksMove = (t: number) => t >= 10;
export const blocksShot = (t: number) => t >= 10 && t !== T.WATER;

export type Zone = 'village' | 'forest' | 'arena';
export function zoneAt(map: GameMap, _x: number, y: number): Zone {
  const ty = Math.floor(y / TILE);
  if (ty >= map.safeFromRow) return 'village';
  if (ty <= map.arenaToRow) return 'arena';
  return 'forest';
}
export const isSafe = (map: GameMap, x: number, y: number) => zoneAt(map, x, y) === 'village';

/** Hình tròn (x,y,r) có chạm ô cản không. */
export function collides(map: GameMap, x: number, y: number, r: number): boolean {
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!blocksMove(tileAt(map, tx, ty))) continue;
      // khoảng cách từ tâm tròn tới hình chữ nhật của ô
      const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
      const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy < r * r) return true;
    }
  }
  return false;
}

/** Di chuyển có trượt theo tường (xử lý từng trục). Trả về vị trí mới. */
export function moveWithCollision(
  map: GameMap, x: number, y: number, dx: number, dy: number, r: number,
): { x: number; y: number } {
  // chia nhỏ bước để không xuyên tường khi đi nhanh (dash)
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r * 0.8)));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0 && !collides(map, x + sx, y, r)) x += sx;
    if (sy !== 0 && !collides(map, x, y + sy, r)) y += sy;
  }
  return { x, y };
}

/** Có đường bắn thẳng giữa 2 điểm không (dùng để chọn mục tiêu cho đánh xa). */
export function lineOfSight(map: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.ceil(d / 8);
  for (let i = 1; i < n; i++) {
    if (shotBlocked(map, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)) return false;
  }
  return true;
}

export function shotBlocked(map: GameMap, x: number, y: number): boolean {
  return blocksShot(tileAt(map, Math.floor(x / TILE), Math.floor(y / TILE)));
}
