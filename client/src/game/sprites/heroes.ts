// Sprite 3 môn phái, pixel art chibi 48×48 nhìn 3/4 từ trên xuống.
// Mỗi khung dựng theo lớp: (vũ khí phía sau) → đồ phía sau lưng → chân → thân →
// tay áo → đầu, mặt → mũ/khăn → (vũ khí phía trước) → bàn tay → viền.
// Tham số tư thế (nhún, bước chân, vung tay, pha đánh) sinh ra mọi khung từ cùng
// một bộ hàm, nên các hướng và khung luôn khớp nhau.

import type { ClassId } from '../../../../shared/data.ts';
import { PixelGrid } from './pixel.ts';
import { P } from './palette.ts';
import { drawWeapon, weaponKind } from './weapons.ts';
import type { WeaponKind } from './weapons.ts';

export type Dir = 'down' | 'up' | 'side';
export type HeroAnim = 'idle' | 'walk' | 'attack';

export const FRAME = 48;
/** Hàng điểm ảnh của bàn chân (dùng làm gốc khi đặt sprite xuống đất). */
export const FEET_ROW = 41;
export const DIRS: Dir[] = ['down', 'up', 'side'];
export const HERO_ANIMS: Record<HeroAnim, { frames: number; rate: number; repeat: number }> = {
  idle: { frames: 2, rate: 3, repeat: -1 },
  walk: { frames: 4, rate: 9, repeat: -1 },
  attack: { frames: 3, rate: 12, repeat: 0 },
};

interface Pose {
  bob: number;    // nhún người xuống (px)
  liftL: number;  // nhấc chân trái (hướng xuống/lên)
  liftR: number;
  stride: number; // sải chân (hướng ngang)
  swing: number;  // vung tay
  atk: number;    // -1 không đánh, 0 lấy đà, 1 trúng, 2 thu về
  flutter: number; // khăn/tà áo bay
}

function poseFor(anim: HeroAnim, i: number): Pose {
  if (anim === 'walk') {
    const ph = [1, 0, -1, 0][i];
    return { bob: i % 2, liftL: ph > 0 ? 2 : 0, liftR: ph < 0 ? 2 : 0, stride: ph * 2, swing: -ph, atk: -1, flutter: i % 2 };
  }
  if (anim === 'attack') return { bob: i === 1 ? 1 : 0, liftL: 0, liftR: 0, stride: 0, swing: 0, atk: i, flutter: i % 2 };
  return { bob: i, liftL: 0, liftR: 0, stride: 0, swing: 0, atk: -1, flutter: i };
}

// ------------------------------------------------------------------ trang phục

interface Costume {
  sleeve: number; sleeveDark: number; armW: number;
  torso: number; torsoDark: number;
  pants: number; longRobe: boolean;
  /** đồ vẽ sau lưng (trước khi vẽ thân) */
  back?: (g: PixelGrid, d: Dir, p: Pose) => void;
  /** chi tiết trên thân */
  body?: (g: PixelGrid, d: Dir, p: Pose) => void;
  /** chi tiết vai (sau khi vẽ tay áo) */
  shoulders?: (g: PixelGrid, d: Dir, p: Pose) => void;
  /** mũ / khăn */
  hat: (g: PixelGrid, d: Dir, p: Pose) => void;
}

const COSTUMES: Record<ClassId, Costume> = {
  // ---------------- Thiết Kiếm Môn: nón chóp đồng, khăn đỏ, giáp ngực Đông Sơn
  warrior: {
    sleeve: P.red, sleeveDark: P.redDark, armW: 4,
    torso: P.red, torsoDark: P.redDark, pants: P.pants, longRobe: false,
    back(g, d, p) {
      const b = p.bob, f = p.flutter;
      if (d === 'down') {
        g.line(17, 26 + b, 9, 29 + b + f, P.red, 2);
        g.line(31, 26 + b, 39, 29 + b - f, P.red, 2);
        g.set(8, 30 + b + f, P.redDark); g.set(40, 30 + b - f, P.redDark);
      } else if (d === 'side') {
        g.line(20, 26 + b, 11, 28 + b + f, P.red, 2);
        g.line(20, 27 + b, 12, 31 + b - f, P.redDark, 2);
      }
    },
    body(g, d, p) {
      const b = p.bob;
      const x0 = d === 'side' ? 18 : 16, x1 = d === 'side' ? 30 : 31;
      g.rect(x0, 32 + b, x1 - x0 + 1, 1, P.leather); // thắt lưng
      g.rect(x0 - 1, 34 + b, x1 - x0 + 3, 3, P.red); // vạt áo xoè
      g.rect(x0 - 1, 36 + b, x1 - x0 + 3, 1, P.redDark);
      if (d === 'down') {
        // giáp ngực đồng khắc ngôi sao trống Đông Sơn
        g.ellipse(24, 29 + b, 5.6, 3.4, P.bronze);
        g.ellipse(24, 29 + b, 5.6, 3.4, P.bronzeDark, (x, y) => Math.abs(x + 0.5 - 24) > 4 || y === 26 + b || y === 31 + b);
        g.rect(23, 28 + b, 2, 2, P.bronzeLight);
        for (const [x, y] of [[21, 29], [26, 29], [24, 27], [23, 31]]) g.set(x, y + b, P.bronzeDark);
        g.rect(17, 25 + b, 14, 2, P.red); // khăn quàng cổ
        g.rect(17, 26 + b, 14, 1, P.redDark);
      } else if (d === 'up') {
        g.rect(19, 27 + b, 10, 4, P.bronze);
        g.rect(19, 30 + b, 10, 1, P.bronzeDark);
        g.rect(17, 25 + b, 14, 2, P.red);
        // 2 đuôi khăn rủ sau lưng
        g.line(23, 26 + b, 20 - p.flutter, 35 + b, P.red, 2);
        g.line(25, 26 + b, 29 + p.flutter, 34 + b, P.redDark, 2);
      } else {
        g.ellipse(27, 29 + b, 3.4, 3.2, P.bronze);
        g.set(28, 28 + b, P.bronzeLight);
        g.rect(19, 25 + b, 11, 2, P.red);
      }
    },
    shoulders(g, d, p) {
      const b = p.bob;
      if (d === 'side') { g.ellipse(25, 27.5 + b, 2.8, 2, P.bronze); return; }
      g.ellipse(14.5, 27.5 + b, 2.8, 2, P.bronze);
      g.ellipse(33.5, 27.5 + b, 2.8, 2, P.bronze);
      g.set(13, 27 + b, P.bronzeLight); g.set(32, 27 + b, P.bronzeLight);
    },
    hat(g, d, p) {
      const b = p.bob;
      const cx = d === 'side' ? 25 : 24;
      g.tri(cx, 3 + b, cx - 13.5, 12.5 + b, cx + 13.5, 12.5 + b, P.bronze);
      // bóng nửa bên phải (ánh sáng từ trên trái)
      for (let y = 3; y <= 12; y++) for (let x = cx + 1; x < cx + 15; x++) g.paint(x, y + b, P.bronzeDark);
      for (let y = 5; y <= 10; y++) g.paint(cx - 1, y + b, P.bronzeLight);
      g.rect(cx - 14, 11 + b, 28, 2, P.bronzeDark); // vành nón
      g.rect(cx - 13, 11 + b, 12, 1, P.bronze);
      // tua đỏ trên chóp
      const tx = d === 'side' ? cx - 1 : cx;
      g.ellipse(tx, 2.5 + b, 2.2, 1.8, P.red);
      g.set(tx - 1, 1 + b, P.redLight);
    },
  },

  // ---------------- Lạc Tiễn Cốc: khăn vấn hổ phách, lông chim Lạc, ống tên
  archer: {
    sleeve: P.brown, sleeveDark: P.brownDark, armW: 4,
    torso: P.brown, torsoDark: P.brownDark, pants: P.brownDark, longRobe: false,
    back(g, d, p) {
      const b = p.bob;
      if (d === 'down') {
        // đầu ống tên ló sau vai
        g.line(32, 25 + b, 34, 20 + b, P.leather, 3);
        g.line(33, 19 + b, 35, 17 + b, P.feather, 2);
        g.set(36, 18 + b, P.featherDark);
      } else if (d === 'side') {
        g.line(18, 33 + b, 15, 22 + b, P.leather, 4);
        g.line(15, 21 + b, 13, 18 + b, P.feather, 2);
        g.set(16, 19 + b, P.featherDark);
      }
    },
    body(g, d, p) {
      const b = p.bob;
      const x0 = d === 'side' ? 18 : 16, x1 = d === 'side' ? 30 : 31;
      g.rect(x0, 32 + b, x1 - x0 + 1, 1, P.amberDark); // thắt lưng
      g.rect(x0, 36 + b, x1 - x0 + 1, 1, P.amber); // viền gấu áo
      if (d === 'down') {
        g.line(21, 25 + b, 24, 29 + b, P.amber); g.line(27, 25 + b, 24, 29 + b, P.amber); // cổ chữ V
        g.line(17, 27 + b, 30, 35 + b, P.brownDark, 2); // dây đeo chéo
        g.set(24, 32 + b, P.amber);
      } else if (d === 'up') {
        // ống tên đeo chéo sau lưng
        g.line(29, 23 + b, 20, 34 + b, P.leather, 5);
        g.line(28, 24 + b, 20, 33 + b, P.brownLight);
        g.line(30, 21 + b, 32, 18 + b, P.feather, 2);
        g.line(28, 21 + b, 29, 18 + b, P.feather, 2);
        g.set(31, 17 + b, P.featherDark);
      } else {
        g.line(28, 25 + b, 26, 29 + b, P.amber);
        g.line(19, 27 + b, 28, 35 + b, P.brownDark, 2);
      }
    },
    hat(g, d, p) {
      const b = p.bob;
      const cx = d === 'side' ? 24.5 : 24;
      g.ellipse(cx, 10.5 + b, 11.2, 5.8, P.amber);
      // các vòng khăn quấn
      for (const y of [8, 12]) for (let x = 10; x < 38; x++) g.paint(x, y + b, P.amberDark);
      if (d === 'down') { g.line(20, 7 + b, 27, 14 + b, P.amberDark); g.set(24, 6 + b, P.feather); }
      // lông chim Lạc dựng cao: phiến lông thon, cọng giữa sẫm
      const [x0, x1] = d === 'down' ? [28, 32] : d === 'up' ? [20, 16] : [20, 17];
      const xm = (x0 + x1) / 2, ym = 4.5 + b / 2;
      g.tri(x0, 9 + b, xm - 1.9, ym, x1, 0, P.feather);
      g.tri(x0, 9 + b, xm + 1.9, ym, x1, 0, P.feather);
      g.line(x0, 8 + b, x1, 1, P.featherDark);
      g.set(x1, 0, P.amberDark);
    },
  },

  // ---------------- Thủy Phù Quán: khăn xếp tím, áo dài xanh, quạt phép
  mage: {
    sleeve: P.blue, sleeveDark: P.blueDark, armW: 5,
    torso: P.blue, torsoDark: P.blueDark, pants: P.cream, longRobe: true,
    body(g, d, p) {
      const b = p.bob, sway = p.stride !== 0 ? Math.sign(p.stride) : p.swing;
      const x0 = d === 'side' ? 18 : 16, w = d === 'side' ? 13 : 16;
      // tà áo dài chấm cổ chân, đung đưa khi đi
      g.rrect(x0 - 1 + (d === 'side' ? -sway : 0), 33 + b, w + 2, 7 - b, P.blue);
      g.rect(x0 - 1 + (d === 'side' ? -sway : 0), 39, w + 2, 1, P.blueDark);
      if (d === 'down') {
        g.rect(20, 31 + b, 8, 8 - b, P.blueLight); // vạt trước
        g.rect(20, 38, 8, 1, P.blueDark);
        g.rect(21, 25 + b, 6, 2, P.purple); // cổ áo
        for (const [x, y] of [[26, 28], [28, 29], [30, 30]]) g.set(x, y + b, P.cream); // hàng khuy chéo
      } else if (d === 'up') {
        g.rect(23, 27 + b, 2, 12 - b, P.blueDark); // đường may lưng
        g.rect(20, 25 + b, 8, 1, P.purple);
      } else {
        g.rect(27, 31 + b, 4, 8 - b, P.blueLight);
        g.rect(25, 25 + b, 4, 2, P.purple);
        g.set(29, 28 + b, P.cream);
      }
    },
    hat(g, d, p) {
      const b = p.bob;
      const cx = d === 'side' ? 24.5 : 24;
      g.ellipse(cx, 10 + b, 11.2, 5.4, P.purple);
      g.ellipse(cx, 7.5 + b, 7, 2.4, P.purpleLight);
      for (const y of [9, 11, 13]) for (let x = 10; x < 38; x++) g.paint(x, y + b, P.purpleDark);
      if (d === 'down') {
        // nếp khăn xếp chéo nhau ở giữa trán
        g.line(20, 9 + b, 24, 13 + b, P.purpleLight);
        g.line(28, 9 + b, 24, 13 + b, P.purpleLight);
      }
    },
  },
};

// ------------------------------------------------------------------ tay cầm vũ khí

interface Grip { sx: number; sy: number; hx: number; hy: number; ang: number; front: boolean }

const D = Math.PI / 180;

/** Vị trí vai, bàn tay và góc vũ khí theo loại vũ khí, hướng và pha đánh. */
function gripFor(kind: WeaponKind, d: Dir, p: Pose): Grip {
  const b = p.bob;
  type G = [number, number, number]; // hx, hy, góc (độ)
  const pick = (rest: G, wind: G, hit: G, rec: G): G =>
    p.atk === 0 ? wind : p.atk === 1 ? hit : p.atk === 2 ? rec : rest;

  let r: G;
  if (d === 'down') {
    r = kind === 'sword' ? pick([12, 34, -105], [11, 25, -120], [14, 32, 15], [13, 34, -95])
      : kind === 'crossbow' ? pick([13, 32, 125], [22, 30, 90], [22, 29, 90], [14, 32, 115])
      : pick([12, 32, -120], [11, 27, -155], [16, 31, 20], [12, 32, -130]);
    if (p.atk < 0) r = [r[0], r[1] + p.swing, r[2]];
    return { sx: 14, sy: 27 + b, hx: r[0], hy: r[1] + b, ang: r[2] * D, front: true };
  }
  if (d === 'up') {
    r = kind === 'sword' ? pick([35, 34, -70], [36, 25, -60], [32, 28, -110], [35, 33, -75])
      : kind === 'crossbow' ? pick([34, 31, -90], [34, 31, -90], [34, 33, -90], [34, 31, -90])
      : pick([35, 32, -60], [36, 28, -15], [32, 28, -125], [35, 32, -60]);
    if (p.atk < 0) r = [r[0], r[1] - p.swing, r[2]];
    // lúc vung lên/chém, vũ khí vượt qua đầu nên vẽ phía trước
    return { sx: 34, sy: 27 + b, hx: r[0], hy: r[1] + b, ang: r[2] * D, front: kind === 'sword' && (p.atk === 0 || p.atk === 1) };
  }
  r = kind === 'sword' ? pick([26, 34, -60], [21, 26, -125], [29, 31, 5], [27, 33, -50])
    : kind === 'crossbow' ? pick([27, 31, 0], [27, 31, 0], [25, 31, 0], [27, 31, 0])
    : pick([28, 34, 0], [22, 27, -145], [31, 30, 15], [28, 34, -10]);
  if (p.atk < 0) r = [r[0] + p.swing * 2, r[1], r[2]];
  return { sx: 25, sy: 27 + b, hx: r[0], hy: r[1] + b, ang: r[2] * D, front: true };
}

// ------------------------------------------------------------------ dựng 1 khung

function drawLegs(g: PixelGrid, c: Costume, d: Dir, p: Pose) {
  const legH = c.longRobe ? 3 : 7;
  const top = 41 - legH + 1;
  const leg = (x: number, lift: number) => {
    const h = legH - lift;
    if (!c.longRobe) g.rect(x, top, 4, h - 2, c.pants);
    g.rect(x, top + h - 2, 4, 2, P.shoe);
    if (c.longRobe) g.rect(x, top, 4, Math.max(0, h - 2), c.pants);
  };
  if (d === 'side') {
    leg(21 - p.stride, p.stride > 0 ? 1 : 0);
    leg(24 + p.stride, p.stride < 0 ? 1 : 0);
  } else {
    leg(18, p.liftL);
    leg(26, p.liftR);
  }
}

function drawArm(g: PixelGrid, c: Costume, sx: number, sy: number, hx: number, hy: number, dark = false) {
  g.line(sx, sy, hx, hy - 1, dark ? c.sleeveDark : c.sleeve, c.armW);
}

function drawHand(g: PixelGrid, hx: number, hy: number) {
  g.ellipse(hx + 0.5, hy + 0.5, 1.9, 1.9, P.skin);
}

function drawHead(g: PixelGrid, d: Dir, p: Pose) {
  const b = p.bob;
  if (d === 'up') {
    g.ellipse(24, 17 + b, 10.5, 9.5, P.hair);
    g.ellipse(24, 17 + b, 10.5, 9.5, P.hairHi, (x, y) => y > 22 + b && (x === 18 || x === 29));
    return;
  }
  if (d === 'down') {
    g.ellipse(24, 17 + b, 10.5, 9.5, P.skin);
    // tóc mái lởm chởm
    g.ellipse(24, 17 + b, 10.5, 9.5, P.hair, (x, y) => y < 14 + b + (x % 3 === 0 ? 2 : x % 3 === 1 ? 1 : 0) || x <= 14 || x >= 33);
    g.rect(19, 18 + b, 2, 3, P.eye); g.rect(27, 18 + b, 2, 3, P.eye);
    g.set(19, 18 + b, P.eyeHi); g.set(27, 18 + b, P.eyeHi);
    g.rect(16, 22 + b, 2, 1, P.blush); g.rect(30, 22 + b, 2, 1, P.blush);
    g.rect(23, 23 + b, 2, 1, P.mouth);
    return;
  }
  // ngang (nhìn sang phải)
  g.ellipse(25, 17 + b, 10, 9.5, P.skin);
  g.ellipse(25, 17 + b, 10, 9.5, P.hair, (x, y) => x < 23 || y < 14 + b + (x % 3 === 0 ? 1 : 0));
  g.set(22, 20 + b, P.skinDark); // tai
  g.rect(30, 18 + b, 2, 3, P.eye);
  g.set(30, 18 + b, P.eyeHi);
  g.rect(28, 22 + b, 2, 1, P.blush);
  g.set(33, 23 + b, P.mouth);
}

export function drawHeroFrame(cls: ClassId, weapon: string, d: Dir, anim: HeroAnim, i: number): PixelGrid {
  const g = new PixelGrid(FRAME, FRAME);
  const c = COSTUMES[cls];
  const p = poseFor(anim, i);
  const grip = gripFor(weaponKind(weapon), d, p);
  const b = p.bob;

  if (!grip.front) drawWeapon(g, weapon, grip.hx, grip.hy, grip.ang);
  c.back?.(g, d, p);

  // tay phía xa (hướng ngang) nằm sau thân
  if (d === 'side') {
    drawArm(g, c, 22, 27 + b, 20 - p.swing * 2, 33 + b, true);
    drawHand(g, 20 - p.swing * 2, 33 + b);
  }

  drawLegs(g, c, d, p);

  // thân
  const tx = d === 'side' ? 18 : 16, tw = d === 'side' ? 13 : 16;
  g.rrect(tx, 25 + b, tw, 12, c.torso);
  g.rect(tx + tw - 2, 27 + b, 2, 9, c.torsoDark); // bóng sườn phải
  c.body?.(g, d, p);

  // tay áo
  drawArm(g, c, grip.sx, grip.sy, grip.hx, grip.hy);
  if (d !== 'side') {
    // tay không cầm vũ khí, vung ngược nhịp đi
    const ox = d === 'down' ? 34 : 14, oy = 27 + b;
    const hx = d === 'down' ? 35 : 13, hy = 34 + b + (d === 'down' ? -p.swing : p.swing) - (p.atk === 1 ? 1 : 0);
    drawArm(g, c, ox, oy, hx, hy);
    drawHand(g, hx, hy);
  }
  c.shoulders?.(g, d, p);

  drawHead(g, d, p);
  c.hat(g, d, p);

  if (grip.front) drawWeapon(g, weapon, grip.hx, grip.hy, grip.ang);
  drawHand(g, grip.hx, grip.hy);

  g.outline(P.outline);
  return g;
}

/** Danh sách khung theo thứ tự đặt trong spritesheet: `${anim}_${dir}_${i}`. */
export function heroFrameList(): { name: string; anim: HeroAnim; dir: Dir; i: number }[] {
  const out: { name: string; anim: HeroAnim; dir: Dir; i: number }[] = [];
  for (const anim of Object.keys(HERO_ANIMS) as HeroAnim[]) {
    for (const dir of DIRS) {
      for (let i = 0; i < HERO_ANIMS[anim].frames; i++) out.push({ name: `${anim}_${dir}_${i}`, anim, dir, i });
    }
  }
  return out;
}
