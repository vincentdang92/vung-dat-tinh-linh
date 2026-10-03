// Hằng số dùng chung client + server.
// Lưu ý: file trong shared/ chỉ dùng cú pháp TypeScript "xoá được" (không enum,
// không namespace) để server chạy thẳng bằng `node --experimental-strip-types`.

export const TILE = 32;
export const TICK_HZ = 20; // server mô phỏng 20 lần/giây
export const TICK_MS = 1000 / TICK_HZ;
export const SNAP_EVERY = 2; // gửi snapshot mỗi 2 tick = 10 lần/giây
export const INPUT_DT = 1 / TICK_HZ; // mỗi gói input = 50ms di chuyển

export const PLAYER_RADIUS = 10;
export const PICKUP_RADIUS = 26;
export const LOOT_LOCK_MS = 10_000; // đồ rơi chỉ người giết được nhặt trong 10s
export const DROP_TTL_MS = 60_000;
export const RESPAWN_MS = 4_000;
export const OUT_OF_COMBAT_MS = 5_000;
export const INVENTORY_SIZE = 12;
export const MAX_LEVEL = 20;
export const MAX_PLAYERS = 40;

export const DASH_DIST = 90;
export const DASH_CD = 4_000;
export const DASH_IFRAME_MS = 300;
export const POTION_CD = 3_000;
export const POTION_HEAL = 0.4; // hồi 40% máu tối đa

export const INTERP_DELAY_MS = 150;

export function xpToNext(level: number): number {
  return Math.round(20 * Math.pow(level, 1.5));
}
