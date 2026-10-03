// Toàn bộ hình ảnh MVP được vẽ bằng code (không cần file ảnh) để test gameplay trước.
// Khi có art thật: thay bằng this.load.spritesheet(...) với cùng key texture.

import Phaser from 'phaser';
import { TILE } from '../../../shared/constants.ts';
import { MAP_W, MAP_H, WORLD_W, WORLD_H, T, tileAt } from '../../../shared/map.ts';
import type { GameMap } from '../../../shared/map.ts';
import { CLASSES } from '../../../shared/data.ts';
import type { ClassId } from '../../../shared/data.ts';

function hash(x: number, y: number, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function darken(c: number, k: number) {
  const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

function drawTile(g: Phaser.GameObjects.Graphics, t: number, tx: number, ty: number) {
  const x = tx * TILE, y = ty * TILE;
  const grass = (base: number) => {
    g.fillStyle(base, 1); g.fillRect(x, y, TILE, TILE);
    for (let i = 0; i < 3; i++) {
      g.fillStyle(darken(base, 0.85), 1);
      g.fillRect(x + hash(tx, ty, i) * 28, y + hash(ty, tx, i) * 28, 3, 2);
    }
  };
  switch (t) {
    case T.GRASS: grass(0x5c9e4c); break;
    case T.GRASS2: grass(0x56954a); break;
    case T.FLOWER: {
      grass(0x5c9e4c);
      const cols = [0xf2e266, 0xf28fb5, 0xffffff];
      for (let i = 0; i < 3; i++) {
        g.fillStyle(cols[i], 1);
        g.fillCircle(x + 6 + hash(tx, ty, i + 9) * 20, y + 6 + hash(ty, tx, i + 9) * 20, 2);
      }
      break;
    }
    case T.PATH: {
      g.fillStyle(0xc8a46e, 1); g.fillRect(x, y, TILE, TILE);
      g.fillStyle(0xb38f5a, 1);
      for (let i = 0; i < 4; i++) g.fillRect(x + hash(tx, ty, i) * 28, y + hash(ty, tx, i) * 28, 3, 3);
      break;
    }
    case T.PLAZA: {
      g.fillStyle(0xd9c59d, 1); g.fillRect(x, y, TILE, TILE);
      g.lineStyle(1, 0xc2ad84, 1); g.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      break;
    }
    case T.STONE: {
      g.fillStyle(0x8e8b86, 1); g.fillRect(x, y, TILE, TILE);
      g.lineStyle(1, 0x77746f, 1);
      g.strokeRect(x + 0.5, y + 0.5, 16, 16); g.strokeRect(x + 16.5, y + 16.5, 15, 15);
      break;
    }
    case T.TREE: {
      grass(0x4f8f43);
      g.fillStyle(0x000000, 0.18); g.fillEllipse(x + 17, y + 26, 26, 10);
      g.fillStyle(0x6b4a2b, 1); g.fillRect(x + 13, y + 18, 6, 10);
      g.fillStyle(0x2f6b34, 1); g.fillCircle(x + 16, y + 13, 13);
      g.fillStyle(0x3d8a42, 1); g.fillCircle(x + 12, y + 10, 7);
      break;
    }
    case T.WATER: {
      g.fillStyle(0x3f7fc0, 1); g.fillRect(x, y, TILE, TILE);
      g.lineStyle(2, 0x6aa6e0, 0.8);
      g.beginPath();
      g.moveTo(x + 4 + hash(tx, ty) * 8, y + 12); g.lineTo(x + 14 + hash(tx, ty) * 8, y + 12);
      g.moveTo(x + 10, y + 24); g.lineTo(x + 22, y + 24);
      g.strokePath();
      break;
    }
    case T.ROCK: {
      grass(0x5c9e4c);
      g.fillStyle(0x6f6d69, 1); g.fillEllipse(x + 16, y + 18, 26, 20);
      g.fillStyle(0x8f8c87, 1); g.fillEllipse(x + 13, y + 14, 14, 9);
      break;
    }
    case T.HOUSE: {
      g.fillStyle(0xa04a33, 1); g.fillRect(x, y, TILE, TILE);
      g.lineStyle(2, 0x7f3826, 1);
      g.beginPath(); g.moveTo(x, y + 10); g.lineTo(x + TILE, y + 10); g.moveTo(x, y + 22); g.lineTo(x + TILE, y + 22); g.strokePath();
      break;
    }
    case T.FOUNTAIN: {
      g.fillStyle(0xd9c59d, 1); g.fillRect(x, y, TILE, TILE);
      break;
    }
  }
}

export function makeMapTexture(scene: Phaser.Scene, map: GameMap) {
  const g = scene.add.graphics();
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) drawTile(g, tileAt(map, tx, ty), tx, ty);

  // Giếng Làng & Cây Đa cổ thụ trang trí làng
  const f = map.fountain;
  // Sân lát đá quanh giếng
  g.fillStyle(0x78716c, 1); g.fillCircle(f.x, f.y, 28);
  g.fillStyle(0xa8a29e, 1);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    g.fillCircle(f.x + Math.cos(a) * 24, f.y + Math.sin(a) * 24, 3);
  }
  // Thành giếng đá
  g.fillStyle(0x57534e, 1); g.fillCircle(f.x, f.y, 22);
  g.fillStyle(0x44403c, 1); g.fillCircle(f.x, f.y, 18);
  // Nước giếng sâu mát lành
  g.fillStyle(0x0f2b48, 1); g.fillCircle(f.x, f.y, 16);
  g.fillStyle(0x2563eb, 0.85); g.fillCircle(f.x, f.y, 13);
  g.fillStyle(0x60a5fa, 0.9); g.fillCircle(f.x - 3, f.y - 3, 4);
  // Thanh gỗ gác giếng & gàu nước
  g.fillStyle(0x78350f, 1); g.fillRect(f.x - 18, f.y - 3, 36, 6);
  g.fillStyle(0xd97706, 1); g.fillRect(f.x - 4, f.y - 2, 8, 4);
  // Hào quang hồi phục sinh lực quanh giếng
  g.lineStyle(2, 0x4ade80, 0.35); g.strokeCircle(f.x, f.y, f.r);

  // Cây đa cổ thụ trang trí cạnh giếng làng (chỉ là hình vẽ trang trí)
  const tx = f.x + 56, ty = f.y - 6;
  g.fillStyle(0x000000, 0.22); g.fillEllipse(tx, ty + 16, 56, 22);
  // Thân đa và rễ phụ
  g.fillStyle(0x3f1f0a, 1); g.fillRect(tx - 8, ty - 10, 16, 24);
  g.fillStyle(0x5a2d10, 1);
  g.fillRect(tx - 14, ty + 2, 6, 14);
  g.fillRect(tx + 8, ty + 4, 6, 12);
  // Tán lá đa cổ thụ nhiều tầng
  g.fillStyle(0x14532d, 1); g.fillCircle(tx, ty - 22, 28);
  g.fillStyle(0x166534, 1); g.fillCircle(tx - 12, ty - 18, 20);
  g.fillStyle(0x15803d, 1); g.fillCircle(tx + 12, ty - 20, 19);
  g.fillStyle(0x22c55e, 0.75); g.fillCircle(tx, ty - 30, 13);

  g.generateTexture('map', WORLD_W, WORLD_H);
  g.destroy();
}

function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** Nhân vật nhìn từ trên xuống, hướng mặt về +x (xoay theo góc f). */
function drawHero(g: Phaser.GameObjects.Graphics, cls: ClassId) {
  const c = CLASSES[cls].color;
  const cx = 24, cy = 24;
  // vũ khí
  if (cls === 'warrior') {
    g.fillStyle(0xdedede, 1); g.fillRect(cx + 6, cy + 6, 18, 4);
    g.fillStyle(0x8a6a3a, 1); g.fillRect(cx + 3, cy + 4, 5, 8);
  } else if (cls === 'archer') {
    g.lineStyle(3, 0x8a5a2b, 1);
    g.beginPath(); g.arc(cx + 8, cy, 14, -1.2, 1.2, false); g.strokePath();
    g.lineStyle(1, 0xf5f5f5, 1);
    g.beginPath(); g.moveTo(cx + 8 + Math.cos(-1.2) * 14, cy + Math.sin(-1.2) * 14); g.lineTo(cx + 8 + Math.cos(1.2) * 14, cy + Math.sin(1.2) * 14); g.strokePath();
  } else {
    g.fillStyle(0x7a5230, 1); g.fillRect(cx + 4, cy + 8, 18, 3);
    g.fillStyle(0x9fd8ff, 1); g.fillCircle(cx + 22, cy + 9, 4);
  }
  // thân
  g.fillStyle(darken(c, 0.55), 1); g.fillCircle(cx, cy, 13);
  g.fillStyle(c, 1); g.fillCircle(cx, cy, 11);
  // đầu + mắt (hướng mặt)
  g.fillStyle(0xf1c9a5, 1); g.fillCircle(cx + 3, cy, 6);
  g.fillStyle(0x222222, 1); g.fillCircle(cx + 6, cy - 2.5, 1.4); g.fillCircle(cx + 6, cy + 2.5, 1.4);
  if (cls === 'mage') { g.fillStyle(darken(c, 0.7), 1); g.fillTriangle(cx - 4, cy - 7, cx - 4, cy + 7, cx - 12, cy); }
}

export function makeTextures(scene: Phaser.Scene) {
  for (const cls of ['warrior', 'archer', 'mage'] as ClassId[]) tex(scene, `hero_${cls}`, 48, 48, (g) => drawHero(g, cls));

  tex(scene, 'shadow', 32, 12, (g) => { g.fillStyle(0x000000, 0.25); g.fillEllipse(16, 6, 30, 10); });

  // Bánh Trôi Tinh: tròn trắng bột nếp, má hồng, nhân đường đỏ ngọt ngào
  tex(scene, 'mob_slime', 32, 28, (g) => {
    g.fillStyle(0xd5cfc7, 1); g.fillEllipse(16, 16, 30, 22);
    g.fillStyle(0xfaf8f5, 1); g.fillEllipse(16, 14, 26, 19);
    // Vệt bóng sáng trắng
    g.fillStyle(0xffffff, 0.9); g.fillEllipse(11, 9, 8, 4);
    // Đốm nhân đường đỏ hình trái tim nhỏ ở bụng
    g.fillStyle(0xe11d48, 1);
    g.fillCircle(14.5, 17, 2.5); g.fillCircle(17.5, 17, 2.5);
    g.fillTriangle(12, 17.5, 20, 17.5, 16, 21.5);
    // Má hồng
    g.fillStyle(0xfca5a5, 0.65); g.fillCircle(8, 14, 3); g.fillCircle(24, 14, 3);
    // Mắt tròn xoe
    g.fillStyle(0x18181b, 1); g.fillCircle(11, 13, 2.2); g.fillCircle(21, 13, 2.2);
    g.fillStyle(0xffffff, 1); g.fillCircle(10.2, 12.2, 0.8); g.fillCircle(20.2, 12.2, 0.8);
  });

  // Cáo Tinh: cáo cam đuôi bông có đốm lửa vàng, quàng khăn đỏ
  tex(scene, 'mob_wolf', 44, 30, (g) => {
    // Đuôi cáo xù cam với chóp lửa vàng
    g.fillStyle(0xc2530c, 1); g.fillTriangle(0, 15, 12, 9, 12, 21);
    g.fillStyle(0xe06a1b, 1); g.fillCircle(8, 15, 6);
    g.fillStyle(0xfacc15, 1); g.fillCircle(3, 15, 3.5); // Đốm lửa chóp đuôi
    g.fillStyle(0xfef08a, 1); g.fillCircle(2, 15, 1.8);
    // Thân cáo cam
    g.fillStyle(0xc2530c, 1); g.fillEllipse(20, 15, 24, 16);
    g.fillStyle(0xf97316, 1); g.fillEllipse(20, 15, 21, 13);
    // Khăn quàng đỏ quanh cổ
    g.fillStyle(0xdc2626, 1); g.fillRect(26, 7, 5, 16); g.fillTriangle(26, 15, 30, 24, 34, 15);
    // Đầu và má lông trắng
    g.fillStyle(0xf97316, 1); g.fillCircle(33, 15, 8.5);
    g.fillStyle(0xffedd5, 1); g.fillCircle(35, 15, 5);
    // Tai nhọn viền tối
    g.fillStyle(0x431407, 1); g.fillTriangle(28, 5, 33, 8, 30, 11); g.fillTriangle(28, 25, 33, 22, 30, 19);
    g.fillStyle(0xf97316, 1); g.fillTriangle(29, 6.5, 32.5, 8.5, 30.5, 10.5); g.fillTriangle(29, 23.5, 32.5, 21.5, 30.5, 19.5);
    // Mắt vàng ranh mãnh & mũi đen
    g.fillStyle(0xfef08a, 1); g.fillCircle(36, 12, 1.8); g.fillCircle(36, 18, 1.8);
    g.fillStyle(0x1c1917, 1); g.fillCircle(36.5, 12, 1); g.fillCircle(36.5, 18, 1);
    g.fillCircle(41, 15, 2);
  });

  // Chúa Mộc Tinh: gốc đa cổ thụ rêu phong, rễ vươn làm tay, tán lá vương miện, ôm Mảnh Trống Đồng
  tex(scene, 'mob_boss', 72, 72, (g) => {
    // Rễ và tay cây cổ thụ
    g.fillStyle(0x271406, 1);
    g.fillRect(10, 42, 20, 8); g.fillRect(44, 42, 20, 8); // Rễ vươn sang hai bên
    g.fillCircle(10, 46, 7); g.fillCircle(62, 46, 7);

    // Thân gốc đa cổ thụ
    g.fillStyle(0x311a09, 1); g.fillCircle(36, 40, 26);
    g.fillStyle(0x452914, 1); g.fillCircle(36, 40, 23);
    // Vân gỗ & rêu xanh bám trên thân
    g.fillStyle(0x2d4a1d, 0.8);
    g.fillCircle(24, 45, 6); g.fillCircle(48, 44, 7); g.fillCircle(36, 54, 8);

    // Mảnh Trống Đồng ôm trước ngực
    g.fillStyle(0xb45309, 1); g.fillCircle(36, 46, 13);
    g.fillStyle(0xd97706, 1); g.fillCircle(36, 46, 11);
    g.fillStyle(0xfde047, 1); g.fillCircle(36, 46, 5); // Tâm sao trống đồng
    g.lineStyle(1.5, 0xfef08a, 0.9); g.strokeCircle(36, 46, 8);

    // Tán lá xanh đa như vương miện phía trên
    g.fillStyle(0x14532d, 1); g.fillCircle(36, 16, 20);
    g.fillStyle(0x166534, 1); g.fillCircle(22, 18, 15); g.fillCircle(50, 18, 15);
    g.fillStyle(0x22c55e, 0.85); g.fillCircle(36, 12, 11);

    // Khuôn mặt cổ thụ: mắt đỏ ngạo mạn, miệng cười khà khà
    g.fillStyle(0xef4444, 1); g.fillCircle(28, 32, 4); g.fillCircle(44, 32, 4);
    g.fillStyle(0xfef08a, 1); g.fillCircle(29, 32, 1.5); g.fillCircle(43, 32, 1.5);
    // Miệng gỗ nhếch cười
    g.fillStyle(0x180b03, 1);
    g.beginPath(); g.arc(36, 37, 8, 0.2, Math.PI - 0.2, false); g.fillPath();
  });

  tex(scene, 'arrow', 20, 6, (g) => {
    g.fillStyle(0xd8c39a, 1); g.fillRect(2, 2, 14, 2);
    g.fillStyle(0xeeeeee, 1); g.fillTriangle(14, 0, 20, 3, 14, 6);
    g.fillStyle(0xffffff, 1); g.fillRect(0, 1, 4, 1); g.fillRect(0, 4, 4, 1);
  });
  tex(scene, 'bolt', 16, 16, (g) => {
    g.fillStyle(0x5b8def, 0.35); g.fillCircle(8, 8, 8);
    g.fillStyle(0x9fd8ff, 1); g.fillCircle(8, 8, 4.5);
    g.fillStyle(0xffffff, 1); g.fillCircle(7, 7, 2);
  });

  tex(scene, 'drop_gold', 14, 14, (g) => {
    g.fillStyle(0xb8860b, 1); g.fillCircle(7, 7, 6.5);
    g.fillStyle(0xffd34d, 1); g.fillCircle(7, 7, 5);
    g.fillStyle(0xfff3b0, 1); g.fillCircle(5.5, 5.5, 1.5);
  });
  tex(scene, 'drop_potion', 14, 18, (g) => {
    g.fillStyle(0x8b5a2b, 1); g.fillRect(5, 0, 4, 3);
    g.fillStyle(0xdddddd, 1); g.fillRect(5, 3, 4, 4);
    g.fillStyle(0xd62f3a, 1); g.fillCircle(7, 12, 6);
    g.fillStyle(0xff9aa1, 1); g.fillCircle(5, 10, 1.6);
  });
  // icon vũ khí màu trắng, tô màu theo độ hiếm bằng setTint
  tex(scene, 'drop_weapon', 20, 20, (g) => {
    g.fillStyle(0xffffff, 0.25); g.fillCircle(10, 10, 10);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(15, 2, 18, 2, 18, 5);
    g.lineStyle(3, 0xffffff, 1); g.beginPath(); g.moveTo(16.5, 3.5); g.lineTo(6, 14); g.strokePath();
    g.fillRect(3, 12, 6, 2); g.fillRect(5, 15, 3, 3);
  });
}
