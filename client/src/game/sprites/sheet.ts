// Đăng ký sprite pixel art (nhân vật, NPC, prop, icon vũ khí) thành texture + animation của Phaser,
// và tạo ảnh data URL cho giao diện HTML (thẻ chọn phái, túi đồ, cửa hàng).

import Phaser from 'phaser';
import { CLASSES, WEAPONS } from '../../../../shared/data.ts';
import type { ClassId } from '../../../../shared/data.ts';
import { PixelGrid, gridsToCanvas } from './pixel.ts';
import { P } from './palette.ts';
import { drawHeroFrame, heroFrameList, HERO_ANIMS, DIRS, FRAME } from './heroes.ts';
import type { Dir, HeroAnim } from './heroes.ts';
import { drawNpcFrame, npcFrameList, drawPropFrame, NPC_ANIMS, NPC_IDS, NPC_PROPS } from './npcs.ts';
import type { NpcId, NpcAnim } from './npcs.ts';
import { weaponIcon, ICON_SIZE } from './weapons.ts';

/** Thêm canvas dạng dải khung ngang vào Phaser, đặt tên khung và lọc NEAREST cho nét pixel. */
function addStrip(scene: Phaser.Scene, key: string, grids: PixelGrid[], names: string[], fw: number, fh: number) {
  const canvasTex = scene.textures.addCanvas(key, gridsToCanvas(grids, fw, fh));
  if (!canvasTex) return;
  names.forEach((n, i) => canvasTex.add(n, 0, i * fw, 0, fw, fh));
  canvasTex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

// ------------------------------------------------------------------ nhân vật

export function heroTexKey(cls: ClassId, weapon: string) {
  return `hero_${cls}__${weapon}`;
}

export function heroAnimKey(texKey: string, anim: HeroAnim, dir: Dir) {
  return `${texKey}:${anim}_${dir}`;
}

/** Dựng (lười) sheet của 1 phái + 1 vũ khí: 3 hướng × idle/walk/attack. Trả về key texture. */
export function ensureHeroSheet(scene: Phaser.Scene, cls: ClassId, weapon: string | null | undefined): string {
  const w = weapon && WEAPONS[weapon] ? weapon : CLASSES[cls].starterWeapon;
  const key = heroTexKey(cls, w);
  if (scene.textures.exists(key)) return key;
  const list = heroFrameList();
  addStrip(scene, key, list.map((f) => drawHeroFrame(cls, w, f.dir, f.anim, f.i)), list.map((f) => f.name), FRAME, FRAME);
  for (const anim of Object.keys(HERO_ANIMS) as HeroAnim[]) {
    const spec = HERO_ANIMS[anim];
    for (const dir of DIRS) {
      scene.anims.create({
        key: heroAnimKey(key, anim, dir),
        frames: Array.from({ length: spec.frames }, (_, i) => ({ key, frame: `${anim}_${dir}_${i}` })),
        frameRate: spec.rate,
        repeat: spec.repeat,
      });
    }
  }
  return key;
}

// ------------------------------------------------------------------ NPC + prop

export function npcAnimKey(id: NpcId, anim: NpcAnim) {
  return `npc_${id}:${anim}`;
}

function registerNpcs(scene: Phaser.Scene) {
  for (const id of NPC_IDS) {
    const key = `npc_${id}`;
    if (!scene.textures.exists(key)) {
      const list = npcFrameList();
      addStrip(scene, key, list.map((f) => drawNpcFrame(id, f.anim, f.i)), list.map((f) => f.name), FRAME, FRAME);
      for (const anim of Object.keys(NPC_ANIMS) as NpcAnim[]) {
        const spec = NPC_ANIMS[anim];
        scene.anims.create({
          key: npcAnimKey(id, anim),
          frames: Array.from({ length: spec.frames }, (_, i) => ({ key, frame: `${anim}_${i}` })),
          frameRate: spec.rate,
          repeat: -1,
        });
      }
    }
    const prop = NPC_PROPS[id];
    if (!scene.textures.exists(prop.key)) {
      const grids = Array.from({ length: prop.frames }, (_, i) => drawPropFrame(id, i));
      addStrip(scene, prop.key, grids, grids.map((_, i) => `f${i}`), prop.w, prop.h);
      if (prop.frames > 1) {
        scene.anims.create({
          key: `${prop.key}:loop`,
          frames: grids.map((_, i) => ({ key: prop.key, frame: `f${i}` })),
          frameRate: 6,
          repeat: -1,
        });
      }
    }
  }
}

// ------------------------------------------------------------------ icon vũ khí + bùa

function talismanGrid(): PixelGrid {
  // lá bùa giấy vàng chữ đỏ, 8×12
  const g = new PixelGrid(10, 14);
  g.rect(1, 1, 8, 12, P.gold);
  g.rect(1, 1, 8, 1, P.goldDark);
  g.line(5, 3, 5, 10, P.betel);
  g.line(3, 5, 7, 5, P.betel);
  g.line(3, 8, 7, 8, P.betel);
  g.outline(P.outline);
  return g;
}

function leafGrid(): PixelGrid {
  // Lá Đa Cổ: lá tim có đuôi nhọn, gân giữa
  const g = new PixelGrid(16, 18);
  g.ellipse(8, 7, 5.6, 4.8, P.leaf);
  g.tri(3.5, 8, 12.5, 8, 8, 15, P.leaf);
  g.ellipse(6, 5.5, 2.2, 1.5, P.leafLight);
  g.line(8, 3, 8, 13, P.leafDark);
  g.line(8, 7, 5, 9, P.leafDark); g.line(8, 7, 11, 9, P.leafDark);
  g.line(8, 2, 9, 1, P.wood);
  g.outline(P.outline);
  return g;
}

function registerIcons(scene: Phaser.Scene) {
  for (const key of Object.keys(WEAPONS)) {
    const k = `wpn_${key}`;
    if (!scene.textures.exists(k)) addStrip(scene, k, [weaponIcon(key)], ['f0'], ICON_SIZE, ICON_SIZE);
  }
  if (!scene.textures.exists('fx_talisman')) addStrip(scene, 'fx_talisman', [talismanGrid()], ['f0'], 10, 14);
  if (!scene.textures.exists('drop_leaf')) addStrip(scene, 'drop_leaf', [leafGrid()], ['f0'], 16, 18);
}

/** Gọi 1 lần khi tạo scene: NPC, prop, icon vũ khí và sheet vũ khí khởi đầu của 3 phái. */
export function registerSpriteTextures(scene: Phaser.Scene) {
  registerNpcs(scene);
  registerIcons(scene);
  for (const cls of Object.keys(CLASSES) as ClassId[]) ensureHeroSheet(scene, cls, null);
}

// ------------------------------------------------------------------ ảnh cho giao diện HTML

const urlCache = new Map<string, string>();

function gridUrl(cacheKey: string, make: () => PixelGrid): string {
  let u = urlCache.get(cacheKey);
  if (!u) {
    const g = make();
    u = gridsToCanvas([g], g.w, g.h).toDataURL('image/png');
    urlCache.set(cacheKey, u);
  }
  return u;
}

/** Ảnh nhân vật đứng yên nhìn xuống, cầm vũ khí khởi đầu (48×48). */
export function heroPreviewUrl(cls: ClassId): string {
  return gridUrl(`hero:${cls}`, () => drawHeroFrame(cls, CLASSES[cls].starterWeapon, 'down', 'idle', 0));
}

/** Icon vũ khí 24×24; chuỗi rỗng nếu không có vũ khí này. */
export function weaponIconUrl(key: string | null | undefined): string {
  if (!key || !WEAPONS[key]) return '';
  return gridUrl(`wpn:${key}`, () => weaponIcon(key));
}

/** Icon Lá Đa Cổ (vật phẩm nhiệm vụ). */
export function leafIconUrl(): string {
  return gridUrl('leaf', leafGrid);
}
