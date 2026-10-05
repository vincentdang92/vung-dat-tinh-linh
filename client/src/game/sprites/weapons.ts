// 9 vũ khí vẽ bằng pixel theo góc cầm: (hx, hy) là chỗ bàn tay nắm, `ang` là hướng
// vũ khí chĩa ra (radian, 0 = sang phải, dương = xuống). Một hàm dùng chung cho
// cả 3 hướng nhìn, mọi tư thế đánh, và icon túi đồ 24×24.

import { WEAPONS } from '../../../../shared/data.ts';
import { CLEAR, PixelGrid } from './pixel.ts';
import { P } from './palette.ts';

type Pt = [number, number];

export type WeaponKind = 'sword' | 'crossbow' | 'fan';

export function weaponKind(key: string): WeaponKind {
  const cls = WEAPONS[key]?.cls;
  return cls === 'archer' ? 'crossbow' : cls === 'mage' ? 'fan' : 'sword';
}

/** Hệ toạ độ theo vũ khí: t = dọc theo vũ khí, s = vuông góc. */
function frame(hx: number, hy: number, ang: number) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return (t: number, k = 0): Pt => [hx + c * t - s * k, hy + s * t + c * k];
}

function quad(g: PixelGrid, a: Pt, b: Pt, c: Pt, d: Pt, col: number) {
  g.tri(a[0], a[1], b[0], b[1], c[0], c[1], col);
  g.tri(a[0], a[1], c[0], c[1], d[0], d[1], col);
}

/** Dải thẳng dọc vũ khí từ t0 tới t1, bề ngang w. */
function band(g: PixelGrid, at: (t: number, k?: number) => Pt, t0: number, t1: number, w: number, col: number, k0 = 0) {
  quad(g, at(t0, k0 - w / 2), at(t1, k0 - w / 2), at(t1, k0 + w / 2), at(t0, k0 + w / 2), col);
}

function dot(g: PixelGrid, p: Pt, col: number) { g.set(Math.floor(p[0]), Math.floor(p[1]), col); }

// ------------------------------------------------------------------ kiếm & roi

function drawSword(g: PixelGrid, key: string, hx: number, hy: number, ang: number) {
  const at = frame(hx, hy, ang);
  const L = 16;

  if (key === 'flame_blade') {
    // Roi Sắt Phù Đổng: roi sắt nhiều đốt, đầu roi rực lửa
    band(g, at, -2.5, 2.5, 2.4, P.leather);
    band(g, at, 2.5, L + 1, 3.4, P.iron);
    for (let t = 6; t < L; t += 4) band(g, at, t, t + 1.2, 3.6, P.ironDark);
    g.line(...at(3, -1), ...at(L, -1), P.ironLight);
    band(g, at, 1.8, 3.2, 5.4, P.bronzeDark);
    const tip = at(L + 2.5);
    g.ellipse(tip[0], tip[1], 3.2, 3.2, P.fire);
    g.ellipse(tip[0], tip[1], 1.9, 1.9, P.fireHot);
    for (const [t, k] of [[L + 5, -1.5], [L + 4, 2.5], [L - 1, 3], [L + 1, -3.5]] as Pt[]) dot(g, at(t, k), P.fireDeep);
    dot(g, at(-3.2), P.bronze);
    return;
  }

  const bronze = key === 'iron_sword';
  const body = bronze ? P.bronze : P.bamboo;
  const dark = bronze ? P.bronzeDark : P.bambooDark;
  const edge = bronze ? P.bronzeLight : P.cream;

  band(g, at, -2.5, 2, 2.2, P.leather); // chuôi quấn da
  dot(g, at(-3.2), bronze ? P.bronze : P.wood); // núm chuôi
  band(g, at, 3.2, L, 3.2, body); // lưỡi
  g.tri(...at(L, -1.6), ...at(L + 3.2, 0), ...at(L, 1.6), body); // mũi kiếm
  g.line(...at(4, -1), ...at(L, -1), edge); // ánh sáng mép lưỡi
  if (!bronze) for (let t = 6; t < L; t += 4) band(g, at, t, t + 1, 3.2, dark); // đốt tre
  else g.line(...at(4, 0.6), ...at(L - 1, 0.6), dark); // gân giữa lưỡi đồng
  band(g, at, 2, 3.4, bronze ? 7.6 : 6.2, bronze ? P.bronzeDark : P.wood); // chắn tay
  if (bronze) {
    const c = at(2.6);
    g.rect(Math.floor(c[0]) - 1, Math.floor(c[1]) - 1, 2, 2, P.gemBlue);
    g.set(Math.floor(c[0]) - 1, Math.floor(c[1]) - 1, P.gemBlueLight);
  }
}

// ------------------------------------------------------------------ nỏ

function drawCrossbow(g: PixelGrid, key: string, hx: number, hy: number, ang: number) {
  const at = frame(hx, hy, ang);
  const stock = key === 'hunter_bow' ? P.woodDark : key === 'wind_bow' ? P.goldDark : P.bamboo;
  const prod = key === 'hunter_bow' ? P.bronze : key === 'wind_bow' ? P.gold : P.bambooDark;
  const prodHi = key === 'hunter_bow' ? P.bronzeLight : key === 'wind_bow' ? P.fireHot : P.bamboo;

  // dây nỏ (vẽ trước để cánh nỏ đè lên)
  const tipL = at(7.2, -7), tipR = at(7.2, 7), nock = at(2.5);
  g.line(tipL[0], tipL[1], nock[0], nock[1], P.cream);
  g.line(tipR[0], tipR[1], nock[0], nock[1], P.cream);

  band(g, at, -3.5, 10.5, 2.6, stock); // báng nỏ
  band(g, at, -3.5, -1.5, 3.2, key === 'short_bow' ? P.bambooDark : P.leather); // đuôi báng

  // cánh nỏ cong về phía tay
  let prev: Pt | null = null;
  for (let k = -7; k <= 7; k++) {
    const p = at(9.5 - 0.05 * k * k, k);
    if (prev) g.line(prev[0], prev[1], p[0], p[1], prod, 2);
    prev = p;
  }
  g.line(...at(9.8, -5), ...at(10, -1), prodHi);

  // mũi tên đặt trên báng
  g.line(...at(3, 0), ...at(12.5, 0), P.feather);
  dot(g, at(13.2), P.ironLight);

  if (key === 'hunter_bow') {
    const c = at(9.6);
    g.rect(Math.floor(c[0]) - 1, Math.floor(c[1]) - 1, 2, 2, P.gemBlue);
  }
  if (key === 'wind_bow') {
    // móng rùa ngọc lam ở 2 đầu cánh và hạt sáng tím
    for (const side of [-1, 1]) {
      const a = at(7.4, side * 7.2), b = at(5.8, side * 8.4);
      g.line(a[0], a[1], b[0], b[1], P.jade, 2);
      dot(g, b, P.jadeLight);
      dot(g, at(4.5, side * 9.5), P.spark);
    }
    dot(g, at(12, -3), P.spark);
  }
}

// ------------------------------------------------------------------ quạt

function drawFan(g: PixelGrid, key: string, hx: number, hy: number, ang: number) {
  const at = frame(hx, hy, ang);
  const [px, py] = at(0.5);
  const spread = 1.95;
  const R = key === 'crystal_staff' ? 11 : 10;
  const ribs = 6;
  const step = spread / ribs;
  const ribAt = (d: number, da: number) => {
    const u = da + spread / 2;
    const off = u - Math.round(u / step) * step;
    return Math.abs(off) * d < 0.55;
  };

  if (key === 'oak_staff') {
    // Quạt Giấy: giấy kem, nan tre nâu, mép tre, một dấu triện đỏ
    g.sector(px, py, R, ang, spread, (d, da) => {
      if (d < 2.4) return P.woodDark;
      if (d > R - 1.2) return P.bambooDark;
      if (ribAt(d, da) && d < R - 3) return P.wood;
      if (d > 6 && d < 7.6 && Math.abs(da - 0.35) < 0.14) return P.talismanInk;
      return P.cream;
    });
  } else if (key === 'crystal_staff') {
    // Quạt Lông Hạc: các chiếc lông trắng xếp vỏ sò, đầu lông xám
    g.sector(px, py, R, ang, spread, (d, da) => {
      const u = da + spread / 2;
      const off = (u - Math.round(u / step) * step) / step; // -0.5..0.5
      const edge = R - 2.2 * Math.abs(off) * 2;
      if (d > edge) return CLEAR;
      if (d < 2.4) return P.gemBlue;
      if (d > edge - 2) return P.silverDark;
      if (ribAt(d, da)) return P.featherDark;
      return P.white;
    });
    dot(g, [px - 0.5, py - 0.5], P.gemBlueLight);
  } else {
    // Quạt Phong Lôi: tím sẫm, viền vàng, tia sét vàng
    g.sector(px, py, R, ang, spread, (d, da) => {
      if (d < 2.4) return P.gold;
      if (d > R - 1.2) return P.gold;
      const v = da * d;
      const zig = (d % 4 < 2 ? d % 2 : 2 - (d % 2)) * 1.4 - 1.4;
      if (d > 3.5 && Math.abs(v - zig) < 0.7) return P.talisman;
      if (ribAt(d, da)) return P.purple;
      return P.purpleDark;
    });
    for (const [t, k] of [[R + 1.5, -4], [R + 0.5, 5], [R + 2, 1]] as Pt[]) dot(g, at(t, k), P.spark);
  }
  band(g, at, -2, 1.5, 2, key === 'storm_staff' ? P.goldDark : P.woodDark); // cán quạt
}

// ------------------------------------------------------------------ API

export function drawWeapon(g: PixelGrid, key: string, hx: number, hy: number, ang: number) {
  const kind = weaponKind(key);
  if (kind === 'sword') drawSword(g, key, hx, hy, ang);
  else if (kind === 'crossbow') drawCrossbow(g, key, hx, hy, ang);
  else drawFan(g, key, hx, hy, ang);
}

export const ICON_SIZE = 24;

/** Icon vũ khí 24×24 có viền (túi đồ, cửa hàng, đồ rơi trên đất). */
export function weaponIcon(key: string): PixelGrid {
  const g = new PixelGrid(ICON_SIZE, ICON_SIZE);
  const kind = weaponKind(key);
  const a = -Math.PI / 4;
  if (kind === 'sword') drawWeapon(g, key, 6, 18, a);
  else if (kind === 'crossbow') drawWeapon(g, key, 7, 17, a);
  else drawWeapon(g, key, 7, 17, a);
  g.outline(P.outline);
  return g;
}
