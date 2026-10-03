// Map nhỏ để test: 32 x 56 ô (1024 x 1792 px), sinh xác định (cùng seed)
// nên client và server dựng ra map giống hệt nhau, không cần gửi qua mạng.
//
//   y 0..10   Gốc Đa Cổ — Chúa Mộc Tinh (nền đá cổ, có lối vào phía dưới)
//   y 11..26  Rừng Đa sâu — Cáo Tinh
//   y 27..42  Rừng thưa — Bánh Trôi Tinh, có hồ nước
//   y 43      Hàng rào cây, cổng làng ở giữa
//   y 44..55  Làng Tre (vùng an toàn, có giếng làng hồi phục sinh lực)

import { TILE } from './constants.ts';

export const MAP_W = 32;
export const MAP_H = 56;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

// Mã ô. >= 10 là vật cản di chuyển.
export const T = {
  GRASS: 0,
  GRASS2: 1,
  PATH: 2,
  FLOWER: 3,
  STONE: 4,
  PLAZA: 5,
  TREE: 10,
  WATER: 11,
  ROCK: 12,
  HOUSE: 13,
  FOUNTAIN: 14,
} as const;

export type MonsterKind = 'slime' | 'wolf' | 'boss';
export interface SpawnPoint { kind: MonsterKind; x: number; y: number }

export interface GameMap {
  tiles: Uint8Array;
  spawns: SpawnPoint[];
  playerSpawn: { x: number; y: number };
  fountain: { x: number; y: number; r: number };
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

const SLIME_SPAWNS: [number, number][] = [
  [6, 31], [11, 35], [21, 30], [26, 39], [8, 40], [19, 38], [12, 29], [27, 30],
];
const WOLF_SPAWNS: [number, number][] = [
  [6, 15], [24, 14], [10, 21], [22, 23], [27, 19], [5, 24],
];
const BOSS_SPAWN: [number, number] = [16, 5];

export function buildMap(seed = 1337): GameMap {
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

  const px = (t: number) => t * TILE + TILE / 2;
  const spawns: SpawnPoint[] = [
    ...SLIME_SPAWNS.map(([x, y]) => ({ kind: 'slime' as const, x: px(x), y: px(y) })),
    ...WOLF_SPAWNS.map(([x, y]) => ({ kind: 'wolf' as const, x: px(x), y: px(y) })),
    { kind: 'boss', x: px(BOSS_SPAWN[0]), y: px(BOSS_SPAWN[1]) },
  ];

  return {
    tiles,
    spawns,
    playerSpawn: { x: 16 * TILE, y: 52 * TILE + TILE / 2 },
    fountain: { x: 16 * TILE, y: 49 * TILE, r: 80 },
  };
}

export function tileAt(map: GameMap, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return T.TREE;
  return map.tiles[ty * MAP_W + tx];
}

export const blocksMove = (t: number) => t >= 10;
export const blocksShot = (t: number) => t >= 10 && t !== T.WATER;

export type Zone = 'village' | 'forest' | 'arena';
export function zoneAt(_map: GameMap, _x: number, y: number): Zone {
  const ty = Math.floor(y / TILE);
  if (ty >= 44) return 'village';
  if (ty <= 10) return 'arena';
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
