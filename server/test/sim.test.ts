// Test mô phỏng không cần mạng: node --experimental-strip-types --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { collides, MAP_W, MAP_H, tileAt, blocksMove } from '../../shared/map.ts';
import { TILE, PLAYER_RADIUS } from '../../shared/constants.ts';
import { NPCS, SHOP_PRICES, TRIVIA_QUESTIONS } from '../../shared/story.ts';
import type { ServerMsg } from '../../shared/protocol.ts';
import { LIFE_ITEMS, SELL_DAILY_CAP, BAY_PRICE, fishSpotAt, normalizeLife, trapSpotOk } from '../../shared/life.ts';
import { TRIVIA_ANSWERS } from '../src/trivia.ts';

function seeded(seed = 42) {
  let a = seed;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}
const mk = () => new World({ rnd: seeded() });
const run = (w: World, ms: number) => { for (let i = 0; i < ms / 50; i++) w.tick(); };
const mobOf = (w: World, kind: string) => [...w.mobs.values()].find((m) => m.def.kind === kind && !m.dead)!;
const isolate = (w: World, keep: { id: number }) => {
  for (const m of w.mobs.values()) if (m !== keep) { m.dead = true; m.respawnAt = 1e12; }
};
const tp = (w: World, id: number, x: number, y: number) => { const p = w.debugPlayer(id)!; p.x = x; p.y = y; };

test('map: spawn người chơi và quái không kẹt tường', () => {
  const w = mk();
  const sp = w.map.playerSpawn;
  assert.equal(collides(w.map, sp.x, sp.y, PLAYER_RADIUS), false);
  for (const s of w.map.spawns) assert.equal(collides(w.map, s.x, s.y, 10), false, `${s.kind} @${s.x},${s.y}`);
});

test('map: đi bộ được từ làng tới đấu trường boss và mọi bãi quái', () => {
  const w = mk();
  const seen = new Uint8Array(MAP_W * MAP_H);
  const q = [[Math.floor(w.map.playerSpawn.x / TILE), Math.floor(w.map.playerSpawn.y / TILE)]];
  seen[q[0][1] * MAP_W + q[0][0]] = 1;
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || seen[ny * MAP_W + nx]) continue;
      if (blocksMove(tileAt(w.map, nx, ny))) continue;
      seen[ny * MAP_W + nx] = 1; q.push([nx, ny]);
    }
  }
  for (const s of w.map.spawns) {
    assert.equal(seen[Math.floor(s.y / TILE) * MAP_W + Math.floor(s.x / TILE)], 1, `không tới được ${s.kind}`);
  }
});

test('input: di chuyển, ack, chặn speedhack', () => {
  const w = mk();
  const id = w.addPlayer(World.newProfile('t', 'A', 'warrior'));
  const p = w.debugPlayer(id)!;
  const y0 = p.y;
  for (let i = 1; i <= 10; i++) w.handle(id, { t: 'in', seq: i, x: 0, y: -1 });
  w.tick();
  // bucket ban đầu 3 (+1 tick => tối đa 3) => xử lý tối đa 3 gói trong tick đầu
  assert.ok(p.ack <= 3 && p.ack >= 1, `ack=${p.ack}`);
  run(w, 1000);
  assert.equal(p.ack, 10);
  const moved = y0 - p.y;
  assert.ok(moved > 50 && moved <= 10 * p.stats.speed * 0.05 + 0.01, `moved=${moved}`);

  // gửi 100 gói 1 lúc: phần lớn bị bỏ, không thể chạy nhanh hơn tốc độ cho phép
  const y1 = p.y;
  for (let i = 11; i <= 110; i++) w.handle(id, { t: 'in', seq: i, x: 0, y: -1 });
  run(w, 1000);
  assert.ok(y1 - p.y <= 10 * p.stats.speed * 0.05 + 0.01);
});

test('chiến binh tự đánh slime, nhận XP, nhặt vàng', () => {
  const w = mk();
  const id = w.addPlayer(World.newProfile('t', 'War', 'warrior'));
  const s = mobOf(w, 'slime');
  tp(w, id, s.x + 30, s.y);
  run(w, 6000);
  const p = w.debugPlayer(id)!;
  assert.equal(s.dead, true, 'slime phải chết');
  assert.ok(p.prof.xp > 0 || p.prof.level > 1);
  // đứng đúng chỗ đồ rơi để nhặt
  tp(w, id, s.x, s.y); run(w, 200);
  assert.ok(p.prof.gold > 0, 'phải nhặt được vàng');
});

test('cung thủ bắn chết sói từ xa bằng đạn', () => {
  const w = mk();
  const id = w.addPlayer(World.newProfile('t', 'Arc', 'archer'));
  const p = w.debugPlayer(id)!;
  p.prof.level = 5; (w as any).recalc(p); p.hp = p.stats.maxHp;
  p.iframeUntil = 1e12;
  const wolf = mobOf(w, 'wolf');
  isolate(w, wolf);
  // Đặt trên trục đường mòn chính để tầm nhìn thẳng không bị cây cản
  wolf.x = 15 * TILE; wolf.y = 20 * TILE; wolf.spawn.x = wolf.x; wolf.spawn.y = wolf.y;
  tp(w, id, wolf.x, wolf.y + 130);
  let sawProj = false;
  for (let i = 0; i < 400 && !wolf.dead; i++) {
    w.tick();
    if (i % 2 === 0) {
      const snaps = w.buildSnapshots();
      if (snaps.some((o) => o.msg.t === 'snap' && o.msg.pr.length > 0)) sawProj = true;
    }
  }
  assert.ok(sawProj, 'phải thấy mũi tên trong snapshot');
  assert.equal(wolf.dead, true);
});

test('pháp sư: thiên thạch gây sát thương vùng sau độ trễ', () => {
  const w = mk();
  const id = w.addPlayer(World.newProfile('t', 'Mag', 'mage'));
  const slimes = [...w.mobs.values()].filter((m) => m.def.kind === 'slime');
  const s = slimes[0];
  isolate(w, s);
  tp(w, id, s.x, s.y + 200); // ngoài tầm đánh thường (175)
  w.debugPlayer(id)!.iframeUntil = 1e12;
  w.handle(id, { t: 'skill' });
  const hp0 = s.hp;
  run(w, 300);
  assert.equal(s.hp, hp0, 'chưa nổ trước 0.6s');
  run(w, 500);
  assert.ok(s.hp < hp0 || s.dead, 'phải trúng thiên thạch');
});

test('boss đập đất: có báo trước, trúng người đứng gần; né được bằng cách chạy ra', () => {
  const w = mk();
  const a = w.addPlayer(World.newProfile('t1', 'Tank', 'warrior'));
  const pa = w.debugPlayer(a)!;
  pa.prof.level = 10; (w as any).recalc(pa); pa.hp = pa.stats.maxHp;
  const boss = mobOf(w, 'boss');
  tp(w, a, boss.x, boss.y + 40);
  let slamAt = -1;
  for (let i = 0; i < 200 && slamAt < 0; i++) {
    w.tick();
    const out = w.buildSnapshots();
    for (const o of out) if (o.msg.t === 'snap' && o.msg.ev.some((e) => e.e === 'fx' && e.k === 'slam')) slamAt = i;
  }
  assert.ok(slamAt >= 0, 'boss phải tung đòn đập');
  const hpBefore = pa.hp;
  run(w, 1300);
  assert.ok(pa.hp < hpBefore || pa.dead, 'đứng gần phải trúng đòn');
});

test('chết thì hồi sinh ở làng sau 4s', () => {
  const w = mk();
  const id = w.addPlayer(World.newProfile('t', 'Weak', 'mage'));
  const p = w.debugPlayer(id)!;
  const boss = mobOf(w, 'boss');
  tp(w, id, boss.x, boss.y + 30);
  p.hp = 1;
  run(w, 3000);
  assert.equal(p.dead, true);
  run(w, 4200);
  assert.equal(p.dead, false);
  assert.equal(p.hp, p.stats.maxHp);
  assert.ok(p.y > 44 * TILE, 'phải về làng');
});

test('vùng an toàn: quái không vào làng, người trong làng không bị đánh', () => {
  const w = mk();
  const id = w.addPlayer(World.newProfile('t', 'Safe', 'warrior'));
  const p = w.debugPlayer(id)!;
  run(w, 10_000);
  assert.equal(p.hp, p.stats.maxHp);
  for (const m of w.mobs.values()) assert.ok(m.y < 44 * TILE);
});

test('bình máu và trang bị vũ khí nhặt được', () => {
  const w = mk();
  const id = w.addPlayer(World.newProfile('t', 'Pot', 'warrior'));
  const p = w.debugPlayer(id)!;
  p.hp = 10;
  w.handle(id, { t: 'potion' });
  assert.ok(p.hp > 10);
  assert.equal(p.prof.inv.find((i) => i.key === 'potion')!.qty, 2);

  const atk0 = p.stats.atk;
  p.prof.inv.push({ uid: 99, key: 'iron_sword', qty: 1 });
  w.handle(id, { t: 'equip', uid: 99 });
  assert.equal(p.prof.weapon, 'iron_sword');
  assert.equal(p.stats.atk, atk0 + 6);
  assert.ok(p.prof.inv.some((i) => i.key === 'wood_sword'), 'vũ khí cũ vào túi');
  // không cho trang bị vũ khí sai lớp
  p.prof.inv.push({ uid: 100, key: 'wind_bow', qty: 1 });
  w.handle(id, { t: 'equip', uid: 100 });
  assert.equal(p.prof.weapon, 'iron_sword');
});

test('snapshot JSON gọn (< 6KB với 1 người)', () => {
  const w = mk();
  w.addPlayer(World.newProfile('t', 'S', 'archer'));
  w.tick(); w.tick();
  const out = w.buildSnapshots();
  const snap = out.find((o) => o.msg.t === 'snap')!.msg as ServerMsg;
  const size = JSON.stringify(snap).length;
  assert.ok(size < 6000, `size=${size}`);
});

test('hệ thống Khí: tích lũy khi đánh và nhận đòn, chết reset về 0, đủ 100 dùng bí kíp', () => {
  const w = mk();
  const id = w.addPlayer(World.newProfile('t', 'War', 'warrior'));
  const p = w.debugPlayer(id)!;
  assert.equal(p.khi, 0, 'khởi đầu Khí phải bằng 0');

  // Đánh quái tích +2 Khí
  const s = mobOf(w, 'slime');
  tp(w, id, s.x + 30, s.y);
  run(w, 800);
  assert.ok(p.khi >= 2, 'phải tích Khí khi đánh trúng quái');

  // Nhận đòn tích +3 Khí
  const khiBeforeHit = p.khi;
  const wolf = mobOf(w, 'wolf');
  tp(w, id, wolf.x + 20, wolf.y);
  wolf.state = 'chase'; wolf.target = id;
  run(w, 1200);
  assert.ok(p.khi > khiBeforeHit, 'phải tích Khí khi bị quái đánh');

  // Thử dùng bí kíp khi chưa đủ 100 Khí: không kích hoạt
  p.khi = 50;
  w.handle(id, { t: 'ult' });
  assert.equal(p.khi, 50, 'chưa đủ 100 Khí thì không thể dùng');

  // Đủ 100 Khí: dùng bí kíp reset về 0
  p.khi = 100;
  w.handle(id, { t: 'ult' });
  assert.equal(p.khi, 0, 'dùng bí kíp xong Khí phải về 0');

  // Chết thì Khí reset về 0
  p.khi = 60;
  (w as any).hitPlayer(p, 9999, 1);
  assert.equal(p.khi, 0, 'chết thì Khí phải về 0');
});

test('bí kíp Thiết Kiếm Môn (Phù Đổng Thiên Vương): gây choáng và sát thương nện đất', () => {
  const w = mk();
  const id = w.addPlayer(World.newProfile('t', 'War', 'warrior'));
  const p = w.debugPlayer(id)!;
  p.nextAtk = 1e12; // Tắt đánh thường để kiểm tra chính xác sát thương bí kíp
  const s = mobOf(w, 'slime');
  isolate(w, s);
  tp(w, id, s.x + 40, s.y);
  p.khi = 100;
  const hp0 = s.hp;
  w.handle(id, { t: 'ult' });
  assert.equal(p.khi, 0);

  // Trước 300ms: đang lấy đà
  run(w, 200);
  assert.equal(s.hp, hp0, 'chưa nện đất trước 300ms');

  // Sau 300ms: nện đất gây sát thương và choáng
  run(w, 200);
  assert.ok(s.hp < hp0 || s.dead, 'phải nhận sát thương');
  assert.ok(s.stunUntil > w.t, 'quái phải bị choáng');
});

test('đối thoại NPC và tiến trình nhiệm vụ Bếp Lửa Đình Làng', () => {
  const w = mk();
  const id = w.addPlayer(World.newProfile('t', 'Hero', 'warrior'));
  const p = w.debugPlayer(id)!;

  // Lại gần Ông Táo
  tp(w, id, NPCS.tao.x, NPCS.tao.y);
  w.handle(id, { t: 'talk', npcId: 'tao' });
  assert.equal(p.prof.quests.main1, 1);

  // Đánh 8 con slime hoàn thành bước 1
  for (let i = 0; i < 8; i++) {
    const s = mobOf(w, 'slime');
    (w as any).hitMob(s, id, 9999, 1);
  }
  assert.equal(p.prof.questProg.main1, 8);
  assert.equal(p.prof.quests.main1, 2, 'bước 2: báo công với Ông Táo');

  // Nói chuyện với Ông Táo để nhận thưởng và nhận bước 3
  const xp0 = p.prof.xp;
  w.handle(id, { t: 'talk', npcId: 'tao' });
  assert.equal(p.prof.quests.main1, 3, 'chuyển sang bước 3: tìm lá đa');
  assert.ok(p.prof.xp > xp0, 'nhận thưởng XP');

  // Nhặt 3 Lá Đa Cổ từ Cáo Tinh
  p.prof.inv.push({ uid: 991, key: 'leaf', qty: 3 });
  p.prof.questProg.main1_leaf = 3;
  w.handle(id, { t: 'talk', npcId: 'tao' });
  assert.equal(p.prof.quests.main1, 4, 'chuyển sang bước 4: diệt Chúa Mộc Tinh');

  // Nhận mảnh Trống Đồng 1 và hoàn thành nhiệm vụ
  p.prof.drumPieces.push(1);
  (w as any).recalc(p);
  w.handle(id, { t: 'talk', npcId: 'tao' });
  assert.equal(p.prof.quests.main1, 5, 'hoàn thành chuỗi nhiệm vụ');
  assert.equal(p.prof.title, 'Người Giữ Trống');
  assert.ok(p.stats.maxHp > 150, 'Mảnh Trống Đồng tăng 5% máu tối đa');
});

test('quán nước Bà Hàng Nước: mua bình máu và bán vũ khí cũ', () => {
  const w = mk();
  const id = w.addPlayer(World.newProfile('t', 'Trader', 'warrior'));
  const p = w.debugPlayer(id)!;
  p.prof.gold = 50;

  // Lại gần Quán Nước
  tp(w, id, NPCS.nuoc.x, NPCS.nuoc.y);

  // Mua bình máu
  const potions0 = p.prof.inv.find((i) => i.key === 'potion')!.qty;
  w.handle(id, { t: 'buy', item: 'potion' });
  assert.equal(p.prof.gold, 50 - SHOP_PRICES.buyPotion);
  assert.equal(p.prof.inv.find((i) => i.key === 'potion')!.qty, potions0 + 1);

  // Bán vũ khí cũ (iron_sword là rare -> 25 vàng)
  p.prof.inv.push({ uid: 999, key: 'iron_sword', qty: 1 });
  const goldBeforeSell = p.prof.gold;
  w.handle(id, { t: 'sell', uid: 999 });
  assert.equal(p.prof.gold, goldBeforeSell + SHOP_PRICES.sellWeapon.rare);
  assert.equal(p.prof.inv.some((i) => i.uid === 999), false);

  // Không được bán vũ khí đang trang bị
  const curWeaponUid = p.prof.inv.find((i) => i.key === p.prof.weapon)?.uid;
  if (curWeaponUid) {
    w.handle(id, { t: 'sell', uid: curWeaponUid });
    assert.ok(p.prof.weapon);
  }
});

test('nhiệm vụ phụ Chú Cuội: nhận khi nói chuyện, diệt Bánh Trôi Tinh, trả thưởng', () => {
  const w = mk();
  const id = w.addPlayer(World.newProfile('t', 'Buddy', 'archer'));
  const p = w.debugPlayer(id)!;
  assert.equal(p.prof.quests.cuoi1, undefined);

  // Chưa nhận nhiệm vụ thì diệt slime không tính
  (w as any).hitMob(mobOf(w, 'slime'), id, 9999, 1);
  assert.equal(p.prof.quests.cuoi1, undefined);

  // Nói chuyện lần đầu => nhận nhiệm vụ
  tp(w, id, NPCS.cuoi.x, NPCS.cuoi.y);
  w.handle(id, { t: 'talk', npcId: 'cuoi' });
  assert.equal(p.prof.quests.cuoi1, 1, 'đã nhận nhiệm vụ tìm "con trâu"');

  // Diệt 1 Bánh Trôi Tinh => sẵn sàng trả nhiệm vụ
  (w as any).hitMob(mobOf(w, 'slime'), id, 9999, 1);
  assert.equal(p.prof.quests.cuoi1, 2);

  const xp0 = p.prof.xp;
  w.handle(id, { t: 'talk', npcId: 'cuoi' });
  assert.equal(p.prof.quests.cuoi1, 3, 'hoàn thành nhiệm vụ phụ');
  assert.ok(p.prof.xp > xp0 || p.prof.lv > 1, 'nhận thưởng XP');
});

test('quái Vùng 2 - Cua Đá: khép càng giảm 80% sát thương nhận vào', () => {
  const w = new World({ rnd: () => 0.5, mapId: 'dam_sen' });
  const id = w.addPlayer(World.newProfile('t', 'Tanker', 'warrior'));
  const crab = [...(w as any).mobs.values()].find((m: any) => m.def.kind === 'crab');
  assert.ok(crab, 'phải có Cua Đá trên bản đồ Đầm Sen');

  // Đòn đánh thường khi Cua Đá chưa khép càng
  const hp0 = crab.hp;
  (w as any).hitMob(crab, id, 50, 1);
  const dmgNormal = hp0 - crab.hp;
  assert.ok(dmgNormal > 20, `sát thương gốc phải đáng kể, got ${dmgNormal}`);

  // Bật khép càng (vỏ cứng)
  (w as any).t += 100;
  crab.shellUntil = (w as any).t + 1500;
  const hp1 = crab.hp;
  (w as any).hitMob(crab, id, 50, 1);
  const dmgShielded = hp1 - crab.hp;

  // Sát thương khi khép càng chỉ bằng ~20% sát thương gốc (giảm 80%)
  assert.ok(dmgShielded <= Math.ceil(dmgNormal * 0.25) + 1, `dmgShielded=${dmgShielded} vs dmgNormal=${dmgNormal}`);
});

test('quái Vùng 2 - Ếch Lửa: nhả cầu lửa bay tới và gây sát thương người chơi', () => {
  const w = new World({ rnd: () => 0.5, mapId: 'dam_sen' });
  const id = w.addPlayer(World.newProfile('t', 'Hero', 'warrior'));
  const p = w.debugPlayer(id)!;
  const frog = [...(w as any).mobs.values()].find((m: any) => m.def.kind === 'frog');
  assert.ok(frog, 'phải có Ếch Lửa trên bản đồ Đầm Sen');

  // Đặt người chơi cách Ếch Lửa 100px (trong tầm bắn 160px)
  p.x = frog.x + 80; p.y = frog.y;
  p.hp = p.stats.maxHp;
  frog.state = 'chase'; frog.target = id;
  frog.nextAtk = 0;

  // Cho thế giới chạy 3 tick để Ếch Lửa nhả cầu lửa
  run(w, 150);
  const projs = [...(w as any).projs.values()];
  const fireball = projs.find((pr: any) => pr.k === 'fireball' && pr.isMob);
  assert.ok(fireball, 'Ếch Lửa phải nhả cầu lửa');

  // Chờ cầu lửa bay trúng người chơi
  run(w, 800);
  assert.ok(p.hp < p.stats.maxHp, 'người chơi phải mất máu khi trúng cầu lửa');
});

test('quái Vùng 2 - Ma Da: lặn không nhận đòn; đánh trúng kéo chậm người chơi 40%', () => {
  const w = new World({ rnd: () => 0.5, mapId: 'dam_sen' });
  const id = w.addPlayer(World.newProfile('t', 'Runner', 'archer'));
  const p = w.debugPlayer(id)!;
  const mada = [...(w as any).mobs.values()].find((m: any) => m.def.kind === 'mada');
  assert.ok(mada, 'phải có Ma Da trên bản đồ Đầm Sen');
  assert.equal(mada.submerged, true, 'Ma Da ban đầu phải đang lặn');

  // Đánh khi đang lặn: không mất máu
  const hp0 = mada.hp;
  (w as any).hitMob(mada, id, 100, 1);
  assert.equal(mada.hp, hp0, 'Ma Da đang lặn không nhận sát thương');

  // Đưa người chơi ra vùng sông ngoài Bến Đò
  p.x = mada.x + 20; p.y = mada.y;
  mada.submerged = false;
  mada.state = 'chase'; mada.target = id;
  mada.nextAtk = 0;
  run(w, 100);

  // Người chơi bị dính hiệu ứng làm chậm
  assert.ok(p.slowUntil > (w as any).t, 'người chơi phải bị dính trạng thái làm chậm');

  // Kiểm tra tốc độ di chuyển bị giảm 40% (còn 60%)
  const x0 = p.x;
  w.handle(id, { t: 'in', seq: 1, x: 1, y: 0 });
  w.tick();
  const dxSlow = p.x - x0;

  // Hết làm chậm
  p.slowUntil = 0;
  const x1 = p.x;
  w.handle(id, { t: 'in', seq: 2, x: 1, y: 0 });
  w.tick();
  const dxNormal = p.x - x1;

  assert.ok(Math.abs(dxSlow - dxNormal * 0.6) < 0.5, `dxSlow=${dxSlow}, dxNormal=${dxNormal}`);
});

test('đối thoại Bác Lái Đò và chuỗi nhiệm vụ Sương Mù Bến Đò (main2)', () => {
  const w = new World({ rnd: () => 0.5, mapId: 'dam_sen' });
  const id = w.addPlayer(World.newProfile('t', 'Hero', 'warrior'));
  const p = w.debugPlayer(id)!;
  p.prof.quests = { main1: 5 }; // Đã xong Vùng 1

  // 1. Nhận nhiệm vụ từ Bác Lái Đò
  tp(w, id, NPCS.do.x, NPCS.do.y);
  w.handle(id, { t: 'talk', npcId: 'do' });
  assert.equal(p.prof.quests.main2, 1, 'bước 1: nhận nhiệm vụ main2');

  // 2. Diệt 10 Cua Đá
  const crab = [...(w as any).mobs.values()].find((m: any) => m.def.kind === 'crab');
  assert.ok(crab);
  for (let i = 0; i < 10; i++) {
    crab.dmgBy.set(id, 100);
    (w as any).killMob(crab);
  }
  assert.equal(p.prof.quests.main2, 2, 'bước 2: đã diệt đủ 10 Cua Đá');

  // Báo công với Bác Lái Đò
  w.handle(id, { t: 'talk', npcId: 'do' });
  assert.equal(p.prof.quests.main2, 3, 'bước 3: chuyển sang tìm Hạt Sen Đêm');

  // 3. Thu thập 4 Hạt Sen Đêm
  for (let i = 1; i <= 4; i++) {
    (w as any).tryPickup(p, { id: 800 + i, key: 'lotus_seed', qty: 1, born: (w as any).t, owner: id });
  }
  assert.equal(p.prof.questProg.main2_seed, 4);

  // Đưa Hạt Sen Đêm cho Bác Lái Đò
  w.handle(id, { t: 'talk', npcId: 'do' });
  assert.equal(p.prof.quests.main2, 4, 'bước 4: chuyển sang trừ Ma Da');

  // 4. Trừ 5 Ma Da
  const mada = [...(w as any).mobs.values()].find((m: any) => m.def.kind === 'mada');
  assert.ok(mada);
  for (let i = 0; i < 5; i++) {
    mada.dmgBy.set(id, 100);
    (w as any).killMob(mada);
  }
  assert.equal(p.prof.quests.main2, 5, 'bước 5: đã trừ đủ 5 Ma Da');

  // 5. Hạ Chúa Thuồng Luồng
  const serpent = [...(w as any).mobs.values()].find((m: any) => m.def.kind === 'serpent');
  assert.ok(serpent, 'phải có Thuồng Luồng');
  serpent.dmgBy.set(id, 2000);
  (w as any).killMob(serpent);
  assert.ok(p.prof.drumPieces.includes(2), 'phải nhận Mảnh Trống Đồng 2');
  assert.equal(p.prof.quests.main2, 6, 'bước 6: đem Mảnh Trống Đồng về Làng Tre');

  // 6. Đem về cho Ông Táo ở Làng Tre
  const wLang = new World({ rnd: () => 0.5, mapId: 'lang_tre' });
  const idLang = wLang.addPlayer(p.prof);
  const pLang = wLang.debugPlayer(idLang)!;
  tp(wLang, idLang, NPCS.tao.x, NPCS.tao.y);
  wLang.handle(idLang, { t: 'talk', npcId: 'tao' });
  assert.equal(pLang.prof.quests.main2, 7, 'hoàn thành chuỗi main2');
  assert.equal(pLang.prof.title, 'Người Lặng Sóng', 'nhận danh hiệu Người Lặng Sóng');
  assert.equal(pLang.prof.questProg.codex_vinh_hoa, 1, 'mở khóa Tranh Vinh Hoa');
});

test('nhiệm vụ Cô Tấm (tam1): nhặt Chiếc Hài Thêu, trả thưởng và mở khóa Tranh Đông Hồ', () => {
  const w = new World({ rnd: () => 0.5, mapId: 'dam_sen' });
  const id = w.addPlayer(World.newProfile('t', 'HeroTam', 'archer'));
  const p = w.debugPlayer(id)!;

  // Nói chuyện với Cô Tấm
  tp(w, id, NPCS.tam.x, NPCS.tam.y);
  w.handle(id, { t: 'talk', npcId: 'tam' });
  assert.equal(p.prof.quests.tam1, 1, 'bước 1: nhận tìm Chiếc Hài Thêu');

  // Nhặt được Chiếc Hài Thêu
  (w as any).tryPickup(p, { id: 999, key: 'shoe', qty: 1, born: (w as any).t, owner: id });
  assert.equal(p.prof.quests.tam1, 2, 'bước 2: đã nhặt được Chiếc Hài Thêu');

  // Trả cho Cô Tấm
  w.handle(id, { t: 'talk', npcId: 'tam' });
  assert.equal(p.prof.quests.tam1, 3, 'bước 3: hoàn thành nhiệm vụ Cô Tấm');
  assert.equal(p.prof.title, 'Đoan Trang', 'nhận danh hiệu Đoan Trang');
  assert.equal(p.prof.questProg.codex_hung_dua, 1, 'mở khóa Tranh Hứng Dừa');
  assert.equal(p.prof.questProg.codex_chan_trau, 1, 'mở khóa Tranh Chăn Trâu');
});

test('boss Thuồng Luồng: Quẫy Đuôi báo trước và Sóng Dữ khi dưới 50% máu', () => {
  const w = new World({ rnd: () => 0.5, mapId: 'dam_sen' });
  const id = w.addPlayer(World.newProfile('t', 'Challenger', 'warrior'));
  const p = w.debugPlayer(id)!;
  const serpent = [...(w as any).mobs.values()].find((m: any) => m.def.kind === 'serpent');
  assert.ok(serpent);

  // Đặt người chơi cạnh Thuồng Luồng để kích hoạt chiến đấu
  p.x = serpent.x + 30; p.y = serpent.y;
  serpent.state = 'chase'; serpent.target = id;
  serpent.nextSweep = 0;

  // Cho thời gian chạy 50ms để kích hoạt Quẫy Đuôi
  w.tick();
  const events = (w as any).events;
  const hasSweep = events.some((ev: any) => ev.e === 'fx' && ev.k === 'sweep');
  assert.ok(hasSweep, 'Thuồng Luồng phải quẫy đuôi quét sát thương vùng');

  // Hạ máu Thuồng Luồng xuống 40% (dưới 50%) để kích hoạt Sóng Dữ
  serpent.hp = Math.round(serpent.def.hp * 0.4);
  serpent.nextWave = 0;
  serpent.castUntil = 0;
  w.tick();
  const hasWave = (w as any).events.some((ev: any) => ev.e === 'fx' && ev.k === 'wave');
  assert.ok(hasWave, 'Thuồng Luồng dưới 50% máu phải tung sóng dữ');
});

test('Bà Hàng Nước: Đố Vui Dân Gian trả lời đúng nhận XP, vàng và hồi đầy Khí', () => {
  const w = new World({ rnd: () => 0.5, mapId: 'lang_tre' });
  const id = w.addPlayer(World.newProfile('t', 'Scholar', 'mage'));
  const p = w.debugPlayer(id)!;

  tp(w, id, NPCS.nuoc.x, NPCS.nuoc.y);
  p.khi = 10;
  const xp0 = p.prof.xp;
  const gold0 = p.prof.gold;

  // Đáp án chỉ có ở server; client không biết trước
  const ans = TRIVIA_ANSWERS[0].ans;
  assert.equal('ans' in TRIVIA_QUESTIONS[0], false, 'dữ liệu client không được chứa đáp án');
  w.handle(id, { t: 'trivia', qId: 0, choice: ans });

  assert.equal(p.khi, 100, 'trả lời đúng phải hồi 100% Khí');
  assert.ok(p.prof.level > 1 || p.prof.xp >= 50, 'nhận 50 XP (đủ lên cấp 2)');
  assert.equal(p.prof.gold, gold0 + 25, 'nhận 25 Vàng');
  assert.equal(p.prof.questProg.trivia_correct, 1, 'ghi nhận tiến độ câu đố');
  const res = w.outbox.find((o) => o.to === id && o.msg.t === 'trivia_result')?.msg;
  assert.ok(res && res.t === 'trivia_result' && res.ok && res.ans === ans, 'gửi kết quả kèm đáp án sau khi trả lời');
});

test('Đố Vui: mỗi câu chỉ được thưởng 1 lần mỗi ngày, sang ngày mới đố tiếp được', () => {
  let now = Date.UTC(2026, 9, 4, 3, 0, 0);
  const w = new World({ rnd: () => 0.5, mapId: 'lang_tre', now: () => now });
  const id = w.addPlayer(World.newProfile('t', 'Scholar', 'mage'));
  const p = w.debugPlayer(id)!;
  tp(w, id, NPCS.nuoc.x, NPCS.nuoc.y);
  const ans = TRIVIA_ANSWERS[1].ans;

  w.handle(id, { t: 'trivia', qId: 1, choice: ans });
  const gold1 = p.prof.gold;
  for (let i = 0; i < 5; i++) w.handle(id, { t: 'trivia', qId: 1, choice: ans });
  assert.equal(p.prof.gold, gold1, 'trả lời lại cùng câu trong ngày không được thưởng thêm');
  assert.equal(p.prof.questProg.trivia_correct, 1);

  // trả lời sai cũng tính là đã trả lời: không được thử lại để ăn thưởng
  const wrong = (TRIVIA_ANSWERS[2].ans + 1) % 3;
  w.handle(id, { t: 'trivia', qId: 2, choice: wrong });
  w.handle(id, { t: 'trivia', qId: 2, choice: TRIVIA_ANSWERS[2].ans });
  assert.equal(p.prof.gold, gold1, 'sai rồi thì hôm nay không trả lời lại câu đó được');

  now += 24 * 3600_000; // sang ngày hôm sau
  w.handle(id, { t: 'trivia', qId: 1, choice: ans });
  assert.equal(p.prof.gold, gold1 + 25, 'ngày mới được đố lại');
});

// ------------------------------------------------------------ Nghề Sống

const DAY = Date.UTC(2026, 9, 4, 3, 0, 0); // 10h sáng giờ Việt Nam
const fishMsgs = (w: World, id: number) => w.outbox.filter((o) => o.to === id && o.msg.t === 'fish').map((o) => o.msg as Extract<ServerMsg, { t: 'fish' }>);

/** Ô đứng được, sát mép nước thuộc loại chỗ câu `spot`. */
function fishStand(w: World, spot: string) {
  for (let ty = 1; ty < MAP_H - 1; ty++) {
    for (let tx = 1; tx < MAP_W - 1; tx++) {
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      if (collides(w.map, x, y, PLAYER_RADIUS)) continue;
      if (fishSpotAt(w.map, x, y, PLAYER_RADIUS)?.spot === spot) return { x, y };
    }
  }
  throw new Error(`không có chỗ câu ${spot}`);
}

/** Thả câu và giật đúng lúc cho tới khi kéo được cá. */
function fishUntilCatch(w: World, id: number) {
  w.outbox.length = 0;
  w.handle(id, { t: 'fish_cast' });
  for (let i = 0; i < 400; i++) {
    w.tick();
    const ms = fishMsgs(w, id);
    w.outbox.length = 0;
    if (ms.some((m) => m.s === 'bite')) {
      w.handle(id, { t: 'fish_reel' });
      const after = fishMsgs(w, id);
      w.outbox.length = 0;
      const done = after.find((m) => m.s === 'catch' || m.s === 'full');
      if (done) return done;
    }
  }
  throw new Error('câu mãi không được cá');
}

test('câu cá ở Bến Đò: thả câu, giật đúng lúc thì được cá vào Giỏ Tre và lên kinh nghiệm nghề', () => {
  const w = new World({ rnd: seeded(7), mapId: 'dam_sen', now: () => DAY });
  const id = w.addPlayer(World.newProfile('t', 'Ngư', 'warrior'));
  const p = w.debugPlayer(id)!;
  const st = fishStand(w, 'ben');
  tp(w, id, st.x, st.y);

  for (let n = 0; n < 5; n++) {
    const m = fishUntilCatch(w, id);
    assert.equal(m.s, 'catch');
    assert.ok(m.key && LIFE_ITEMS[m.key], `loài hợp lệ: ${m.key}`);
  }
  const total = Object.values(p.prof.life!.bag).reduce((s, n) => s + n, 0);
  assert.equal(total, 5, 'mỗi lần câu được 1 con vào Giỏ Tre');
  assert.ok((p.prof.life!.xp.fish ?? 0) >= 10, 'có kinh nghiệm nghề Câu cá');
  assert.equal(p.prof.inv.length, 1, 'túi vũ khí không bị chiếm chỗ');
});

test('câu cá: giật sớm thì cá chạy, chậm thì sổng, rời chỗ là thu cần, không đứng cạnh nước thì không câu được', () => {
  const w = new World({ rnd: seeded(3), mapId: 'dam_sen', now: () => DAY });
  const id = w.addPlayer(World.newProfile('t', 'Ngư', 'archer'));
  const p = w.debugPlayer(id)!;

  // giữa quảng trường bến đò, xa nước
  tp(w, id, NPCS.do.x - 300, NPCS.do.y - 40);
  w.handle(id, { t: 'fish_cast' });
  assert.equal(p.fish, null, 'không đứng cạnh nước thì không thả câu được');

  const st = fishStand(w, 'ben');
  tp(w, id, st.x, st.y);

  w.outbox.length = 0;
  w.handle(id, { t: 'fish_cast' });
  assert.ok(p.fish, 'đã thả câu');
  w.handle(id, { t: 'fish_reel' });
  assert.equal(p.fish, null);
  assert.ok(fishMsgs(w, id).some((m) => m.s === 'early'), 'giật khi phao chưa chìm: cá chạy');

  w.handle(id, { t: 'fish_cast' });
  w.outbox.length = 0;
  let bit = false;
  for (let i = 0; i < 400 && !bit; i++) { w.tick(); bit = fishMsgs(w, id).some((m) => m.s === 'bite'); }
  assert.ok(bit, 'phao phải chìm trong vòng 12 giây');
  run(w, 2000); // không giật
  assert.equal(p.fish, null);
  assert.ok(fishMsgs(w, id).some((m) => m.s === 'miss'), 'không giật kịp: cá sổng');

  w.handle(id, { t: 'fish_cast' });
  w.outbox.length = 0;
  p.x += 20; // bỏ đi chỗ khác
  w.tick();
  assert.equal(p.fish, null);
  assert.ok(fishMsgs(w, id).some((m) => m.s === 'cancel'), 'rời chỗ là thu cần');
});

test('câu cá: ngồi câu cạnh bạn thì được "ngồi câu cùng bạn"', () => {
  const w = new World({ rnd: seeded(5), mapId: 'dam_sen', now: () => DAY });
  const a = w.addPlayer(World.newProfile('a', 'A', 'warrior'));
  const b = w.addPlayer(World.newProfile('b', 'B', 'mage'));
  const st = fishStand(w, 'ben');
  tp(w, a, st.x, st.y);
  tp(w, b, st.x, st.y);
  w.handle(a, { t: 'fish_cast' });
  assert.equal(w.debugPlayer(a)!.fish!.social, false, 'người đầu tiên câu một mình');
  w.handle(b, { t: 'fish_cast' });
  assert.equal(w.debugPlayer(b)!.fish!.social, true, 'người thứ hai ngồi câu cùng bạn');
});

test('nấu ăn ở Bếp Ông Táo: đủ nguyên liệu và cấp nghề thì ra món, bị đánh/rời chỗ thì hỏng', () => {
  const w = new World({ rnd: seeded(), mapId: 'lang_tre', now: () => DAY });
  const id = w.addPlayer(World.newProfile('t', 'Bếp', 'warrior'));
  const p = w.debugPlayer(id)!;
  tp(w, id, NPCS.tao.x, NPCS.tao.y + 20);
  const bag = p.prof.life!.bag;
  bag.ca_ro = 2; bag.cua_dong = 2;

  w.handle(id, { t: 'cook', recipe: 'canh_cua' });
  assert.equal(p.cooking, null, 'Canh cua cần nghề Nấu nướng cấp 2');

  w.handle(id, { t: 'cook', recipe: 'ca_nuong' });
  assert.ok(p.cooking, 'bắt đầu nướng cá');
  run(w, 2100);
  assert.equal(p.cooking, null);
  assert.equal(bag.ca_nuong, 1, 'có 1 Cá nướng trui');
  assert.equal(bag.ca_ro, 1, 'tốn 1 cá rô');
  assert.ok((p.prof.life!.xp.cook ?? 0) > 0, 'có kinh nghiệm nghề Nấu nướng');

  // đang nấu mà bỏ đi thì hỏng, không mất nguyên liệu
  w.handle(id, { t: 'cook', recipe: 'ca_nuong' });
  p.x += 30;
  run(w, 2100);
  assert.equal(bag.ca_nuong, 1, 'rời bếp thì nồi hỏng');
  assert.equal(bag.ca_ro, 1, 'nguyên liệu còn nguyên');

  // đủ cấp 2 thì nấu được canh cua
  p.prof.life!.xp.cook = 40;
  tp(w, id, NPCS.tao.x, NPCS.tao.y + 20);
  w.handle(id, { t: 'cook', recipe: 'canh_cua' });
  run(w, 2100);
  assert.equal(bag.canh_cua, 1);
  assert.equal(bag.cua_dong, undefined, 'dùng hết cua thì xoá khỏi giỏ');
});

test('lửa trại: cần củi; nướng được ở lửa trại nhưng món canh phải ở Bếp Ông Táo; lửa tàn sau 90 giây', () => {
  const w = new World({ rnd: seeded(), mapId: 'dam_sen', now: () => DAY });
  const id = w.addPlayer(World.newProfile('t', 'Lửa', 'archer'));
  const p = w.debugPlayer(id)!;
  tp(w, id, NPCS.do.x - 200, NPCS.do.y);
  const bag = p.prof.life!.bag;
  bag.tom = 2; bag.ca_chep = 1;
  p.prof.life!.xp.cook = 300; // cấp 5

  w.handle(id, { t: 'cook', recipe: 'tom_nuong' });
  assert.equal(p.cooking, null, 'không có bếp/lửa thì không nấu được');
  w.handle(id, { t: 'campfire' });
  assert.equal(w.buildSnapshots()[0].msg.t === 'snap' && (w.buildSnapshots()[0].msg as any).cf, undefined, 'không có củi thì không nhóm được lửa');

  bag.cui = 1;
  w.handle(id, { t: 'campfire' });
  assert.equal(bag.cui, undefined, 'tốn 1 củi');
  const snap = w.buildSnapshots().find((o) => o.msg.t === 'snap')!.msg as Extract<ServerMsg, { t: 'snap' }>;
  assert.equal(snap.cf?.length, 1, 'lửa trại hiện cho mọi người');

  w.handle(id, { t: 'cook', recipe: 'ca_kho' });
  assert.equal(p.cooking, null, 'Cá kho tộ cần nồi ở Bếp Ông Táo');
  w.handle(id, { t: 'cook', recipe: 'tom_nuong' });
  run(w, 2100);
  assert.equal(bag.tom_nuong, 1, 'nướng tôm ở lửa trại');

  run(w, 90_000);
  const snap2 = w.buildSnapshots().find((o) => o.msg.t === 'snap')!.msg as Extract<ServerMsg, { t: 'snap' }>;
  assert.equal(snap2.cf, undefined, 'lửa tàn');
});

test('ăn uống: hồi máu/Khí; chỉ 1 buff một lúc, món mới thay món cũ; hết hạn theo giờ thật', () => {
  let now = DAY;
  const w = new World({ rnd: seeded(), mapId: 'lang_tre', now: () => now });
  const id = w.addPlayer(World.newProfile('t', 'Ăn', 'warrior'));
  const p = w.debugPlayer(id)!;
  const bag = p.prof.life!.bag;
  bag.ca_nuong = 1; bag.tom_nuong = 1; bag.luon_nuong = 1; bag.canh_cua = 1;
  const base = { ...p.stats };

  p.hp = 10;
  w.handle(id, { t: 'eat', key: 'ca_nuong' });
  assert.ok(p.hp > 10, 'cá nướng hồi máu');
  run(w, 1600);
  p.khi = 0;
  w.handle(id, { t: 'eat', key: 'tom_nuong' });
  assert.equal(p.khi, 30, 'tôm nướng hồi 30 Khí');

  run(w, 1600);
  w.handle(id, { t: 'eat', key: 'luon_nuong' });
  assert.ok(p.stats.atk > base.atk, 'lươn nướng tăng Công');
  run(w, 1600);
  w.handle(id, { t: 'eat', key: 'canh_cua' });
  assert.equal(p.stats.atk, base.atk, 'ăn món khác thì mất buff cũ');
  assert.ok(p.stats.def > base.def, 'canh cua tăng Thủ');
  assert.equal(p.prof.life!.buff?.key, 'canh_cua');

  now += 11 * 60_000;
  run(w, 1100);
  assert.equal(p.prof.life!.buff, undefined, 'hết 10 phút thì hết buff');
  assert.equal(p.stats.def, base.def, 'chỉ số trở lại như cũ');
});

test('bán thuỷ sản cho Bác Lái Đò: giá theo loài, vượt mức mỗi ngày thì ép giá; rác không bán được', () => {
  const w = new World({ rnd: seeded(), mapId: 'dam_sen', now: () => DAY });
  const id = w.addPlayer(World.newProfile('t', 'Buôn', 'mage'));
  const p = w.debugPlayer(id)!;
  const bag = p.prof.life!.bag;
  bag.ca_chep = 50; bag.dep_rach = 1;

  w.handle(id, { t: 'sell_bag', key: 'ca_chep', qty: 1 });
  assert.equal(p.prof.gold, 0, 'phải đứng gần thương lái');

  tp(w, id, NPCS.do.x, NPCS.do.y);
  w.handle(id, { t: 'sell_bag', key: 'ca_chep', qty: 10 });
  assert.equal(p.prof.gold, 10 * LIFE_ITEMS.ca_chep.sell);

  w.handle(id, { t: 'sell_bag', key: 'ca_chep', qty: 40 });
  assert.ok(p.prof.gold < 50 * LIFE_ITEMS.ca_chep.sell, 'quá 300 vàng/ngày thì bị ép giá');
  assert.ok(p.prof.gold >= SELL_DAILY_CAP, 'vẫn bán được');
  assert.equal(bag.ca_chep, undefined);

  w.handle(id, { t: 'sell_bag', key: 'dep_rach', qty: 1 });
  assert.equal(bag.dep_rach, 1, 'dép rách không ai mua');
  w.handle(id, { t: 'bag_drop', key: 'dep_rach' });
  assert.equal(bag.dep_rach, undefined, 'bỏ đi được');
});

test('Cá Chép Vàng: đem đến Ông Táo phóng sinh nhận danh hiệu', () => {
  const w = new World({ rnd: seeded(), mapId: 'lang_tre', now: () => DAY });
  const prof = World.newProfile('t', 'Phúc', 'warrior');
  prof.quests = { main1: 5 };
  const id = w.addPlayer(prof);
  const p = w.debugPlayer(id)!;
  p.prof.life!.bag.ca_chep_vang = 1;
  tp(w, id, NPCS.tao.x, NPCS.tao.y + 20);
  w.handle(id, { t: 'talk', npcId: 'tao' });
  assert.equal(p.prof.life!.bag.ca_chep_vang, undefined);
  assert.equal(p.prof.title, 'Cá Chép Hoá Rồng');
});

test('Nghề Sống được lưu: normalizeLife bỏ dữ liệu lạ, giữ đúng giỏ và cấp nghề', () => {
  const life = normalizeLife({ xp: { fish: 120, hack: 9 }, bag: { ca_ro: 3, vang_khoi: 999, tom: -2 }, buff: { key: 'ca_kho', until: 123 } });
  assert.deepEqual(life.bag, { ca_ro: 3 });
  assert.deepEqual(life.xp, { fish: 120 });
  assert.equal(life.buff?.key, 'ca_kho');
  assert.equal(normalizeLife(null).bag && Object.keys(normalizeLife(null).bag).length, 0);
});

// ------------------------------------------------------------ Săn bắt & đặt bẫy

const killAll = (w: World) => { for (const m of w.mobs.values()) { m.dead = true; m.respawnAt = 1e12; } };
const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Vài chỗ đặt bẫy hợp lệ, cách nhau xa. */
function trapSpots(w: World, n: number) {
  const out: { x: number; y: number }[] = [];
  for (let ty = 1; ty < MAP_H - 1 && out.length < n; ty++) {
    for (let tx = 1; tx < MAP_W - 1 && out.length < n; tx++) {
      const s = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
      if (collides(w.map, s.x, s.y, PLAYER_RADIUS) || !trapSpotOk(w.map, s.x, s.y)) continue;
      if (out.some((o) => gap(o, s) < 100)) continue;
      out.push(s);
    }
  }
  if (out.length < n) throw new Error('không đủ chỗ đặt bẫy');
  return out;
}

test('thú rừng: thấy người thì bỏ chạy, không bao giờ đánh trả', () => {
  const w = new World({ rnd: seeded(), mapId: 'lang_tre', now: () => DAY });
  const r = mobOf(w, 'rabbit');
  isolate(w, r);
  const id = w.addPlayer(World.newProfile('t', 'Săn', 'mage'));
  const p = w.debugPlayer(id)!;
  p.nextAtk = 1e12; // đứng nhìn, không tự đánh
  tp(w, id, r.x + 50, r.y);
  const hp0 = p.hp, d0 = gap(p, r);
  run(w, 1000);
  assert.ok(gap(p, r) > d0 + 30, `thỏ phải chạy xa: ${d0} -> ${gap(p, r)}`);
  assert.equal(p.hp, hp0, 'thỏ không cắn người');
  // bị đuổi sát mãi thì đuối sức, phải đứng thở
  let rested = false;
  for (let i = 0; i < 80 && !rested; i++) { tp(w, id, r.x + 40, r.y); w.tick(); rested = (r.restUntil ?? 0) > w.t; }
  assert.ok(rested, 'thỏ có lúc đứng thở');
  assert.equal(p.hp, hp0);
});

test('hạ thú rừng: thịt vào thẳng Giỏ Tre, lên nghề Săn bắt, không rơi vàng', () => {
  const w = new World({ rnd: seeded(), mapId: 'lang_tre', now: () => DAY });
  const r = mobOf(w, 'rabbit');
  isolate(w, r);
  const id = w.addPlayer(World.newProfile('t', 'Săn', 'warrior'));
  const p = w.debugPlayer(id)!;
  tp(w, id, r.x + 20, r.y);
  w.outbox.length = 0;
  (w as any).hitMob(r, id, 999, 5);
  assert.equal(r.dead, true);
  assert.equal(p.prof.life!.bag.thit_tho, 1, 'được 1 phần thịt thỏ');
  assert.equal(p.prof.life!.xp.hunt, 6, 'có kinh nghiệm nghề Săn bắt');
  assert.equal((w as any).drops.size, 0, 'thú rừng không rơi vàng/đồ');
  assert.ok(w.outbox.some((o) => o.to === id && o.msg.t === 'gain' && o.msg.how === 'hunt' && o.msg.key === 'thit_tho'));
});

test('lợn rừng: không tự lao vào người, bị đánh mới húc lại', () => {
  const w = new World({ rnd: seeded(), mapId: 'lang_tre', now: () => DAY });
  const b = mobOf(w, 'boar');
  isolate(w, b);
  const id = w.addPlayer(World.newProfile('t', 'Săn', 'mage'));
  const p = w.debugPlayer(id)!;
  p.nextAtk = 1e12;
  tp(w, id, b.x + 30, b.y);
  const hp0 = p.hp;
  run(w, 3000);
  assert.equal(p.hp, hp0, 'chưa đánh thì lợn rừng để yên');
  assert.equal(b.state, 'idle');
  (w as any).hitMob(b, id, 5, 1);
  run(w, 3000);
  assert.ok(p.hp < hp0, 'bị đánh thì lợn rừng húc lại');
});

test('đặt bẫy: mua ở Bà Hàng Nước, chỉ đặt trên bãi cỏ ngoài làng, giới hạn số bẫy, sập theo giờ thật', () => {
  let now = DAY;
  const w = new World({ rnd: seeded(), mapId: 'lang_tre', now: () => now });
  killAll(w);
  const id = w.addPlayer(World.newProfile('t', 'Bẫy', 'archer'));
  const p = w.debugPlayer(id)!;
  const life = p.prof.life!;

  tp(w, id, NPCS.nuoc.x, NPCS.nuoc.y + 20);
  p.prof.gold = 100;
  for (let i = 0; i < 3; i++) w.handle(id, { t: 'buy', item: 'bay' });
  assert.equal(life.bag.bay, 3);
  assert.equal(p.prof.gold, 100 - 3 * BAY_PRICE);

  w.handle(id, { t: 'trap_set' });
  assert.equal(life.traps, undefined, 'trong làng không đặt bẫy được');

  const [s0, s1, s2] = trapSpots(w, 3);
  tp(w, id, s0.x, s0.y);
  w.handle(id, { t: 'trap_set' });
  assert.equal(life.traps?.length, 1);
  assert.equal(life.bag.bay, 2);
  w.handle(id, { t: 'trap_set' });
  assert.equal(life.traps?.length, 1, 'không đặt 2 bẫy sát nhau');

  tp(w, id, s1.x, s1.y);
  w.handle(id, { t: 'trap_set' });
  tp(w, id, s2.x, s2.y);
  w.handle(id, { t: 'trap_set' });
  assert.equal(life.traps?.length, 2, 'Săn bắt cấp 1 chỉ đặt 2 bẫy');
  assert.equal(life.bag.bay, 1);

  // client chỉ thấy vị trí và thời gian còn lại, không thấy con mồi
  const me = (w as any).selfState(p);
  assert.equal(me.life.traps.length, 2);
  assert.ok(me.life.traps[0].left > 0 && !('catch' in me.life.traps[0]));

  const [t0, t1] = life.traps!;
  tp(w, id, s0.x, s0.y);
  w.handle(id, { t: 'trap_take', id: t0.id });
  assert.equal(life.traps?.length, 2, 'bẫy chưa sập thì chưa thu');
  w.handle(id, { t: 'trap_take', id: t0.id, force: 1 });
  assert.equal(life.traps?.length, 1, 'gỡ bẫy sớm');
  assert.equal(life.bag.bay, 2, 'gỡ sớm được trả lại bẫy');
  assert.equal(life.xp.hunt, undefined, 'gỡ sớm không có gì');

  w.handle(id, { t: 'trap_take', id: t1.id });
  assert.equal(life.traps?.length, 1, 'đứng xa thì không thu được');

  now += 16 * 60_000;
  tp(w, id, s1.x, s1.y);
  w.handle(id, { t: 'trap_take', id: t1.id });
  assert.equal(life.traps, undefined, 'đã thu hết bẫy');
  assert.equal(life.bag.bay, 3, 'bẫy dùng lại được');
  assert.ok((life.xp.hunt ?? 0) > 0, 'thu bẫy có kinh nghiệm Săn bắt');
  assert.equal(t1.catch ? life.bag[t1.catch] : 0, t1.catch ? 1 : 0, 'được đúng con mồi đã sập bẫy');
});

test('bẫy được lưu: normalizeLife bỏ bẫy hỏng; món thịt nấu được và Gà nướng tăng tốc chạy', () => {
  const life = normalizeLife({
    traps: [
      { id: 1, map: 'lang_tre', x: 10, y: 20, readyAt: 5, catch: 'thit_tho' },
      { id: 2, map: 'mat_trang', x: 10, y: 20, readyAt: 5, catch: '' },
      { id: 3, map: 'dam_sen', x: 10, y: 20, readyAt: 5, catch: 'vang_khoi' },
      { id: 4, map: 'dam_sen', x: 10, y: 20, readyAt: 5, catch: '' },
    ],
  });
  assert.deepEqual(life.traps?.map((t) => t.id), [1, 4]);

  const w = new World({ rnd: seeded(), mapId: 'lang_tre', now: () => DAY });
  const id = w.addPlayer(World.newProfile('t', 'Bếp', 'warrior'));
  const p = w.debugPlayer(id)!;
  const bag = p.prof.life!.bag;
  bag.thit_tho = 1; bag.thit_ga = 1;
  p.prof.life!.xp.cook = 40; // cấp 2
  tp(w, id, NPCS.tao.x, NPCS.tao.y + 20);
  w.handle(id, { t: 'cook', recipe: 'tho_nuong' });
  run(w, 2100);
  assert.equal(bag.tho_nuong, 1, 'nướng được thỏ');
  w.handle(id, { t: 'cook', recipe: 'ga_nuong' });
  run(w, 2100);
  assert.equal(bag.ga_nuong, 1, 'nướng được gà rừng');
  const speed0 = p.stats.speed;
  w.handle(id, { t: 'eat', key: 'ga_nuong' });
  assert.ok(p.stats.speed > speed0, 'gà nướng lá chanh tăng tốc chạy');
});

test('canh nông: cuốc đất, mua giống lúa, gieo hạt, tưới nước, bón phân gà, thu hoạch lúa, xay xát cối đá', () => {
  let now = DAY;
  const w = new World({ rnd: seeded(), mapId: 'vuon_nha', now: () => now });
  const id = w.addPlayer(World.newProfile('t', 'Nông Dân', 'warrior'));
  const p = w.debugPlayer(id)!;
  const life = p.prof.life!;
  const farm = life.farm!;

  // 1. Kiểm tra farm khởi tạo mặc định đủ 8 ô đất
  assert.equal(farm.plots.length, 8);
  assert.equal(farm.plots[0].state, 'empty');

  // 2. Cuốc đất ô 0
  w.handle(id, { t: 'farm_plow', plot: 0 });
  assert.equal(farm.plots[0].state, 'plowed');
  assert.ok((life.xp.farm ?? 0) > 0, 'cuốc đất nhận XP Canh nông');

  // 3. Mua giống lúa tẻ ở quán nước
  p.prof.gold = 50;
  tp(w, id, NPCS.nuoc.x, NPCS.nuoc.y + 20);
  w.handle(id, { t: 'buy', item: 'giong_te' });
  assert.equal(life.bag.giong_te, 1, 'đã mua được 1 giống lúa tẻ');
  assert.equal(p.prof.gold, 50 - 4);

  // 4. Bón phân gà trước khi gieo (giả sử có 1 phân gà)
  life.bag.phan_ga = 1;
  w.handle(id, { t: 'farm_fertilize', plot: 0 });
  assert.equal(farm.plots[0].fertilized, true, 'đã bón phân chuồng');
  assert.equal(life.bag.phan_ga, undefined);

  // 5. Gieo hạt giống
  w.handle(id, { t: 'farm_plant', plot: 0, crop: 'giong_te' });
  assert.equal(farm.plots[0].state, 'planted');
  assert.equal(farm.plots[0].crop, 'giong_te');
  assert.equal(life.bag.giong_te, undefined, 'đã tiêu tốn hạt giống');

  // 6. Tưới nước
  w.handle(id, { t: 'farm_water', plot: 0 });
  assert.ok((farm.plots[0].waterUntil ?? 0) > now, 'đất đã được tưới đẫm');

  // 7. Tua thời gian đến khi lúa chín (120s có nước + 130s khô = 185s hiệu dụng > 180s)
  now += 250_000;
  // Trigger update thông qua selfState
  const me = (w as any).selfState(p);
  assert.equal(me.life.farm.plots[0].progress, 1, 'lúa đã chín rộ 100%');

  // 8. Thu hoạch lúa
  w.handle(id, { t: 'farm_harvest', plot: 0 });
  assert.equal(farm.plots[0].state, 'empty', 'thu hoạch xong ô đất trở về trống');
  // Với bón phân gà (+25%): 4 * 1.25 = 5 thóc tẻ, và 2 rơm
  assert.equal(life.bag.thoc, 5, 'nhận được 5 thóc tẻ (có bonus phân gà)');
  assert.equal(life.bag.rom, 2, 'nhận được 2 rơm vàng');

  // 9. Xay xát cối đá: 2 thóc -> 2 gạo tẻ + 1 cám gạo
  w.handle(id, { t: 'farm_mill', crop: 'giong_te' });
  assert.equal(life.bag.thoc, 3, 'còn lại 3 thóc');
  assert.equal(life.bag.gao_te, 2, 'thu được 2 gạo tẻ');
  assert.equal(life.bag.cam_gao, 1, 'thu được 1 cám gạo');
});

test('chuồng gà: mua gà con, cho ăn thóc/cám, gà lớn và đẻ trứng, nhặt trứng, dọn phân chuồng', () => {
  let now = DAY;
  const w = new World({ rnd: seeded(), mapId: 'vuon_nha', now: () => now });
  const id = w.addPlayer(World.newProfile('t', 'Chăn Nuôi', 'warrior'));
  const p = w.debugPlayer(id)!;
  const life = p.prof.life!;
  const farm = life.farm!;

  // 1. Mua gà con
  p.prof.gold = 50;
  tp(w, id, NPCS.nuoc.x, NPCS.nuoc.y + 20);
  w.handle(id, { t: 'buy', item: 'ga_con' });
  assert.equal(life.bag.ga_con, 1);

  // 2. Thả gà vào chuồng
  w.handle(id, { t: 'coop_add' });
  assert.equal(farm.chickens.length, 1, 'đã thả gà vào chuồng');
  assert.equal(life.bag.ga_con, undefined);

  // 3. Đổ cám/thóc vào máng ăn
  life.bag.cam_gao = 3;
  w.handle(id, { t: 'coop_feed', item: 'cam_gao' });
  assert.equal(farm.troughFood, 1, 'máng ăn có 1 phần cám');
  assert.equal(life.bag.cam_gao, 2);

  // 4. Cho ăn thêm 2 phần cám nữa
  w.handle(id, { t: 'coop_feed', item: 'cam_gao' });
  w.handle(id, { t: 'coop_feed', item: 'cam_gao' });
  assert.equal(farm.troughFood, 3);

  // 5. Tua thời gian: 3 phút lớn thành gà trưởng thành + đẻ trứng
  now += 180_000 + 130_000;
  (w as any).selfState(p);
  assert.ok(farm.chickens[0].fedTime >= 180_000, 'gà đã trưởng thành');
  assert.ok(farm.eggs > 0 || farm.goldenEggs > 0, 'gà đã đẻ trứng');

  // 6. Nhặt trứng vào Giỏ Tre
  w.handle(id, { t: 'coop_collect' });
  assert.ok((life.bag.trung_ga ?? 0) > 0 || (life.bag.trung_hai_long ?? 0) > 0, 'trứng vào Giỏ Tre');
  assert.equal(farm.eggs, 0);

  // 7. Giả lập sinh phân gà và dọn chuồng
  farm.manure = 2;
  w.handle(id, { t: 'coop_clean' });
  assert.equal(farm.manure, 0);
  assert.equal(life.bag.phan_ga, 2, 'dọn được 2 phân chuồng');
});

test('thăm vườn kiểu Avatar: thăm vườn bạn, tưới nước & bắt sâu giúp bạn được thưởng, thả tim & lời chúc', () => {
  let now = DAY;
  const w = new World({ rnd: seeded(), mapId: 'vuon_nha', now: () => now });

  // Người chơi chủ vườn (Chủ)
  const idChu = w.addPlayer(World.newProfile('t_chu', 'Bác Ba', 'warrior'));
  const pChu = w.debugPlayer(idChu)!;
  const farmChu = pChu.prof.life!.farm!;
  // Chuẩn bị ô đất đang trồng và bị sâu
  farmChu.plots[0].state = 'planted';
  farmChu.plots[0].crop = 'giong_te';
  farmChu.plots[0].progress = 0.5;
  farmChu.plots[0].pest = true;
  farmChu.plots[0].waterUntil = 0; // khô nước

  // Người chơi khách ghé thăm (Khách)
  const idKhach = w.addPlayer(World.newProfile('t_khach', 'Bé Tư', 'archer'));
  const pKhach = w.debugPlayer(idKhach)!;

  // 1. Khách gửi tin nhắn thăm vườn Bác Ba
  w.handle(idKhach, { t: 'farm_visit', name: 'Bác Ba' });
  const visitMsg = w.outbox.find((o) => o.to === idKhach && o.msg.t === 'farm_visit');
  assert.ok(visitMsg, 'nhận được thông tin nông trại của bạn');
  assert.equal((visitMsg.msg as any).farm.ownerName, 'Bác Ba');
  assert.equal((visitMsg.msg as any).farm.plots[0].pest, true);

  // 2. Khách tưới nước giúp Bác Ba
  const gold0 = pKhach.prof.gold;
  const xp0 = pKhach.prof.life!.xp.farm ?? 0;
  w.handle(idKhach, { t: 'farm_water', plot: 0, target: 'Bác Ba' });
  assert.ok((farmChu.plots[0].waterUntil ?? 0) > now, 'ô đất của Bác Ba đã có nước');
  assert.ok(pKhach.prof.gold > gold0, 'khách nhận thưởng vàng khi tưới nước giúp bạn');
  assert.ok((pKhach.prof.life!.xp.farm ?? 0) > xp0, 'khách nhận XP Canh nông khi giúp đỡ');

  // 3. Khách bắt sâu giúp Bác Ba
  w.handle(idKhach, { t: 'farm_weed', plot: 0, target: 'Bác Ba' });
  assert.equal(farmChu.plots[0].pest, false, 'ô đất của Bác Ba đã sạch sâu');

  // 4. Khách thả tim & để lại lời chúc
  const likes0 = farmChu.likes ?? 0;
  w.handle(idKhach, { t: 'farm_cheer', target: 'Bác Ba', text: 'Chúc bác mùa màng bội thu!' });
  assert.equal(farmChu.likes, likes0 + 1, 'vườn được tăng 1 lượt thích');
  assert.equal(farmChu.cheers.length, 1);
  assert.equal(farmChu.cheers[0].by, 'Bé Tư');
  assert.equal(farmChu.cheers[0].text, 'Chúc bác mùa màng bội thu!');

  // 5. Khách quay về vườn của mình
  w.handle(idKhach, { t: 'farm_visit', name: '' });
  assert.equal(pKhach.visitingFarm, null);
});

test('món ăn dân gian mới: Trứng luộc nước dừa, Cơm nắm muối vừng, Xôi gà nếp cái hoa vàng', () => {
  const w = new World({ rnd: seeded(), mapId: 'vuon_nha', now: () => DAY });
  const id = w.addPlayer(World.newProfile('t', 'Đầu Bếp Quê', 'warrior'));
  const p = w.debugPlayer(id)!;
  const bag = p.prof.life!.bag;
  p.prof.life!.xp.cook = 100; // cấp 3 nghề Bếp

  // 1. Trứng luộc nước dừa
  bag.trung_ga = 1;
  tp(w, id, NPCS.tao.x, NPCS.tao.y + 20);
  w.handle(id, { t: 'cook', recipe: 'trung_luoc' });
  run(w, 2100);
  assert.equal(bag.trung_luoc, 1, 'nấu được trứng luộc nước dừa');

  // 2. Cơm nắm muối vừng
  bag.gao_te = 2;
  w.handle(id, { t: 'cook', recipe: 'com_nam' });
  run(w, 2100);
  assert.equal(bag.com_nam, 1, 'nấu được cơm nắm');

  // 3. Xôi gà nếp cái hoa vàng
  bag.gao_nep = 2;
  bag.thit_ga = 1;
  w.handle(id, { t: 'cook', recipe: 'xoi_ga' });
  run(w, 2100);
  assert.equal(bag.xoi_ga, 1, 'nấu được xôi gà');

  // Ăn Xôi gà buff Công +12%
  const atk0 = p.stats.atk;
  w.handle(id, { t: 'eat', key: 'xoi_ga' });
  assert.ok(p.stats.atk > atk0, 'ăn xôi gà tăng Công');
});



