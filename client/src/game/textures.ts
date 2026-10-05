// Toàn bộ hình ảnh MVP được vẽ bằng code (không cần file ảnh) để test gameplay trước.
// Khi có art thật: thay bằng this.load.spritesheet(...) với cùng key texture.

import Phaser from 'phaser';
import { TILE } from '../../../shared/constants.ts';
import { MAP_W, MAP_H, WORLD_W, WORLD_H, T, tileAt } from '../../../shared/map.ts';
import type { GameMap } from '../../../shared/map.ts';
import { registerSpriteTextures } from './sprites/sheet.ts';

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
    case T.PORTAL: {
      // nền đá lát với vòng sáng tím nhạt (hiệu ứng nhấp nháy vẽ thêm ở WorldScene)
      g.fillStyle(0x8e8b86, 1); g.fillRect(x, y, TILE, TILE);
      g.fillStyle(0x6d5a8c, 1); g.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
      g.fillStyle(0xa58fd6, 0.9); g.fillRect(x + 7, y + 7, TILE - 14, TILE - 14);
      g.fillStyle(0xe9ddff, 0.9); g.fillRect(x + 13, y + 13, 6, 6);
      break;
    }
    case T.LOTUS: {
      g.fillStyle(0x3a86a8, 1); g.fillRect(x, y, TILE, TILE);
      // lá sen tròn có khe
      const lx = x + 9 + hash(tx, ty, 3) * 14, ly = y + 9 + hash(ty, tx, 3) * 14;
      g.fillStyle(0x2f7a3a, 1); g.fillCircle(lx, ly, 8);
      g.fillStyle(0x4c9a45, 1); g.fillCircle(lx - 1, ly - 1, 6.5);
      g.fillStyle(0x3a86a8, 1); g.fillTriangle(lx, ly, lx + 8, ly - 3, lx + 8, ly + 3);
      if (hash(tx, ty, 5) > 0.55) {
        // hoa sen hồng
        const fx = x + 6 + hash(tx, ty, 7) * 20, fy = y + 6 + hash(ty, tx, 7) * 20;
        g.fillStyle(0xf28fb5, 1); g.fillCircle(fx, fy, 3.5);
        g.fillStyle(0xffd1e3, 1); g.fillCircle(fx, fy - 1, 2);
        g.fillStyle(0xf2e266, 1); g.fillCircle(fx, fy, 1);
      }
      break;
    }
    case T.BRIDGE: {
      g.fillStyle(0x3f7fc0, 1); g.fillRect(x, y, TILE, TILE);
      g.fillStyle(0x7a5231, 1); g.fillRect(x, y + 2, TILE, TILE - 4);
      g.fillStyle(0x9c6b40, 1);
      for (let i = 0; i < 4; i++) g.fillRect(x + 1 + i * 8, y + 3, 6, TILE - 6);
      g.fillStyle(0x5a3a20, 1); g.fillRect(x, y + 2, TILE, 2); g.fillRect(x, y + TILE - 4, TILE, 2);
      break;
    }
    case T.DOCK: {
      g.fillStyle(0x8a6240, 1); g.fillRect(x, y, TILE, TILE);
      g.fillStyle(0xa77a52, 1);
      for (let i = 0; i < 4; i++) g.fillRect(x + 1, y + 1 + i * 8, TILE - 2, 6);
      g.fillStyle(0x5a3a20, 1);
      g.fillRect(x + 4 + hash(tx, ty) * 4, y + 3, 2, 2); g.fillRect(x + 24, y + 19, 2, 2);
      break;
    }
    case T.REED: {
      g.fillStyle(0x3a86a8, 1); g.fillRect(x, y, TILE, TILE);
      g.fillStyle(0x4a7a3a, 1); g.fillRect(x, y + 20, TILE, 12);
      for (let i = 0; i < 6; i++) {
        const sx = x + 2 + i * 5 + hash(tx, ty, i) * 3;
        g.fillStyle(i % 2 ? 0x6b8f3a : 0x8aa64a, 1); g.fillRect(sx, y + 4 + hash(ty, tx, i) * 6, 2, 26);
        g.fillStyle(0x7a5231, 1); g.fillRect(sx - 1, y + 2 + hash(ty, tx, i) * 6, 4, 5);
      }
      break;
    }
  }
}

export function makeMapTexture(scene: Phaser.Scene, map: GameMap): string {
  const key = 'map_' + map.id;
  if (scene.textures.exists(key)) return key;
  const g = scene.add.graphics();
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) drawTile(g, tileAt(map, tx, ty), tx, ty);
  if (map.id === 'dam_sen') drawBenDo(g, map);
  else if (map.id === 'vuon_nha') drawVuonNha(g, map);
  else drawLangTre(g, map);
  g.generateTexture(key, WORLD_W, WORLD_H);
  g.destroy();
  return key;
}

function drawLangTre(g: Phaser.GameObjects.Graphics, map: GameMap) {
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
}

function drawBenDo(g: Phaser.GameObjects.Graphics, map: GameMap) {
  // Chum Sen: chum gốm lớn trồng sen giữa bến, hồi sinh lực như giếng làng
  const f = map.fountain;
  g.fillStyle(0x000000, 0.22); g.fillEllipse(f.x, f.y + 18, 54, 16);
  g.fillStyle(0x7c3f1d, 1); g.fillCircle(f.x, f.y + 2, 24);
  g.fillStyle(0x9a5228, 1); g.fillCircle(f.x - 3, f.y, 21);
  g.lineStyle(2, 0x5c2c12, 1); g.strokeCircle(f.x, f.y + 2, 17);
  // miệng chum có nước và lá sen
  g.fillStyle(0x5c2c12, 1); g.fillEllipse(f.x, f.y - 6, 34, 16);
  g.fillStyle(0x2f6f9a, 1); g.fillEllipse(f.x, f.y - 6, 28, 12);
  g.fillStyle(0x4c9a45, 1); g.fillCircle(f.x - 6, f.y - 7, 5); g.fillCircle(f.x + 7, f.y - 5, 4);
  // búp sen hồng vươn lên
  g.fillStyle(0x3d7a35, 1); g.fillRect(f.x - 1, f.y - 22, 2, 14);
  g.fillStyle(0xf28fb5, 1); g.fillEllipse(f.x, f.y - 24, 8, 11);
  g.fillStyle(0xffd1e3, 1); g.fillEllipse(f.x - 1, f.y - 26, 4, 6);
  // Hào quang hồi phục sinh lực
  g.lineStyle(2, 0x4ade80, 0.35); g.strokeCircle(f.x, f.y, f.r);

  // Con đò neo cạnh cầu tàu
  const bx = 27.5 * TILE, by = 52.2 * TILE;
  g.fillStyle(0x000000, 0.2); g.fillEllipse(bx, by + 8, 76, 14);
  g.fillStyle(0x4a2c17, 1); g.fillEllipse(bx, by, 74, 22);
  g.fillStyle(0x6b4024, 1); g.fillEllipse(bx, by - 2, 66, 15);
  g.fillStyle(0x8a5a34, 1); g.fillRect(bx - 26, by - 4, 52, 3);
  // mui thuyền tre
  g.fillStyle(0x3b2a1a, 1); g.fillEllipse(bx + 4, by - 9, 30, 16);
  g.fillStyle(0xb8955a, 1); g.fillEllipse(bx + 4, by - 10, 26, 12);
  g.lineStyle(1, 0x8a6a3a, 1);
  for (let i = -9; i <= 9; i += 6) { g.beginPath(); g.moveTo(bx + 4 + i, by - 15); g.lineTo(bx + 4 + i, by - 5); g.strokePath(); }
  // dây neo vào cọc
  g.lineStyle(1, 0xd6c49a, 1); g.beginPath(); g.moveTo(bx - 32, by - 2); g.lineTo(bx - 40, by - 16); g.strokePath();
}

function drawVuonNha(g: Phaser.GameObjects.Graphics, map: GameMap) {
  // 1. Giếng Nước Sân Nhà & Hào quang hồi phục
  const f = map.fountain;
  // Sân lát đá quanh giếng
  g.fillStyle(0x78716c, 1); g.fillCircle(f.x, f.y, 26);
  g.fillStyle(0xa8a29e, 1);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    g.fillCircle(f.x + Math.cos(a) * 22, f.y + Math.sin(a) * 22, 2.5);
  }
  // Thành giếng đá
  g.fillStyle(0x57534e, 1); g.fillCircle(f.x, f.y, 19);
  g.fillStyle(0x44403c, 1); g.fillCircle(f.x, f.y, 15);
  // Nước giếng trong mát
  g.fillStyle(0x0f2b48, 1); g.fillCircle(f.x, f.y, 13);
  g.fillStyle(0x2563eb, 0.85); g.fillCircle(f.x, f.y, 10);
  g.fillStyle(0x60a5fa, 0.9); g.fillCircle(f.x - 2, f.y - 2, 3);
  // Gác gỗ & gàu múc nước
  g.fillStyle(0x78350f, 1); g.fillRect(f.x - 16, f.y - 3, 32, 5);
  g.fillStyle(0xd97706, 1); g.fillRect(f.x - 3, f.y - 2, 6, 4);
  // Hào quang hồi phục sinh lực
  g.lineStyle(2, 0x4ade80, 0.35); g.strokeCircle(f.x, f.y, f.r);

  // 2. Gian Nhà Ngói Ba Gian Bắc Bộ (x: 14..21, y: 39..42)
  const hx = 14 * TILE, hy = 39 * TILE;
  const hw = 8 * TILE, hh = 4 * TILE;
  // Bóng đổ nhà
  g.fillStyle(0x000000, 0.25); g.fillRect(hx - 4, hy + hh - 4, hw + 8, 16);
  // Tường nhà gạch mộc cổ kính
  g.fillStyle(0xa04a33, 1); g.fillRect(hx, hy + 24, hw, hh - 24);
  // Nền hiên nhà lát gạch đỏ
  g.fillStyle(0xb91c1c, 1); g.fillRect(hx, hy + hh - 14, hw, 14);
  // Hàng cột gỗ lim nâng mái hiên
  for (let c = 0; c < 5; c++) {
    const cx = hx + 12 + c * 58;
    g.fillStyle(0x451a03, 1); g.fillRect(cx, hy + 30, 8, hh - 30);
    g.fillStyle(0x78350f, 1); g.fillRect(cx + 1, hy + 30, 2, hh - 30);
  }
  // Cửa gỗ ba gian
  for (let d = 0; d < 3; d++) {
    const dx = hx + 32 + d * 70;
    g.fillStyle(0x3b1802, 1); g.fillRect(dx, hy + 46, 32, hh - 46);
    g.fillStyle(0x78350f, 1); g.fillRect(dx + 2, hy + 48, 13, hh - 50);
    g.fillStyle(0x78350f, 1); g.fillRect(dx + 17, hy + 48, 13, hh - 50);
    // then cài cửa
    g.fillStyle(0xfacc15, 1); g.fillCircle(dx + 16, hy + 76, 2);
  }
  // Mái ngói đỏ đất nung vát cong
  g.fillStyle(0x991b1b, 1);
  g.beginPath();
  g.moveTo(hx - 12, hy + 36);
  g.lineTo(hx + hw / 2, hy - 6);
  g.lineTo(hx + hw + 12, hy + 36);
  g.closePath();
  g.fillPath();
  // Lớp ngói màu sáng hơn
  g.fillStyle(0xb91c1c, 1);
  g.beginPath();
  g.moveTo(hx - 6, hy + 34);
  g.lineTo(hx + hw / 2, hy - 4);
  g.lineTo(hx + hw + 6, hy + 34);
  g.closePath();
  g.fillPath();
  // Bờ nóc mái ngói (kìm nóc uốn cong)
  g.fillStyle(0x7f1d1d, 1); g.fillRect(hx + 10, hy - 7, hw - 20, 5);
  g.fillStyle(0xd97706, 1);
  g.fillCircle(hx + 10, hy - 8, 4);
  g.fillCircle(hx + hw - 10, hy - 8, 4);
  // Hàng ngói âm dương kẻ dọc
  g.lineStyle(1, 0x7f1d1d, 0.7);
  for (let r = hx + 14; r < hx + hw - 14; r += 12) {
    g.beginPath(); g.moveTo(r, hy + 32); g.lineTo(hx + hw / 2 + (r - (hx + hw / 2)) * 0.3, hy - 4); g.strokePath();
  }

  // 3. Đống Rơm Vàng (Cây Rơm Góc Vườn) tại x: 12.2 * TILE, y: 41.5 * TILE
  const rx = 12.2 * TILE, ry = 41.5 * TILE;
  // Bóng cây rơm
  g.fillStyle(0x000000, 0.22); g.fillEllipse(rx, ry + 16, 56, 18);
  // Thân cây rơm hình nón úp ngược
  g.fillStyle(0xb45309, 1); g.fillCircle(rx, ry + 2, 24);
  g.fillStyle(0xd97706, 1); g.fillCircle(rx, ry - 4, 20);
  g.fillStyle(0xeab308, 1); g.fillCircle(rx, ry - 12, 15);
  g.fillStyle(0xfde047, 1); g.fillCircle(rx, ry - 18, 9);
  // Cột tre nhô lên cắm nón che mưa
  g.fillStyle(0x65a30d, 1); g.fillRect(rx - 1.5, ry - 30, 3, 14);
  g.fillStyle(0x78350f, 1); g.fillTriangle(rx - 6, ry - 24, rx + 6, ry - 24, rx, ry - 31);
  // Vài sợi rơm vàng rủ xuống
  g.lineStyle(1.5, 0xfde047, 0.9);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.2 + (i / 6) * Math.PI * 1.4;
    g.beginPath(); g.moveTo(rx + Math.cos(a) * 16, ry + Math.sin(a) * 16);
    g.lineTo(rx + Math.cos(a) * 22, ry + Math.sin(a) * 22 + 4);
    g.strokePath();
  }

  // 4. Cối Xay Lúa / Cối Giã Đá ở góc hiên x: 13.2 * TILE, y: 44.8 * TILE
  const mx = 13.2 * TILE, my = 44.8 * TILE;
  g.fillStyle(0x000000, 0.2); g.fillEllipse(mx, my + 6, 32, 12);
  // Thớt cối đá tròn
  g.fillStyle(0x78716c, 1); g.fillCircle(mx, my, 12);
  g.fillStyle(0xa8a29e, 1); g.fillCircle(mx - 1, my - 1, 10);
  g.fillStyle(0x57534e, 1); g.fillCircle(mx, my, 4);
  // Giàng xay (tay đòn quay gỗ)
  g.lineStyle(3, 0x6b4226, 1); g.beginPath(); g.moveTo(mx - 14, my - 8); g.lineTo(mx + 14, my + 8); g.strokePath();
  g.fillStyle(0x3e2312, 1); g.fillCircle(mx - 14, my - 8, 3.5);
  // Thúng hứng gạo cám màu nan tre vàng óng
  g.fillStyle(0xca8a04, 1); g.fillCircle(mx + 16, my + 4, 9);
  g.fillStyle(0xfde047, 1); g.fillCircle(mx + 16, my + 4, 7);
  g.fillStyle(0xffffff, 0.9); g.fillCircle(mx + 16, my + 4, 4); // hạt gạo trắng

  // 5. Chuồng Gà Mái Tranh & Hàng Rào Giậu Tre (x: 21..27, y: 19..25)
  // Chuồng gỗ: x: 22..26, y: 19..21
  const chX = 22 * TILE, chY = 19 * TILE;
  const chW = 5 * TILE, chH = 3 * TILE;
  g.fillStyle(0x000000, 0.22); g.fillRect(chX - 2, chY + chH - 4, chW + 4, 12);
  // Vách nứa chuồng gà
  g.fillStyle(0x854d0e, 1); g.fillRect(chX, chY + 16, chW, chH - 16);
  // Cửa chuồng gà và cầu thang gỗ cho gà leo
  g.fillStyle(0x3e2312, 1); g.fillRect(chX + 24, chY + chH - 26, 20, 26);
  g.fillStyle(0xca8a04, 1); g.fillRect(chX + 26, chY + chH - 8, 16, 20); // cầu gỗ
  g.lineStyle(1, 0x78350f, 1);
  for (let s = chY + chH - 6; s <= chY + chH + 10; s += 4) {
    g.beginPath(); g.moveTo(chX + 26, s); g.lineTo(chX + 42, s); g.strokePath();
  }
  // Mái tranh chuồng gà
  g.fillStyle(0xa16207, 1);
  g.beginPath();
  g.moveTo(chX - 8, chY + 22);
  g.lineTo(chX + chW / 2, chY - 4);
  g.lineTo(chX + chW + 8, chY + 22);
  g.closePath();
  g.fillPath();
  g.fillStyle(0xca8a04, 1);
  g.beginPath();
  g.moveTo(chX - 4, chY + 20);
  g.lineTo(chX + chW / 2, chY - 2);
  g.lineTo(chX + chW + 4, chY + 20);
  g.closePath();
  g.fillPath();

  // Hàng rào giậu tre quanh sân chuồng (x: 21..27, y: 22..25)
  const fx0 = 21 * TILE, fy0 = 22 * TILE, fx1 = 28 * TILE, fy1 = 26 * TILE;
  // Cọc rào tre và thanh ngang
  g.lineStyle(2, 0x854d0e, 0.9);
  // cọc dọc
  for (let px = fx0; px <= fx1; px += 16) {
    g.beginPath(); g.moveTo(px, fy1); g.lineTo(px, fy1 - 18); g.strokePath();
  }
  for (let py = fy0; py <= fy1; py += 16) {
    g.beginPath(); g.moveTo(fx0, py); g.lineTo(fx0, py - 18); g.strokePath();
    g.beginPath(); g.moveTo(fx1, py); g.lineTo(fx1, py - 18); g.strokePath();
  }
  // giằng ngang nan tre
  g.lineStyle(1.5, 0xa16207, 0.8);
  g.beginPath(); g.moveTo(fx0, fy1 - 6); g.lineTo(fx1, fy1 - 6); g.strokePath();
  g.beginPath(); g.moveTo(fx0, fy1 - 13); g.lineTo(fx1, fy1 - 13); g.strokePath();
  g.beginPath(); g.moveTo(fx0, fy0 - 6); g.lineTo(fx0, fy1 - 6); g.strokePath();
  g.beginPath(); g.moveTo(fx1, fy0 - 6); g.lineTo(fx1, fy1 - 6); g.strokePath();

  // Máng ăn cho gà bằng ống tre chẻ đôi ở góc sân
  const gx = 24.5 * TILE, gy = 23.5 * TILE;
  g.fillStyle(0x573a1e, 1); g.fillRect(gx - 18, gy - 4, 36, 8);
  g.fillStyle(0x854d0e, 1); g.fillRect(gx - 16, gy - 2, 32, 5);
  g.fillStyle(0xfde047, 0.85); g.fillRect(gx - 14, gy - 1, 28, 3); // hạt thóc vàng

  // 6. Khu Ruộng Lúa Nước (Bờ Ruộng)
  const plotCoords = [
    [5, 22], [9, 22],
    [5, 25], [9, 25],
    [5, 28], [9, 28],
    [5, 31], [9, 31],
  ];
  for (const [px, py] of plotCoords) {
    const bx = px * TILE, by = py * TILE;
    const bw = 2 * TILE, bh = 2 * TILE;
    // Bờ ruộng đất nện viền quanh thửa ruộng
    g.lineStyle(4, 0x4a3219, 1);
    g.strokeRect(bx + 2, by + 2, bw - 4, bh - 4);
    g.lineStyle(1.5, 0x6b4a2b, 0.9);
    g.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
    // Lòng ruộng phù sa ẩm mịn
    g.fillStyle(0x3e2b19, 1);
    g.fillRect(bx + 4, by + 4, bw - 8, bh - 8);
    // Vệt nước sâm sấp bùn phản chiếu ánh trời
    g.fillStyle(0x4a6b82, 0.4);
    g.fillRect(bx + 6, by + 6, bw - 12, bh - 12);
  }

  // 7. Bụi Chuối Ven Ao (x: 14 * TILE, y: 17 * TILE)
  const czX = 14 * TILE, czY = 17 * TILE;
  g.fillStyle(0x000000, 0.2); g.fillEllipse(czX, czY + 6, 34, 12);
  // Thân chuối
  g.fillStyle(0x4d7c0f, 1); g.fillRect(czX - 3, czY - 14, 6, 20);
  g.fillStyle(0x65a30d, 1); g.fillRect(czX - 1, czY - 14, 3, 20);
  // Tàu lá chuối xòe rộng
  g.fillStyle(0x65a30d, 0.95);
  g.fillEllipse(czX - 16, czY - 18, 28, 10);
  g.fillEllipse(czX + 16, czY - 16, 26, 9);
  g.fillEllipse(czX, czY - 26, 12, 24);
  // Bắp chuối tím hé nở
  g.fillStyle(0x831843, 1); g.fillEllipse(czX + 4, czY - 4, 6, 10);
}


function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

export function makeTextures(scene: Phaser.Scene) {
  // Nhân vật, NPC và icon vũ khí là pixel art dựng trong sprites/sheet.ts
  registerSpriteTextures(scene);

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

  // Cua Đá: mai cua xám đá sần sùi, 2 càng đá to khoẻ phía trước
  tex(scene, 'mob_crab', 36, 30, (g) => {
    // Chân cua 2 bên
    g.fillStyle(0x44403c, 1);
    for (let i = 0; i < 3; i++) {
      g.fillRect(3, 8 + i * 6, 8, 3);
      g.fillRect(25, 8 + i * 6, 8, 3);
    }
    // Càng cua to 2 bên phía trước
    g.fillStyle(0x57534e, 1);
    g.fillCircle(7, 7, 6); g.fillCircle(29, 7, 6);
    g.fillStyle(0x78716c, 1);
    g.fillCircle(7, 5, 4.5); g.fillCircle(29, 5, 4.5);
    // Kẹp càng
    g.fillStyle(0xd6d3d1, 1);
    g.fillTriangle(4, 3, 7, 0, 7, 4); g.fillTriangle(8, 0, 11, 3, 8, 4);
    g.fillTriangle(26, 3, 29, 0, 29, 4); g.fillTriangle(30, 0, 33, 3, 30, 4);
    // Mai cua tròn dẹt gồ ghề vân đá
    g.fillStyle(0x292524, 1); g.fillEllipse(18, 17, 24, 18);
    g.fillStyle(0x57534e, 1); g.fillEllipse(18, 16, 21, 15);
    g.fillStyle(0x78716c, 1);
    g.fillCircle(14, 14, 3.5); g.fillCircle(21, 18, 4); g.fillCircle(17, 19, 3);
    // Gai đá trên mai
    g.fillStyle(0xa8a29e, 1);
    g.fillCircle(14, 13, 1.5); g.fillCircle(21, 17, 1.5);
    // Mắt nhỏ tròn
    g.fillStyle(0x1c1917, 1); g.fillCircle(13, 9, 2); g.fillCircle(23, 9, 2);
    g.fillStyle(0xffffff, 1); g.fillCircle(12.5, 8.5, 0.8); g.fillCircle(22.5, 8.5, 0.8);
  });

  // Ếch Lửa: lưng xanh đốm lửa cam, mắt lồi đỉnh đầu, bụng vàng ấm
  tex(scene, 'mob_frog', 32, 28, (g) => {
    // Chân sau gập
    g.fillStyle(0x14532d, 1);
    g.fillEllipse(6, 20, 8, 12); g.fillEllipse(26, 20, 8, 12);
    // Thân ếch bầu bĩnh
    g.fillStyle(0x166534, 1); g.fillEllipse(16, 17, 22, 18);
    g.fillStyle(0x15803d, 1); g.fillEllipse(16, 16, 19, 15);
    // Đốm lửa cam rực trên lưng
    g.fillStyle(0xea580c, 1);
    g.fillCircle(12, 14, 3); g.fillCircle(20, 15, 3.5); g.fillCircle(16, 19, 2.5);
    g.fillStyle(0xfde047, 1);
    g.fillCircle(12, 14, 1.2); g.fillCircle(20, 15, 1.5);
    // Bụng vàng nhạt
    g.fillStyle(0xfef08a, 0.9); g.fillEllipse(16, 22, 13, 6);
    // Mắt lồi to trên đỉnh đầu
    g.fillStyle(0x166534, 1); g.fillCircle(10, 8, 5); g.fillCircle(22, 8, 5);
    g.fillStyle(0xf97316, 1); g.fillCircle(10, 8, 4); g.fillCircle(22, 8, 4);
    g.fillStyle(0xfef08a, 1); g.fillCircle(10, 8, 2.5); g.fillCircle(22, 8, 2.5);
    g.fillStyle(0x18181b, 1); g.fillCircle(10, 8, 1.3); g.fillCircle(22, 8, 1.3);
  });

  // Thỏ rừng: lông nâu xám, tai dài dựng đứng, đuôi bông trắng (nhìn nghiêng, quay phải)
  tex(scene, 'mob_rabbit', 30, 26, (g) => {
    g.fillStyle(0x7c6a55, 1); g.fillEllipse(6, 20, 9, 6); g.fillEllipse(20, 22, 6, 4); // chân sau, chân trước
    g.fillStyle(0x8f7b63, 1); g.fillEllipse(13, 17, 18, 13); // thân
    g.fillStyle(0xb8a48a, 1); g.fillEllipse(14, 19, 12, 7); // bụng sáng
    g.fillStyle(0xffffff, 1); g.fillCircle(4, 14, 3.2); // đuôi bông
    g.fillStyle(0x8f7b63, 1); g.fillCircle(22, 12, 6); // đầu
    g.fillStyle(0x7c6a55, 1); g.fillEllipse(19, 4, 4, 11); g.fillEllipse(22.5, 4, 4, 11); // tai
    g.fillStyle(0xf4b6b6, 1); g.fillEllipse(22.5, 4.5, 1.8, 7.5);
    g.fillStyle(0x1c1917, 1); g.fillCircle(24, 11, 1.4); // mắt
    g.fillStyle(0xffffff, 1); g.fillCircle(23.6, 10.6, 0.5);
    g.fillStyle(0xe58a8a, 1); g.fillCircle(27.6, 13.4, 1); // mũi
  });

  // Gà rừng: gà trống lông đỏ cam, mào đỏ, đuôi cong xanh đen óng ánh
  tex(scene, 'mob_fowl', 30, 30, (g) => {
    g.fillStyle(0x0f3d2e, 1); g.fillEllipse(6, 11, 9, 16); // đuôi
    g.fillStyle(0x14532d, 1); g.fillEllipse(4, 9, 5, 13);
    g.fillStyle(0x1e293b, 1); g.fillEllipse(8, 14, 6, 12);
    g.lineStyle(2, 0xca8a04, 1); g.lineBetween(14, 22, 13, 28); g.lineBetween(18, 22, 19, 28); // chân
    g.fillStyle(0x9a3412, 1); g.fillEllipse(15, 18, 16, 11); // thân
    g.fillStyle(0xc2410c, 1); g.fillEllipse(16, 16, 12, 7);
    g.fillStyle(0x1f2937, 1); g.fillEllipse(14, 21, 10, 4); // ngực sẫm
    g.fillStyle(0xea580c, 1); g.fillEllipse(21, 12, 7, 11); // cổ bờm cam
    g.fillStyle(0xf97316, 1); g.fillCircle(23, 8, 4); // đầu
    g.fillStyle(0xdc2626, 1); g.fillCircle(22, 4, 1.8); g.fillCircle(24, 3.6, 1.8); g.fillCircle(26, 4.6, 1.5); // mào
    g.fillCircle(25.5, 12, 1.6); // yếm
    g.fillStyle(0xfacc15, 1); g.fillTriangle(26.5, 7.5, 30, 9, 26.5, 10); // mỏ
    g.fillStyle(0x1c1917, 1); g.fillCircle(24.4, 7.6, 1);
  });

  // Le le: vịt trời nhỏ lông nâu, đỉnh đầu sẫm, mỏ xám, hay bơi theo đàn ở đầm sen
  tex(scene, 'mob_lele', 28, 22, (g) => {
    g.fillStyle(0x5b3a21, 1); g.fillTriangle(1, 12, 7, 9, 7, 15); // đuôi
    g.fillStyle(0x7c4a26, 1); g.fillEllipse(12, 14, 18, 11); // thân
    g.fillStyle(0xa0673b, 1); g.fillEllipse(13, 16, 13, 6); // bụng hung
    g.fillStyle(0x4a2c17, 1); g.fillEllipse(10, 11, 10, 5); // cánh sẫm
    g.fillStyle(0xb07a4a, 1); g.fillEllipse(20, 9, 5, 8); // cổ
    g.fillStyle(0xc49464, 1); g.fillCircle(21, 6, 3.6); // đầu
    g.fillStyle(0x4a2c17, 1); g.fillEllipse(21, 3.6, 6, 2.6); // đỉnh đầu sẫm
    g.fillStyle(0x475569, 1); g.fillRoundedRect(23.5, 5.4, 4.5, 2.2, 1); // mỏ
    g.fillStyle(0x1c1917, 1); g.fillCircle(22, 5.6, 0.9);
  });

  // Lợn rừng: lông đen xám lởm chởm, bờm dựng trên sống lưng, nanh trắng cong (hiền nhưng bị đánh là húc)
  tex(scene, 'mob_boar', 42, 30, (g) => {
    g.fillStyle(0x1c1917, 1); // chân
    g.fillRect(9, 21, 4, 8); g.fillRect(15, 22, 4, 7); g.fillRect(26, 22, 4, 7); g.fillRect(31, 21, 4, 8);
    g.fillStyle(0x292524, 1); g.fillEllipse(20, 16, 30, 17); // thân
    g.fillStyle(0x44403c, 1); g.fillEllipse(20, 14, 26, 12);
    g.fillStyle(0x0c0a09, 1); // bờm lông dựng
    for (let i = 0; i < 7; i++) g.fillTriangle(9 + i * 3.4, 9, 11 + i * 3.4, 3 + (i % 2) * 2, 13 + i * 3.4, 9);
    g.lineStyle(1, 0x1c1917, 1); g.lineBetween(5, 13, 1, 10); // đuôi
    g.fillStyle(0x292524, 1); g.fillEllipse(33, 15, 14, 13); // đầu
    g.fillStyle(0x57534e, 1); g.fillRoundedRect(36, 14, 6, 6, 2); // mõm
    g.fillStyle(0x1c1917, 1); g.fillCircle(40.5, 16, 0.9); g.fillCircle(40.5, 18.4, 0.9);
    g.fillStyle(0x0c0a09, 1); g.fillTriangle(29, 7, 32, 4, 33, 10); // tai
    g.fillStyle(0xf5f5f4, 1); g.fillTriangle(36, 20, 38, 20, 38.5, 14.5); // nanh
    g.fillStyle(0xef4444, 1); g.fillCircle(34.5, 12, 1.2); // mắt đỏ
  });

  // Ma Da: bóng ma xanh rêu đen ma mị, tóc rong rêu rũ rượi, mắt xanh sáng quỷ dị
  tex(scene, 'mob_mada', 34, 32, (g) => {
    // Luồng khí âm mờ ảo
    g.fillStyle(0x0f172a, 0.4); g.fillEllipse(17, 18, 30, 24);
    // Thân hình gầy guộc xanh rêu sẫm
    g.fillStyle(0x064e3b, 1); g.fillEllipse(17, 16, 20, 22);
    g.fillStyle(0x0f766e, 0.85); g.fillEllipse(17, 15, 16, 18);
    // Tóc rong rêu rũ rượi
    g.fillStyle(0x042f2e, 1);
    g.fillCircle(17, 8, 10);
    g.fillRect(8, 8, 5, 16); g.fillRect(21, 8, 5, 16);
    g.fillTriangle(9, 24, 13, 24, 11, 28); g.fillTriangle(21, 24, 25, 24, 23, 28);
    // Móng vuốt sắc nhọn vươn ra
    g.fillStyle(0x2dd4bf, 1);
    g.fillTriangle(3, 16, 9, 14, 8, 18); g.fillTriangle(31, 16, 25, 14, 26, 18);
    // Mắt xanh lam phát sáng quỷ dị
    g.fillStyle(0x38bdf8, 1); g.fillCircle(13, 11, 2.5); g.fillCircle(21, 11, 2.5);
    g.fillStyle(0xffffff, 1); g.fillCircle(13, 11, 1); g.fillCircle(21, 11, 1);
  });

  // Chúa Thuồng Luồng: Mãng xà khổng lồ vảy xanh ngọc bích sẫm, râu rồng, sừng nước, ngậm Mảnh Trống Đồng 2
  tex(scene, 'mob_serpent', 80, 80, (g) => {
    // Vòng nước xoáy cuồn cuộn dưới thân
    g.fillStyle(0x0e7490, 0.4); g.fillCircle(40, 42, 36);
    g.fillStyle(0x0891b2, 0.5); g.fillCircle(40, 42, 28);

    // Thân rồng/rắn cuộn khúc
    g.fillStyle(0x164e63, 1);
    g.fillCircle(24, 52, 14); g.fillCircle(56, 52, 14);
    g.fillCircle(40, 56, 16);
    g.fillStyle(0x155e75, 1);
    g.fillCircle(24, 50, 11); g.fillCircle(56, 50, 11);
    g.fillCircle(40, 54, 13);

    // Vảy rồng xanh lấp lánh
    g.fillStyle(0x22d3ee, 0.85);
    g.fillCircle(22, 50, 3); g.fillCircle(38, 54, 3.5); g.fillCircle(54, 50, 3);

    // Đầu Thuồng Luồng uy nghiêm dữ tợn
    g.fillStyle(0x083344, 1); g.fillCircle(40, 28, 20);
    g.fillStyle(0x164e63, 1); g.fillCircle(40, 26, 17);

    // Sừng nước uốn cong trên đầu
    g.fillStyle(0x67e8f9, 0.9);
    g.fillTriangle(26, 16, 32, 22, 22, 6);
    g.fillTriangle(54, 16, 48, 22, 58, 6);

    // Mắt vàng rực lửa giận dữ
    g.fillStyle(0xfacc15, 1); g.fillCircle(32, 22, 4); g.fillCircle(48, 22, 4);
    g.fillStyle(0x18181b, 1); g.fillCircle(32, 22, 2); g.fillCircle(48, 22, 2);
    g.fillStyle(0xffffff, 1); g.fillCircle(31, 21, 1); g.fillCircle(47, 21, 1);

    // Râu rồng hai bên mép
    g.lineStyle(2, 0x38bdf8, 1);
    g.beginPath(); g.moveTo(28, 30); g.lineTo(14, 38); g.strokePath();
    g.beginPath(); g.moveTo(52, 30); g.lineTo(66, 38); g.strokePath();

    // Mảnh Trống Đồng 2 ngậm trước miệng
    g.fillStyle(0xb45309, 1); g.fillCircle(40, 38, 12);
    g.fillStyle(0xd97706, 1); g.fillCircle(40, 38, 10);
    g.fillStyle(0xfde047, 1); g.fillCircle(40, 38, 5); // Tâm sao trống đồng
    g.lineStyle(1.5, 0xfef08a, 0.9); g.strokeCircle(40, 38, 7.5);

    // Nanh nhọn
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(30, 33, 34, 33, 32, 40);
    g.fillTriangle(46, 33, 50, 33, 48, 40);
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
  tex(scene, 'fireball', 20, 20, (g) => {
    g.fillStyle(0xea580c, 0.35); g.fillCircle(10, 10, 9.5);
    g.fillStyle(0xf97316, 1); g.fillCircle(10, 10, 7);
    g.fillStyle(0xfde047, 1); g.fillCircle(10, 10, 4.5);
    g.fillStyle(0xffffff, 1); g.fillCircle(9, 9, 2);
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
  tex(scene, 'drop_lotus_seed', 16, 16, (g) => {
    g.fillStyle(0x38bdf8, 0.35); g.fillCircle(8, 8, 8);
    g.fillStyle(0xfef08a, 1); g.fillEllipse(8, 8, 10, 13);
    g.fillStyle(0xfacc15, 1); g.fillEllipse(8, 9, 8, 10);
    g.fillStyle(0x15803d, 1); g.fillCircle(8, 3, 2); // cuống sen xanh
    g.fillStyle(0xffffff, 0.9); g.fillCircle(6, 6, 1.8);
  });
  tex(scene, 'drop_shoe', 18, 16, (g) => {
    g.fillStyle(0xf472b6, 0.35); g.fillCircle(9, 8, 9);
    // thân hài lụa hồng thắm
    g.fillStyle(0xe11d48, 1); g.fillEllipse(9, 9, 14, 7);
    g.fillStyle(0xf43f5e, 1); g.fillEllipse(8, 8, 12, 5);
    // mũi hài cong vút lên thêu hoa sen
    g.fillStyle(0xfde047, 1); g.fillCircle(14, 6, 2.5);
    g.fillStyle(0xffffff, 1); g.fillCircle(14, 5.5, 1);
    // đế hài gỗ mộc
    g.fillStyle(0x78350f, 1); g.fillRect(4, 12, 10, 2);
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
