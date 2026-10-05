// Nhiều bản đồ + cổng (Giai đoạn 3A): Realm gom các World, chuyển người chơi qua cổng.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../src/realm.ts';
import { World } from '../src/world.ts';
import { buildMap, collides, MAP_W, MAP_H, tileAt, blocksMove, T, portalAt } from '../../shared/map.ts';
import type { GameMap } from '../../shared/map.ts';
import { TILE, PLAYER_RADIUS } from '../../shared/constants.ts';
import { NPCS } from '../../shared/story.ts';

function seeded(seed = 7) {
  let a = seed;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}
const mk = () => new Realm({ rnd: seeded() });
const run = (r: Realm, ms: number) => { for (let i = 0; i < ms / 50; i++) r.tick(); };
const playerOf = (r: Realm, id: number) => r.world(r.mapOf(id)!).debugPlayer(id)!;

/** Tập ô đi bộ tới được từ điểm hồi sinh. */
function reachable(map: GameMap) {
  const seen = new Uint8Array(MAP_W * MAP_H);
  const sx = Math.floor(map.playerSpawn.x / TILE), sy = Math.floor(map.playerSpawn.y / TILE);
  const q = [[sx, sy]];
  seen[sy * MAP_W + sx] = 1;
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || seen[ny * MAP_W + nx]) continue;
      if (blocksMove(tileAt(map, nx, ny))) continue;
      seen[ny * MAP_W + nx] = 1; q.push([nx, ny]);
    }
  }
  return (tx: number, ty: number) => seen[ty * MAP_W + tx] === 1;
}

/** Đi sang phải/trái (dx = ±1) cho tới khi qua cổng (đổi bản đồ) hoặc hết số tick. */
function walk(r: Realm, id: number, dx: number, ticks: number, seq: { n: number }) {
  const from = r.mapOf(id);
  for (let i = 0; i < ticks && r.mapOf(id) === from; i++) {
    r.handle(id, { t: 'in', seq: ++seq.n, x: dx, y: 0 });
    r.tick();
  }
}

test('bản đồ Đầm Sen: hồi sinh không kẹt, đi tới được cổng, 2 cây cầu và Vực Thuồng Luồng', () => {
  const m = buildMap('dam_sen');
  assert.equal(collides(m, m.playerSpawn.x, m.playerSpawn.y, PLAYER_RADIUS), false);
  const ok = reachable(m);
  assert.ok(ok(0, 49), 'cổng về Làng Tre');
  assert.ok(ok(16, 5), 'giữa Vực Thuồng Luồng');
  assert.ok(ok(15, 18), 'cầu giữa qua Sông Ma');
  assert.ok(ok(26, 18) || ok(27, 18), 'cầu đông qua Sông Ma');
  assert.equal(tileAt(m, 16, 10), T.BRIDGE, 'cầu vào vực');
  // điểm đến của cổng không nằm trong cổng (tránh bị đẩy qua lại)
  const back = buildMap('lang_tre').portals[0];
  assert.equal(portalAt(m, back.tx, back.ty), null);
  assert.equal(collides(m, back.tx, back.ty, PLAYER_RADIUS), false);
});

test('bản đồ Làng Tre: cổng đông tới được, điểm đến ở Làng Tre không kẹt', () => {
  const m = buildMap('lang_tre');
  assert.ok(reachable(m)(MAP_W - 1, 49), 'cổng sang Đầm Sen');
  const fromDamSen = buildMap('dam_sen').portals[0];
  assert.equal(portalAt(m, fromDamSen.tx, fromDamSen.ty), null);
  assert.equal(collides(m, fromDamSen.tx, fromDamSen.ty, PLAYER_RADIUS), false);
});

test('cổng khoá khi chưa xong nhiệm vụ Bếp Lửa Đình Làng', () => {
  const r = mk();
  const { id } = r.addPlayer(World.newProfile('a', 'A', 'warrior'));
  const p = playerOf(r, id);
  p.x = 29 * TILE + 16; p.y = 49 * TILE + 16;
  walk(r, id, 1, 30, { n: 0 });
  assert.equal(r.mapOf(id), 'lang_tre');
  const msgs = r.buildSnapshots().filter((o) => o.to === id && o.msg.t === 'snap')
    .flatMap((o) => (o.msg.t === 'snap' ? o.msg.ev : []));
  assert.ok(msgs.some((e) => e.e === 'sys' && e.text.includes('Cổng còn khoá')), 'phải báo cổng khoá');
});

test('qua cổng sang Đầm Sen rồi về lại: giữ máu, Khí, hồi chiêu; báo client đổi bản đồ', () => {
  const r = mk();
  const prof = World.newProfile('b', 'B', 'archer');
  prof.quests = { main1: 5 };
  const { id } = r.addPlayer(prof);
  const p = playerOf(r, id);
  p.hp = 50; p.khi = 70;
  p.x = 29 * TILE + 16; p.y = 49 * TILE + 16;
  const seq = { n: 0 };
  walk(r, id, 1, 30, seq);
  assert.equal(r.mapOf(id), 'dam_sen');
  assert.equal(prof.mapId, 'dam_sen');
  const q = playerOf(r, id);
  assert.equal(q, p, 'cùng một đối tượng người chơi');
  assert.equal(q.khi, 70);
  assert.ok(q.hp >= 50 && q.hp <= q.stats.maxHp);
  assert.ok(Math.abs(q.x - buildMap('lang_tre').portals[0].tx) < 60, 'đứng gần điểm đến');
  const out = r.drainOutbox();
  assert.ok(out.some((o) => o.to === id && o.msg.t === 'map' && o.msg.map === 'dam_sen'), 'gửi tin map');
  assert.equal(r.world('lang_tre').players.has(id), false);

  // đứng yên ở điểm đến thì không bị đẩy về
  run(r, 2000);
  assert.equal(r.mapOf(id), 'dam_sen');

  // đi ngược về phía tây qua cổng Bến Đò thì về Làng Tre
  walk(r, id, -1, 40, seq);
  assert.equal(r.mapOf(id), 'lang_tre');
  assert.equal(prof.mapId, 'lang_tre');
});

test('người ở 2 bản đồ không thấy nhau trong snapshot; id không trùng', () => {
  const r = mk();
  const a = r.addPlayer(World.newProfile('c', 'C', 'mage'));
  const pd = World.newProfile('d', 'D', 'mage');
  pd.mapId = 'dam_sen';
  const b = r.addPlayer(pd);
  assert.equal(b.map, 'dam_sen');
  assert.notEqual(a.id, b.id);
  // id người chơi không trùng id quái ở Làng Tre
  assert.equal(r.world('lang_tre').mobs.has(b.id), false);
  r.tick(); r.tick();
  const snaps = r.buildSnapshots().filter((o) => o.msg.t === 'snap');
  for (const o of snaps) {
    if (o.msg.t !== 'snap') continue;
    const ids = o.msg.p.map((x) => x.id);
    assert.deepEqual(ids, [o.to], `người ${o.to} chỉ thấy chính mình`);
  }
});

test('vào lại game: xuất hiện ở vùng an toàn của bản đồ đã lưu; mã bản đồ lạ thì về Làng Tre', () => {
  const r = mk();
  const pd = World.newProfile('e', 'E', 'warrior');
  pd.mapId = 'dam_sen';
  const { id } = r.addPlayer(pd);
  const p = playerOf(r, id);
  const sp = buildMap('dam_sen').playerSpawn;
  assert.ok(Math.abs(p.x - sp.x) <= 20 && p.y === sp.y);

  const bad = World.newProfile('f', 'F', 'warrior');
  (bad as { mapId?: string }).mapId = 'hack_map';
  assert.equal(r.addPlayer(bad).map, 'lang_tre');
});

test('NPC Làng Tre không nói chuyện được từ Đầm Sen (dù đứng đúng toạ độ)', () => {
  const r = mk();
  const pd = World.newProfile('g', 'G', 'warrior');
  pd.mapId = 'dam_sen';
  const { id } = r.addPlayer(pd);
  const p = playerOf(r, id);
  p.x = NPCS.tao.x; p.y = NPCS.tao.y;
  r.handle(id, { t: 'talk', npcId: 'tao' });
  r.handle(id, { t: 'buy', item: 'potion' });
  assert.equal(r.drainOutbox().filter((o) => o.msg.t === 'npc_dialogue').length, 0);
});
