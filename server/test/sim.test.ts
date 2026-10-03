// Test mô phỏng không cần mạng: node --experimental-strip-types --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { collides, MAP_W, MAP_H, tileAt, blocksMove } from '../../shared/map.ts';
import { TILE, PLAYER_RADIUS } from '../../shared/constants.ts';
import { NPCS, SHOP_PRICES } from '../../shared/story.ts';
import type { ServerMsg } from '../../shared/protocol.ts';

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
