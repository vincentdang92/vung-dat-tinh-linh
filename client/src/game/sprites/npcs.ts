// Sprite 3 NPC ở Làng Tre (chỉ hướng xuống) và đồ vật đi kèm (prop), pixel art 48×48.

import { PixelGrid } from './pixel.ts';
import { P } from './palette.ts';

export type NpcId = 'tao' | 'nuoc' | 'cuoi' | 'caothi' | 'do' | 'tam';
export type NpcAnim = 'idle' | 'talk';
export const NPC_IDS: NpcId[] = ['tao', 'nuoc', 'cuoi', 'caothi', 'do', 'tam'];
export const NPC_ANIMS: Record<NpcAnim, { frames: number; rate: number }> = {
  idle: { frames: 4, rate: 3 },
  talk: { frames: 2, rate: 6 },
};

/** Prop đi kèm từng NPC: kích thước khung, số khung, vị trí đặt so với NPC (đáy giữa). */
export const NPC_PROPS: Record<NpcId, { key: string; w: number; h: number; frames: number; dx: number; dy: number }> = {
  tao: { key: 'prop_kieng', w: 24, h: 24, frames: 3, dx: -27, dy: 10 },
  nuoc: { key: 'prop_tray', w: 32, h: 24, frames: 1, dx: 30, dy: 10 },
  cuoi: { key: 'prop_banyan', w: 28, h: 36, frames: 1, dx: -28, dy: 10 },
  caothi: { key: 'prop_caothi', w: 24, h: 24, frames: 1, dx: 24, dy: 10 },
  do: { key: 'prop_do', w: 24, h: 36, frames: 1, dx: -24, dy: 10 },
  tam: { key: 'prop_tam', w: 24, h: 24, frames: 1, dx: 24, dy: 10 },
};

// ------------------------------------------------------------------ bộ phận chung

function happyEyes(g: PixelGrid, b: number, y = 18) {
  for (const x of [18, 28]) {
    g.set(x, y + 1 + b, P.eye); g.set(x + 1, y + b, P.eye); g.set(x + 2, y + 1 + b, P.eye);
  }
}

function openEye(g: PixelGrid, x: number, y: number) {
  g.rect(x, y, 2, 3, P.eye);
  g.set(x, y, P.eyeHi);
}

// ------------------------------------------------------------------ Ông Táo

function drawTao(g: PixelGrid, anim: NpcAnim, i: number) {
  const b = anim === 'talk' ? i : i % 2;
  const strokeBeard = anim === 'idle' && i >= 2;
  const talking = anim === 'talk' && i === 1;

  // giày
  g.rect(18, 40, 5, 2, P.shoe); g.rect(25, 40, 5, 2, P.shoe);
  // áo bào cam đỏ, người bụ bẫm
  g.rrect(13, 25 + b, 22, 16 - b, P.taoRobe);
  g.rect(31, 27 + b, 3, 13 - b, P.taoRobeDark);
  g.rect(13, 39, 22, 1, P.gold); // viền gấu áo
  g.rect(23, 30 + b, 2, 9 - b, P.gold); // nẹp giữa
  g.rect(14, 32 + b, 20, 2, P.gold); // đai lưng
  g.rect(14, 33 + b, 20, 1, P.goldDark);
  g.rect(19, 25 + b, 10, 2, P.gold); // cổ áo

  // tay trái (bên phải người xem) đặt lên bụng hoặc vuốt râu
  const rh: [number, number] = strokeBeard ? [28, 29 + b] : [31, 34 + b];
  g.line(33, 27 + b, rh[0] + 1, rh[1] - 1, P.taoRobe, 5);
  // tay phải cầm muôi gỗ
  const lh: [number, number] = [12, 33 + b - (talking ? 2 : 0)];
  g.line(15, 27 + b, lh[0] + 1, lh[1] - 1, P.taoRobe, 5);
  g.line(lh[0], lh[1], lh[0] - 4, lh[1] - 11, P.wood, 2);
  g.ellipse(lh[0] - 4.5, lh[1] - 12.5, 2.8, 2.2, P.woodDark);
  g.set(lh[0] - 5, lh[1] - 13, P.wood);
  g.ellipse(lh[0] + 0.5, lh[1] + 0.5, 1.9, 1.9, P.skin);

  // đầu
  g.ellipse(24, 17 + b, 10.5, 9.5, P.skin);
  g.rect(13, 13 + b, 2, 5, P.silver); g.rect(33, 13 + b, 2, 5, P.silver); // tóc bạc hai bên
  g.rect(17, 15 + b, 4, 1, P.silver); g.rect(27, 15 + b, 4, 1, P.silver); // lông mày bạc
  happyEyes(g, b);
  g.ellipse(16.5, 21.5 + b, 1.8, 1.1, P.blush); g.ellipse(31.5, 21.5 + b, 1.8, 1.1, P.blush);
  g.rect(23, 19 + b, 2, 2, P.skinDark); // mũi
  // râu bạc dài
  g.tri(17, 22 + b, 31, 22 + b, 24, 34 + b, P.silver);
  for (let y = 22; y <= 34; y++) for (let x = 26; x <= 31; x++) if (g.get(x, y + b) === P.silver) g.set(x, y + b, P.silverDark);
  for (let y = 25; y <= 32; y += 3) g.set(23, y + b, P.silverDark); // sợi râu
  g.line(18, 22 + b, 23, 21 + b, P.silver, 2); g.line(25, 21 + b, 30, 22 + b, P.silver, 2); // ria
  if (talking) g.rect(23, 23 + b, 2, 2, P.mouth);
  if (strokeBeard) g.ellipse(rh[0] + 0.5, rh[1] + 0.5, 1.9, 1.9, P.skin);
  else g.ellipse(rh[0] + 0.5, rh[1] + 0.5, 1.9, 1.9, P.skin);

  // khăn xếp đen, điểm vàng giữa trán
  g.ellipse(24, 10 + b, 11.5, 5.6, P.khanBlack);
  for (const y of [8, 10, 12]) for (let x = 12; x < 37; x++) g.paint(x, y + b, P.khanFold);
  g.line(19, 8 + b, 24, 13 + b, P.khanFold); g.line(29, 8 + b, 24, 13 + b, P.khanFold);
  g.rect(23, 9 + b, 2, 2, P.gold); g.set(23, 9 + b, P.fireHot);
}

// ------------------------------------------------------------------ Bà Hàng Nước

function drawNuoc(g: PixelGrid, anim: NpcAnim, i: number) {
  const b = anim === 'talk' ? i : (i === 3 ? 1 : 0);
  const fanUp = anim === 'idle' ? i % 2 === 1 : false;
  const talking = anim === 'talk' && i === 1;

  // ghế đẩu
  g.rect(13, 37, 22, 2, P.wood);
  g.rect(14, 39, 2, 3, P.woodDark); g.rect(32, 39, 2, 3, P.woodDark);
  // chân
  g.rect(17, 39, 4, 2, P.shoe); g.rect(27, 39, 4, 2, P.shoe);
  // váy đen phủ gối
  g.rrect(13, 31 + b, 22, 8 - b, P.skirt);
  // áo tứ thân nâu, yếm sáng
  g.rrect(16, 25 + b, 16, 9, P.aoTuThan);
  g.rect(30, 26 + b, 2, 7, P.aoTuThanDark);
  g.tri(20, 25 + b, 28, 25 + b, 24, 30 + b, P.yem);
  g.rect(16, 31 + b, 16, 1, P.aoTuThanDark);

  // tay trái đặt trên đùi
  g.line(31, 27 + b, 30, 33 + b, P.aoTuThan, 4);
  g.ellipse(30.5, 34.5 + b, 1.9, 1.9, P.skin);
  // tay phải phe phẩy quạt nan
  const fx = 13, fy = fanUp ? 27 + b : 30 + b;
  g.line(17, 27 + b, fx + 1, fy, P.aoTuThan, 4);
  g.sector(fx, fy - 1, 6, fanUp ? -2.2 : -1.7, 1.6, (d, da) =>
    d < 1.5 ? P.woodDark : Math.abs(((da + 0.8) % 0.4) - 0.2) * d < 0.4 ? P.bambooDark : P.bamboo);
  g.ellipse(fx + 0.5, fy + 0.5, 1.9, 1.9, P.skin);

  // đầu: khăn mỏ quạ đen ôm mặt
  g.ellipse(24, 18 + b, 11, 10, P.skirt);
  g.ellipse(24, 19.5 + b, 8.4, 7.4, P.skin);
  g.rect(15, 16 + b, 2, 5, P.silverDark); g.rect(31, 16 + b, 2, 5, P.silverDark); // tóc bạc
  happyEyes(g, b, 18);
  g.ellipse(18.5, 22 + b, 1.6, 1, P.blush); g.ellipse(29.5, 22 + b, 1.6, 1, P.blush);
  g.rect(22, 23 + b, 4, talking ? 2 : 1, P.betel); // môi đỏ ăn trầu
  g.set(23, 21 + b, P.skinDark);

  // nón lá
  g.tri(24, 1 + b, 3.5, 13 + b, 44.5, 13 + b, P.straw);
  for (const x of [9, 15, 21, 27, 33, 39]) g.line(24, 3 + b, x, 12 + b, P.strawDark);
  for (let y = 1; y <= 13; y++) for (let x = 30; x < 46; x++) if ((x + y) % 2 === 0) g.paint(x, y + b, P.strawDark);
  g.rect(4, 12 + b, 40, 1, P.strawDark);
}

// ------------------------------------------------------------------ Chú Cuội

function drawCuoi(g: PixelGrid, anim: NpcAnim, i: number) {
  const b = anim === 'talk' ? i : i % 2;
  const wink = anim === 'idle' ? i === 2 || i === 3 : true;
  const talking = anim === 'talk' && i === 1;

  // nón rơm đeo sau lưng (ló ra sau vai)
  g.ellipse(34, 25 + b, 5, 4.5, P.straw);
  g.ellipse(34, 25 + b, 2, 1.6, P.strawDark);

  // chân trần, quần nâu xắn ống
  for (const x of [18, 26]) {
    g.rect(x, 35, 4, 3, P.trouser);
    g.rect(x, 37, 4, 1, P.trouserLight);
    g.rect(x, 38, 4, 2, P.skin);
    g.rect(x - (x === 18 ? 1 : 0), 40, 5, 2, P.skinDark);
  }
  // áo cánh chàm
  g.rrect(16, 25 + b, 16, 11 - b, P.indigo);
  g.rect(30, 27 + b, 2, 8 - b, P.indigoDark);
  g.tri(21, 25 + b, 27, 25 + b, 24, 29 + b, P.skin); // cổ áo mở
  g.rect(16, 33, 16, 1, P.bambooDark); // dây lưng
  g.line(28, 25 + b, 25, 28 + b, P.strawDark); // quai nón

  // hai tay cầm sáo trúc ngang trước ngực
  g.line(16, 27 + b, 17, 30 + b, P.indigo, 4);
  g.line(32, 27 + b, 31, 30 + b, P.indigo, 4);
  const fy = 31 + b;
  g.rect(10, fy, 28, 2, P.bamboo);
  g.rect(10, fy + 1, 28, 1, P.bambooDark);
  for (const x of [22, 25, 28, 31]) g.set(x, fy, P.woodDark); // lỗ sáo
  g.set(14, fy, P.woodDark); // lỗ thổi
  g.rect(19, fy, 1, 2, P.betel); // dây buộc đỏ
  g.ellipse(17.5, fy + 0.5, 1.9, 1.9, P.skin);
  g.ellipse(30.5, fy + 0.5, 1.9, 1.9, P.skin);

  // đầu, tóc rối
  g.ellipse(24, 18 + b, 10.5, 9.5, P.skin);
  g.ellipse(24, 18 + b, 10.5, 9.5, P.hair, (x, y) => y < 14 + b + (x % 3 === 0 ? 2 : x % 3 === 1 ? 0 : 1) || x <= 14 || x >= 33);
  g.tri(14, 12 + b, 17, 4 + b, 21, 10 + b, P.hair);
  g.tri(19, 9 + b, 23, 2 + b, 26, 9 + b, P.hair);
  g.tri(24, 9 + b, 29, 3 + b, 31, 10 + b, P.hair);
  g.tri(29, 11 + b, 35, 7 + b, 34, 14 + b, P.hair);
  g.set(22, 5 + b, P.hairHi); g.set(27, 6 + b, P.hairHi);

  openEye(g, 19, 18 + b);
  if (wink) { g.set(27, 20 + b, P.eye); g.set(28, 19 + b, P.eye); g.set(29, 20 + b, P.eye); }
  else openEye(g, 27, 18 + b);
  g.rect(16, 22 + b, 2, 1, P.blush); g.rect(30, 22 + b, 2, 1, P.blush);
  // cười toe toét
  g.rect(21, 23 + b, 6, 1, P.mouth);
  g.rect(22, 24 + b, 4, talking ? 2 : 1, P.white);
}

// ------------------------------------------------------------------ Bác Lái Đò
function drawDo(g: PixelGrid, anim: NpcAnim, i: number) {
  const b = anim === 'talk' ? i : i % 2;
  const talking = anim === 'talk' && i === 1;

  // chân trần, quần nâu xắn cao
  for (const x of [18, 26]) {
    g.rect(x, 36, 4, 3, P.trouser);
    g.rect(x, 39, 4, 2, P.skinDark);
    g.rect(x - (x === 18 ? 1 : 0), 41, 5, 1, P.pantsDark);
  }

  // áo bà ba nâu sồng bạc màu sông nước
  g.rrect(15, 25 + b, 18, 12 - b, P.trouser);
  g.rect(31, 26 + b, 2, 9 - b, P.pantsDark);
  g.rect(15, 36, 18, 1, P.pantsDark);
  g.rect(23, 27 + b, 2, 9 - b, P.pantsDark); // nẹp áo

  // tay trái cầm cán mái chèo
  g.line(16, 27 + b, 12, 33 + b, P.trouser, 4);
  g.ellipse(11.5, 34.5 + b, 1.9, 1.9, P.skinDark);

  // tay phải
  const rx = talking ? 33 : 31, ry = talking ? 28 + b : 33 + b;
  g.line(31, 27 + b, rx, ry, P.trouser, 4);
  g.ellipse(rx + 0.5, ry + 0.5, 1.9, 1.9, P.skinDark);

  // mái chèo dài vác chéo
  g.line(9, 42, 14, 18 + b, P.wood, 2);
  g.line(9, 42, 14, 18 + b, P.woodDark, 1);
  g.ellipse(8, 43, 3, 2, P.woodDark); // lưỡi chèo

  // đầu, khuôn mặt khắc khổ từng trải
  g.ellipse(24, 18 + b, 9.5, 8.5, P.skinDark);
  g.rect(15, 15 + b, 2, 4, P.silverDark); g.rect(31, 15 + b, 2, 4, P.silverDark); // tóc hoa râm
  happyEyes(g, b, 18);
  g.rect(22, 21 + b, 4, 2, P.silver); // chòm râu bạc hoa râm dưới cằm
  g.set(24, 23 + b, P.silverDark);
  if (talking) g.rect(23, 21 + b, 2, 1, P.mouth);

  // nón lá nghiêng che sương gió
  g.tri(24, 4 + b, 6, 14 + b, 42, 14 + b, P.straw);
  for (const x of [12, 18, 24, 30, 36]) g.line(24, 5 + b, x, 13 + b, P.strawDark);
  g.rect(6, 13 + b, 36, 1, P.strawDark);
}

// ------------------------------------------------------------------ Cô Tấm
function drawTam(g: PixelGrid, anim: NpcAnim, i: number) {
  const b = anim === 'talk' ? i : (i === 3 ? 1 : 0);
  const talking = anim === 'talk' && i === 1;

  // guốc mộc & gấu váy
  g.rect(19, 41, 3, 1, P.wood); g.rect(26, 41, 3, 1, P.wood);
  // váy lụa đen chấm gót
  g.rrect(14, 32 + b, 20, 9 - b, P.skirt);
  g.rect(14, 40, 20, 1, P.outline);

  // áo tứ thân mềm mại xẻ vạt, yếm đào rực rỡ
  g.rrect(16, 24 + b, 16, 9, P.aoTuThan);
  g.rect(30, 25 + b, 2, 7, P.aoTuThanDark);
  // yếm đào đỏ thắm hoa sen
  g.tri(19, 24 + b, 29, 24 + b, 24, 31 + b, P.betel);
  g.set(24, 27 + b, P.gold); // nút thắt yếm vàng
  g.rect(17, 31 + b, 14, 1, P.aoTuThanDark);

  // hai tay e ấp trước ngực
  g.line(16, 26 + b, 20, 30 + b, P.aoTuThan, 3);
  g.line(31, 26 + b, 27, 30 + b, P.aoTuThan, 3);
  g.ellipse(21.5, 30.5 + b, 1.6, 1.6, P.skin);
  g.ellipse(26.5, 30.5 + b, 1.6, 1.6, P.skin);

  // khuôn mặt thanh tú, hiền hậu
  g.ellipse(24, 17 + b, 8.5, 7.5, P.skin);
  openEye(g, 20, 16 + b);
  openEye(g, 26, 16 + b);
  g.rect(18, 19 + b, 2, 1, P.blush); g.rect(28, 19 + b, 2, 1, P.blush);
  g.set(24, 19 + b, P.skinDark); // sống mũi
  g.rect(23, 20 + b, 2, talking ? 2 : 1, P.mouth); // miệng nhỏ

  // vấn tóc đuôi gà với dải lụa hồng duyên dáng
  g.ellipse(24, 11 + b, 10, 4.5, P.hair);
  g.rect(16, 12 + b, 16, 2, P.khanBlack);
  g.rect(18, 11 + b, 12, 1, P.redLight); // dải lụa hồng thắm vấn tóc
  g.line(15, 14 + b, 15, 20 + b, P.hair);
  g.line(32, 14 + b, 32, 20 + b, P.hair);
}

// ------------------------------------------------------------------ Cáo Thị Làng
function drawCaothi(g: PixelGrid, _anim: NpcAnim, _i: number) {
  // Cột gỗ hai bên
  g.rect(12, 20, 3, 24, P.woodDark);
  g.rect(33, 20, 3, 24, P.woodDark);
  // Bảng gỗ lớn ở giữa
  g.rect(10, 10, 28, 22, P.wood);
  g.rect(10, 10, 28, 2, P.woodDark);
  g.rect(10, 30, 28, 2, P.woodDark);
  g.rect(10, 10, 2, 22, P.woodDark);
  g.rect(36, 10, 2, 22, P.woodDark);
  // Tờ cáo thị giấy điều đỏ dán chính giữa
  g.rect(14, 14, 20, 15, P.betel);
  g.rect(15, 15, 18, 1, P.gold);
  // Dòng chữ mô phỏng
  g.rect(16, 18, 16, 1, P.cream);
  g.rect(16, 21, 14, 1, P.cream);
  g.rect(16, 24, 12, 1, P.cream);
  // Mái rơm che mưa nắng
  g.tri(24, 2, 6, 10, 42, 10, P.straw);
  g.line(6, 10, 42, 10, P.strawDark);
  for (const x of [12, 18, 24, 30, 36]) g.line(24, 3, x, 9, P.strawDark);
}

// ------------------------------------------------------------------ API

export function drawNpcFrame(id: NpcId, anim: NpcAnim, i: number): PixelGrid {
  const g = new PixelGrid(48, 48);
  if (id === 'tao') drawTao(g, anim, i);
  else if (id === 'nuoc') drawNuoc(g, anim, i);
  else if (id === 'cuoi') drawCuoi(g, anim, i);
  else if (id === 'do') drawDo(g, anim, i);
  else if (id === 'tam') drawTam(g, anim, i);
  else drawCaothi(g, anim, i);
  g.outline(P.outline);
  return g;
}

export function npcFrameList(): { name: string; anim: NpcAnim; i: number }[] {
  const out: { name: string; anim: NpcAnim; i: number }[] = [];
  for (const anim of Object.keys(NPC_ANIMS) as NpcAnim[]) {
    for (let i = 0; i < NPC_ANIMS[anim].frames; i++) out.push({ name: `${anim}_${i}`, anim, i });
  }
  return out;
}

/** Prop: kiềng lửa (3 khung lửa), khay chè, cây đa non, cọc neo, giỏ hoa sen, chum cảnh. */
export function drawPropFrame(id: NpcId, i: number): PixelGrid {
  const spec = NPC_PROPS[id];
  const g = new PixelGrid(spec.w, spec.h);
  if (id === 'tao') {
    // lửa trước để thân kiềng đè lên
    const h = [5, 3, 4][i % 3];
    g.tri(6, 15, 18, 15, 12 + (i === 1 ? -1 : i === 2 ? 1 : 0), h, P.fire);
    g.tri(8, 15, 16, 15, 12 + (i === 2 ? -1 : 0), h + 4, P.fireHot);
    g.set(9 + i * 2, h + 2, P.fireDeep);
    g.ellipse(12, 15.5, 8, 2.6, P.clayDark);
    g.rect(4, 16, 16, 4, P.clay);
    g.rect(4, 19, 16, 1, P.clayDark);
    g.rect(5, 20, 2, 3, P.clayDark); g.rect(11, 20, 2, 3, P.clayDark); g.rect(17, 20, 2, 3, P.clayDark);
  } else if (id === 'nuoc') {
    g.rect(2, 13, 28, 3, P.wood);
    g.rect(2, 15, 28, 1, P.woodDark);
    g.rect(4, 16, 2, 6, P.woodDark); g.rect(26, 16, 2, 6, P.woodDark);
    // ấm chè xanh
    g.line(14, 9, 18, 6, P.teapot, 2);
    g.ellipse(10, 9.5, 4.6, 3.6, P.teapot);
    g.ellipse(10, 9.5, 4.6, 3.6, P.teapotDark, (x) => x >= 12);
    g.ellipse(10, 5.8, 2.2, 1.2, P.teapotDark);
    g.line(5, 8, 5, 11, P.teapotDark);
    // hai bát nước chè
    for (const x of [20, 26]) {
      g.ellipse(x, 11, 2.8, 1.8, P.cream);
      g.ellipse(x, 10.4, 2, 0.9, P.tea);
    }
  } else if (id === 'cuoi') {
    // cây đa non có rễ phụ
    g.rect(12, 18, 4, 15, P.wood);
    g.rect(15, 18, 1, 15, P.woodDark);
    g.line(12, 22, 9, 33, P.woodDark); g.line(16, 21, 19, 33, P.woodDark);
    g.rect(8, 33, 13, 1, P.woodDark);
    g.ellipse(14, 12, 11, 7.5, P.leaf);
    g.ellipse(9, 14, 5, 4, P.leafDark);
    g.ellipse(18, 9, 5, 3.5, P.leafLight);
    g.ellipse(14, 6, 6, 3.5, P.leaf);
    for (const [x, y] of [[7, 9], [20, 14], [12, 15], [17, 5]]) g.set(x, y, P.leafLight);
  } else if (id === 'do') {
    // cọc gỗ neo thuyền bến đò & mái chèo phụ
    g.rect(8, 10, 6, 24, P.woodDark);
    g.rect(9, 10, 4, 24, P.wood);
    g.rect(6, 16, 10, 4, P.strawDark); // vòng dây thừng quấn quanh cọc
    g.rect(7, 20, 8, 2, P.straw);
  } else if (id === 'tam') {
    // giỏ tre đơm hoa sen
    g.ellipse(12, 16, 8, 6, P.bambooDark);
    g.ellipse(12, 14, 7, 5, P.bamboo);
    g.ellipse(12, 10, 3, 4, P.blush); // búp sen hồng
    g.set(12, 8, P.white);
    g.rect(11, 13, 2, 3, P.leaf);
  } else {
    // chum gốm / chậu cảnh nhỏ chân bảng cáo thị
    g.ellipse(12, 15, 6, 7, P.clayDark);
    g.ellipse(12, 14, 5, 6, P.clay);
    g.ellipse(12, 9, 4, 3, P.leaf);
  }
  g.outline(P.outline);
  return g;
}

/** Dùng cho ảnh xem trước: NPC đứng yên, nói chuyện, và prop. */
export function npcPreviewGrids(): PixelGrid[] {
  const out: PixelGrid[] = [];
  for (const id of NPC_IDS) {
    out.push(drawNpcFrame(id, 'idle', 0), drawNpcFrame(id, 'idle', 2), drawNpcFrame(id, 'talk', 1));
    for (let i = 0; i < NPC_PROPS[id].frames; i++) out.push(drawPropFrame(id, i));
  }
  return out;
}
