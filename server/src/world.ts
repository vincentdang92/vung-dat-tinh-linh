// Mô phỏng thế giới game phía server — nơi DUY NHẤT quyết định di chuyển thật,
// sát thương, quái, rơi đồ, XP. Không phụ thuộc mạng: index.ts nối WebSocket vào,
// còn test gọi trực tiếp.

import {
  TICK_MS, PLAYER_RADIUS, PICKUP_RADIUS, LOOT_LOCK_MS, DROP_TTL_MS, RESPAWN_MS,
  OUT_OF_COMBAT_MS, INVENTORY_SIZE, MAX_LEVEL, DASH_CD, DASH_IFRAME_MS, POTION_CD,
  POTION_HEAL, xpToNext,
} from '../../shared/constants.ts';
import { buildMap, moveWithCollision, isSafe, shotBlocked, lineOfSight } from '../../shared/map.ts';
import type { GameMap, SpawnPoint } from '../../shared/map.ts';
import {
  CLASSES, WEAPONS, MONSTERS, BOSS_SLAM, statsFor, rollDamage, weaponsFor,
} from '../../shared/data.ts';
import type { ClassId, MonsterDef } from '../../shared/data.ts';
import { applyInput } from '../../shared/protocol.ts';
import type {
  ClientMsg, ServerMsg, InputMsg, GameEvent, InvItem, SelfState, PlayerSnap, MobSnap,
} from '../../shared/protocol.ts';
import { NPCS, QUESTS, SHOP_PRICES } from '../../shared/story.ts';

export interface Profile {
  token: string;
  name: string;
  cls: ClassId;
  level: number;
  xp: number;
  gold: number;
  inv: InvItem[];
  weapon: string;
  drumPieces?: number[];
  quests?: Record<string, number>;
  questProg?: Record<string, number>;
  title?: string;
}

type Stats = ReturnType<typeof statsFor>;

interface Player {
  id: number;
  prof: Profile;
  x: number; y: number; f: number;
  hp: number;
  stats: Stats;
  dead: boolean;
  respawnAt: number;
  queue: InputMsg[];
  bucket: number;
  ack: number;
  nextAtk: number;
  skillReady: number;
  dashReady: number;
  potionReady: number;
  iframeUntil: number;
  lastCombat: number;
  lastChat: number;
  msgCount: number;
  meDirty: boolean;
  saveDirty: boolean;
  personal: GameEvent[];
  nextUid: number;
  khi: number; // 0..100
  waterVortexUntil: number; // cho Thủy Long Quyển (Thủy Phù Quán)
  vortexCooldowns: Map<number, number>; // mobId -> timestamp
}

interface Mob {
  id: number;
  def: MonsterDef;
  spawn: SpawnPoint;
  x: number; y: number; f: number;
  hp: number;
  dead: boolean;
  respawnAt: number;
  state: 'idle' | 'chase' | 'return';
  target: number | null;
  nextAtk: number;
  wanderAt: number;
  wx: number; wy: number;
  dmgBy: Map<number, number>;
  castUntil: number;
  nextSlam: number;
  stunUntil: number;
  slowUntil: number;
  slowPct: number;
  taunted?: boolean;
}

interface Proj {
  id: number;
  k: 'arrow' | 'bolt';
  owner: number;
  atk: number;
  mult: number;
  aoe: number;
  x: number; y: number;
  speed: number;
  dx: number; dy: number;
  target: number | null;
  ttl: number;
}

interface Drop {
  id: number;
  key: string; // 'gold' | 'potion' | 'leaf' | mã vũ khí
  qty: number;
  x: number; y: number;
  owner: number | null;
  born: number;
}

interface Delayed { at: number; run: () => void }

export interface Outgoing { to: number | 'all'; msg: ServerMsg }

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export class World {
  readonly map: GameMap;
  t = 0;
  private nextId = 1;
  private rnd: () => number;
  players = new Map<number, Player>();
  mobs = new Map<number, Mob>();
  private projs = new Map<number, Proj>();
  private drops = new Map<number, Drop>();
  private delayed: Delayed[] = [];
  private events: GameEvent[] = [];
  outbox: Outgoing[] = [];
  onSave: (p: Profile) => void = () => {};

  constructor(opts: { rnd?: () => number } = {}) {
    this.rnd = opts.rnd ?? Math.random;
    this.map = buildMap();
    for (const sp of this.map.spawns) this.spawnMob(sp);
  }

  // ------------------------------------------------------------ người chơi

  static newProfile(token: string, name: string, cls: ClassId): Profile {
    return {
      token, name, cls, level: 1, xp: 0, gold: 0,
      inv: [{ uid: 1, key: 'potion', qty: 3 }],
      weapon: CLASSES[cls].starterWeapon,
      drumPieces: [],
      quests: { main1: 1 },
      questProg: {},
      title: '',
    };
  }

  addPlayer(prof: Profile): number {
    const id = this.nextId++;
    prof.drumPieces = prof.drumPieces ?? [];
    prof.quests = prof.quests ?? { main1: 1 };
    prof.questProg = prof.questProg ?? {};
    prof.title = prof.title ?? '';
    const stats = statsFor(prof.cls, prof.level, prof.weapon, prof.drumPieces.length);
    const sp = this.map.playerSpawn;
    const p: Player = {
      id, prof,
      x: sp.x + (this.rnd() - 0.5) * 40, y: sp.y, f: -Math.PI / 2,
      hp: stats.maxHp, stats, dead: false, respawnAt: 0,
      queue: [], bucket: 3, ack: 0,
      nextAtk: 0, skillReady: 0, dashReady: 0, potionReady: 0, iframeUntil: 0,
      lastCombat: -1e9, lastChat: -1e9, msgCount: 0,
      meDirty: true, saveDirty: false, personal: [],
      nextUid: Math.max(1, ...prof.inv.map((i) => i.uid)) + 1,
      khi: 0,
      waterVortexUntil: 0,
      vortexCooldowns: new Map(),
    };
    this.players.set(id, p);
    this.sys(`${prof.name} đã vào game`);
    return id;
  }

  removePlayer(id: number) {
    const p = this.players.get(id);
    if (!p) return;
    this.onSave(p.prof);
    this.players.delete(id);
    for (const m of this.mobs.values()) if (m.target === id) { m.target = null; m.state = 'return'; m.taunted = false; }
    this.sys(`${p.prof.name} đã rời game`);
  }

  /** Ghi các nhân vật có thay đổi (gọi định kỳ). */
  flushSaves() {
    for (const p of this.players.values()) {
      if (p.saveDirty) { p.saveDirty = false; this.onSave(p.prof); }
    }
  }

  handle(id: number, msg: ClientMsg) {
    const p = this.players.get(id);
    if (!p || !msg || typeof msg !== 'object') return;
    // chống spam: tối đa ~60 gói/giây, đếm lại mỗi giây trong tick()
    if (++p.msgCount > 60) return;

    switch (msg.t) {
      case 'in': {
        if (typeof msg.seq !== 'number') return;
        p.queue.push({ t: 'in', seq: msg.seq, x: +msg.x || 0, y: +msg.y || 0, dash: msg.dash ? 1 : undefined });
        if (p.queue.length > 10) p.queue.splice(0, p.queue.length - 10);
        break;
      }
      case 'skill': this.useSkill(p); break;
      case 'ult': this.useUltimate(p); break;
      case 'potion': this.usePotion(p); break;
      case 'equip': this.equip(p, msg.uid); break;
      case 'talk': this.handleTalk(p, msg.npcId); break;
      case 'buy': this.handleBuy(p, msg.item); break;
      case 'sell': this.handleSell(p, msg.uid); break;
      case 'chat': {
        const text = String(msg.text ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
        if (!text || this.t - p.lastChat < 800) return;
        p.lastChat = this.t;
        this.outbox.push({ to: 'all', msg: { t: 'chat', from: p.prof.name, text } });
        break;
      }
    }
  }

  private sys(text: string) { this.events.push({ e: 'sys', text }); }
  private tell(p: Player, text: string) { p.personal.push({ e: 'sys', text }); }

  recalc(p: Player) {
    const ratio = p.hp / p.stats.maxHp;
    p.stats = statsFor(p.prof.cls, p.prof.level, p.prof.weapon, p.prof.drumPieces?.length ?? 0);
    p.hp = Math.min(p.stats.maxHp, Math.max(1, ratio * p.stats.maxHp));
    p.meDirty = true;
  }

  private gainXp(p: Player, amount: number) {
    p.prof.xp += amount;
    while (p.prof.level < MAX_LEVEL && p.prof.xp >= xpToNext(p.prof.level)) {
      p.prof.xp -= xpToNext(p.prof.level);
      p.prof.level++;
      this.recalc(p);
      p.hp = p.stats.maxHp;
      this.events.push({ e: 'lvl', id: p.id, lv: p.prof.level });
      this.tell(p, `Lên cấp ${p.prof.level}!`);
    }
    if (p.prof.level >= MAX_LEVEL) p.prof.xp = 0;
    p.meDirty = true; p.saveDirty = true;
  }

  private useSkill(p: Player) {
    if (p.dead || this.t < p.skillReady || isSafe(this.map, p.x, p.y)) return;
    const cls = CLASSES[p.prof.cls];
    p.skillReady = this.t + cls.skill.cd;
    p.meDirty = true;
    p.lastCombat = this.t;

    if (p.prof.cls === 'warrior') {
      const r = 78;
      this.events.push({ e: 'fx', k: 'whirl', x: p.x, y: p.y, r });
      for (const m of this.mobs.values()) {
        if (!m.dead && dist(p.x, p.y, m.x, m.y) <= r + m.def.radius) this.hitMob(m, p.id, p.stats.atk, 1.8);
      }
    } else if (p.prof.cls === 'archer') {
      const tgt = this.nearestMob(p.x, p.y, 280);
      const base = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : p.f;
      this.events.push({ e: 'fx', k: 'volley', x: p.x, y: p.y, r: 0 });
      for (let i = -2; i <= 2; i++) {
        const a = base + i * 0.17;
        this.spawnProj(p, 'arrow', Math.cos(a), Math.sin(a), null, 0.9, 0, 300);
      }
    } else {
      const tgt = this.nearestMob(p.x, p.y, 240, false);
      const tx = tgt ? tgt.x : p.x + Math.cos(p.f) * 120;
      const ty = tgt ? tgt.y : p.y + Math.sin(p.f) * 120;
      const r = 72, delay = 600, atk = p.stats.atk, owner = p.id;
      this.events.push({ e: 'fx', k: 'meteor', x: tx, y: ty, r, ms: delay });
      this.later(delay, () => {
        this.events.push({ e: 'fx', k: 'boom', x: tx, y: ty, r });
        for (const m of this.mobs.values()) {
          if (!m.dead && dist(tx, ty, m.x, m.y) <= r + m.def.radius) this.hitMob(m, owner, atk, 2.5);
        }
      });
    }
  }

  private useUltimate(p: Player) {
    if (p.dead || p.khi < 100 || isSafe(this.map, p.x, p.y)) return;
    p.khi = 0;
    p.meDirty = true;
    p.lastCombat = this.t;

    if (p.prof.cls === 'warrior') {
      // Phù Đổng Thiên Vương: nện đất 300% vùng 110px, choáng quái 1.2s
      const r = 110, delay = 300, atk = p.stats.atk, owner = p.id;
      const cx = p.x, cy = p.y;
      this.events.push({ e: 'fx', k: 'ult_warrior', x: cx, y: cy, r, ms: delay });
      this.later(delay, () => {
        this.events.push({ e: 'fx', k: 'boom', x: cx, y: cy, r });
        for (const m of this.mobs.values()) {
          if (!m.dead && dist(cx, cy, m.x, m.y) <= r + m.def.radius) {
            m.stunUntil = Math.max(m.stunUntil, this.t + 1200);
            this.hitMob(m, owner, atk, 3.0);
          }
        }
      });
    } else if (p.prof.cls === 'archer') {
      // Nỏ Thần Kim Quy: mưa tên vàng 3 giây (mỗi 0.25s gây 60%), vùng 90px
      const tgt = this.nearestMob(p.x, p.y, 300, false);
      const tx = tgt ? tgt.x : p.x + Math.cos(p.f) * 150;
      const ty = tgt ? tgt.y : p.y + Math.sin(p.f) * 150;
      const r = 90, atk = p.stats.atk, owner = p.id;
      this.events.push({ e: 'fx', k: 'ult_archer', x: tx, y: ty, r, ms: 3000 });
      for (let i = 1; i <= 12; i++) {
        this.later(i * 250, () => {
          for (const m of this.mobs.values()) {
            if (!m.dead && dist(tx, ty, m.x, m.y) <= r + m.def.radius) {
              this.hitMob(m, owner, atk, 0.6);
            }
          }
        });
      }
    } else {
      // Thủy Long Quyển: 6 giọt nước xoay quanh người 4s, chạm gây 80% và làm chậm 40%
      p.waterVortexUntil = this.t + 4000;
      p.vortexCooldowns.clear();
      this.events.push({ e: 'fx', k: 'ult_mage', x: p.x, y: p.y, r: 70, ms: 4000 });
    }
  }

  private usePotion(p: Player) {
    if (p.dead || this.t < p.potionReady || p.hp >= p.stats.maxHp) return;
    const slot = p.prof.inv.find((i) => i.key === 'potion' && i.qty > 0);
    if (!slot) { this.tell(p, 'Hết bình máu'); return; }
    slot.qty--;
    if (slot.qty <= 0) p.prof.inv = p.prof.inv.filter((i) => i !== slot);
    const v = Math.round(p.stats.maxHp * POTION_HEAL);
    p.hp = Math.min(p.stats.maxHp, p.hp + v);
    p.potionReady = this.t + POTION_CD;
    this.events.push({ e: 'heal', id: p.id, v });
    p.meDirty = true; p.saveDirty = true;
  }

  private equip(p: Player, uid: number) {
    const item = p.prof.inv.find((i) => i.uid === uid);
    const w = item && WEAPONS[item.key];
    if (!item || !w || w.cls !== p.prof.cls) return;
    const old = p.prof.weapon;
    p.prof.inv = p.prof.inv.filter((i) => i !== item);
    p.prof.inv.push({ uid: p.nextUid++, key: old, qty: 1 });
    p.prof.weapon = w.key;
    this.recalc(p);
    this.tell(p, `Đã trang bị ${w.name}`);
    p.saveDirty = true;
  }

  // ------------------------------------------------------------ NPC & Nhiệm vụ & Cửa hàng

  private handleTalk(p: Player, npcId: string) {
    const npc = NPCS[npcId];
    if (!npc || dist(p.x, p.y, npc.x, npc.y) > 75) return;

    p.prof.quests = p.prof.quests ?? { main1: 1 };
    p.prof.questProg = p.prof.questProg ?? {};

    if (npcId === 'tao') {
      const q = p.prof.quests.main1 ?? 1;
      const prog = p.prof.questProg;
      const def = QUESTS.main1.steps[q] ?? QUESTS.main1.steps[1];

      if (q === 1) {
        this.dialogue(p, npcId, 'Ông Táo', def.dialogue, q, true);
      } else if (q === 2) {
        const kills = prog.main1 ?? 0;
        if (kills >= 8) {
          this.dialogue(p, npcId, 'Ông Táo', def.dialogue, q, true);
          if (def.reward?.xp) this.gainXp(p, def.reward.xp);
          if (def.reward?.potion) {
            const slot = p.prof.inv.find((i) => i.key === 'potion');
            if (slot) slot.qty += def.reward.potion;
            else if (p.prof.inv.length < INVENTORY_SIZE) p.prof.inv.push({ uid: p.nextUid++, key: 'potion', qty: def.reward.potion });
          }
          p.prof.quests.main1 = 3; // chuyển sang nhặt Lá Đa Cổ
          this.tell(p, 'Nhận thưởng: +40 XP, +2 Bình máu!');
          p.meDirty = true; p.saveDirty = true;
        } else {
          this.dialogue(p, npcId, 'Ông Táo', [`Con đã diệt được ${kills}/8 Bánh Trôi Tinh. Cố gắng dọn sạch bìa rừng nhé!`], q, false);
        }
      } else if (q === 3) {
        const leaves = prog.main1_leaf ?? 0;
        if (leaves >= 3) {
          this.dialogue(p, npcId, 'Ông Táo', def.dialogue, q, true);
          if (def.reward?.xp) this.gainXp(p, def.reward.xp);
          if (def.reward?.gold) p.prof.gold += def.reward.gold;
          p.prof.quests.main1 = 4; // chuyển sang đánh boss
          this.tell(p, 'Nhận thưởng: +80 XP, +30 Vàng!');
          p.meDirty = true; p.saveDirty = true;
        } else {
          this.dialogue(p, npcId, 'Ông Táo', [`Con hãy thu thập đủ 3 Lá Đa Cổ từ Cáo Tinh (hiện có ${leaves}/3).`], q, false);
        }
      } else if (q === 4) {
        const hasDrum = p.prof.drumPieces?.includes(1);
        if (hasDrum) {
          const finalStep = QUESTS.main1.steps[5];
          this.dialogue(p, npcId, 'Ông Táo', finalStep.dialogue, 5, true);
          if (finalStep.reward?.xp) this.gainXp(p, finalStep.reward.xp);
          if (finalStep.reward?.title) p.prof.title = finalStep.reward.title;
          if (finalStep.reward?.weaponReward) {
            const pool = weaponsFor(p.prof.cls, 'rare');
            if (pool.length && p.prof.inv.length < INVENTORY_SIZE) {
              p.prof.inv.push({ uid: p.nextUid++, key: pool[0].key, qty: 1 });
              this.tell(p, `Nhận thưởng vũ khí: ${pool[0].name}!`);
            }
          }
          p.prof.quests.main1 = 5;
          this.tell(p, 'Chúc mừng hoàn thành chuỗi nhiệm vụ Bếp Lửa Đình Làng!');
          p.meDirty = true; p.saveDirty = true;
        } else {
          this.dialogue(p, npcId, 'Ông Táo', ['Chúa Mộc Tinh đang ở Gốc Đa Cổ phía trên rừng. Hãy cùng đồng đội tiêu diệt hắn đoạt lại Trống Đồng!'], q, false);
        }
      } else {
        this.dialogue(p, npcId, 'Ông Táo', ['Cảm ơn con, Người Giữ Trống! Nhờ con mà làng ta luôn bình yên ấm no.'], 5, false);
      }
    } else if (npcId === 'cuoi') {
      const q = p.prof.quests.cuoi1 ?? 1;
      const def = QUESTS.cuoi1.steps[q] ?? QUESTS.cuoi1.steps[1];
      if (q === 1) {
        this.dialogue(p, npcId, 'Chú Cuội', def.dialogue, q, true);
      } else if (q === 2) {
        this.dialogue(p, npcId, 'Chú Cuội', def.dialogue, q, true);
        if (def.reward?.potion) {
          const slot = p.prof.inv.find((i) => i.key === 'potion');
          if (slot) slot.qty += def.reward.potion;
          else if (p.prof.inv.length < INVENTORY_SIZE) p.prof.inv.push({ uid: p.nextUid++, key: 'potion', qty: def.reward.potion });
        }
        if (def.reward?.xp) this.gainXp(p, def.reward.xp);
        p.prof.quests.cuoi1 = 3;
        this.tell(p, 'Nhận thưởng từ Cuội: +1 Bình máu, +25 XP!');
        p.meDirty = true; p.saveDirty = true;
      } else {
        this.dialogue(p, npcId, 'Chú Cuội', ['Cuội đang ngồi ngắm trăng với cây đa đây, vui lắm bạn ơi!'], 3, false);
      }
    } else if (npcId === 'nuoc') {
      this.dialogue(p, npcId, 'Bà Hàng Nước', [
        'Uống bát nước chè xanh mát lành nhé con ơi!',
        'Bà có bán bình máu bồi bổ (10 vàng) và thu mua vũ khí cũ giá tốt.',
      ], 1, false);
    }
  }

  private dialogue(p: Player, npcId: string, title: string, lines: string[], step: number, canAdvance = false) {
    this.outbox.push({
      to: p.id,
      msg: { t: 'npc_dialogue', npcId, title, lines, step, canAdvance },
    });
  }

  private handleBuy(p: Player, item: string) {
    if (dist(p.x, p.y, NPCS.nuoc.x, NPCS.nuoc.y) > 85) { this.tell(p, 'Hãy lại gần Bà Hàng Nước'); return; }
    if (item === 'potion') {
      const price = SHOP_PRICES.buyPotion;
      if (p.prof.gold < price) { this.tell(p, 'Không đủ vàng'); return; }
      const slot = p.prof.inv.find((i) => i.key === 'potion');
      if (!slot && p.prof.inv.length >= INVENTORY_SIZE) { this.tell(p, 'Túi đồ đầy'); return; }

      p.prof.gold -= price;
      if (slot) slot.qty++;
      else p.prof.inv.push({ uid: p.nextUid++, key: 'potion', qty: 1 });
      p.meDirty = true; p.saveDirty = true;
      this.tell(p, 'Đã mua 1 Bình máu (-10 vàng)');
    }
  }

  private handleSell(p: Player, uid: number) {
    if (dist(p.x, p.y, NPCS.nuoc.x, NPCS.nuoc.y) > 85) { this.tell(p, 'Hãy lại gần Bà Hàng Nước'); return; }
    const item = p.prof.inv.find((i) => i.uid === uid);
    if (!item) return;
    const w = WEAPONS[item.key];
    if (!w) { this.tell(p, 'Chỉ có thể bán vũ khí'); return; }
    if (p.prof.weapon === item.key) { this.tell(p, 'Không thể bán vũ khí đang trang bị'); return; }

    const price = SHOP_PRICES.sellWeapon[w.rarity] ?? 5;
    p.prof.inv = p.prof.inv.filter((i) => i.uid !== uid);
    p.prof.gold += price;
    p.meDirty = true; p.saveDirty = true;
    this.tell(p, `Đã bán ${w.name} (+${price} vàng)`);
  }

  // ------------------------------------------------------------ quái

  private spawnMob(sp: SpawnPoint, existing?: Mob) {
    const def = MONSTERS[sp.kind];
    const m: Mob = existing ?? {
      id: this.nextId++, def, spawn: sp, x: 0, y: 0, f: 0, hp: 0, dead: false, respawnAt: 0,
      state: 'idle', target: null, nextAtk: 0, wanderAt: 0, wx: sp.x, wy: sp.y,
      dmgBy: new Map(), castUntil: 0, nextSlam: 0,
      stunUntil: 0, slowUntil: 0, slowPct: 0,
    };
    m.x = sp.x; m.y = sp.y; m.hp = def.hp; m.dead = false; m.state = 'idle'; m.target = null;
    m.dmgBy.clear(); m.wx = sp.x; m.wy = sp.y; m.castUntil = 0;
    m.stunUntil = 0; m.slowUntil = 0; m.slowPct = 0; m.taunted = false;
    this.mobs.set(m.id, m);
  }

  private nearestMob(x: number, y: number, maxD: number, needSight = true): Mob | null {
    let best: Mob | null = null, bd = maxD;
    for (const m of this.mobs.values()) {
      if (m.dead) continue;
      const d = dist(x, y, m.x, m.y) - m.def.radius;
      if (d > bd) continue;
      if (needSight && d > 40 && !lineOfSight(this.map, x, y, m.x, m.y)) continue;
      bd = d; best = m;
    }
    return best;
  }

  private hitMob(m: Mob, attackerId: number, atk: number, mult: number) {
    if (m.dead) return;
    const { v, crit } = rollDamage(atk, mult, m.def.def, this.rnd);
    m.hp -= v;
    m.dmgBy.set(attackerId, (m.dmgBy.get(attackerId) ?? 0) + v);
    this.events.push(crit ? { e: 'dmg', id: m.id, v, crit: 1, mob: 1 } : { e: 'dmg', id: m.id, v, mob: 1 });

    const attacker = this.players.get(attackerId);
    if (attacker) {
      attacker.lastCombat = this.t;
      if (attacker.khi < 100) {
        attacker.khi = Math.min(100, attacker.khi + 2); // +2 Khí khi gây sát thương
        attacker.meDirty = true;
      }
    }

    if (m.state === 'idle' && attacker && !attacker.dead) {
      m.state = 'chase'; m.target = attackerId;
      if (m.def.kind === 'boss' && !m.taunted) {
        m.taunted = true;
        this.sys(`${m.def.name}: "Trống là của ta! Cút về làng mà ăn bánh trôi đi!"`);
      }
    }
    if (m.hp <= 0) this.killMob(m);
  }

  private killMob(m: Mob) {
    m.dead = true;
    m.hp = 0;
    m.respawnAt = this.t + m.def.respawnMs;
    m.taunted = false;
    this.events.push({ e: 'die', id: m.id, mob: 1 });

    // XP cho mọi người đã đánh và còn ở gần (co-op), chủ đồ là người gây nhiều dmg nhất
    let top: Player | null = null, topDmg = -1;
    for (const [pid, dmg] of m.dmgBy) {
      const p = this.players.get(pid);
      if (!p) continue;
      if (dist(p.x, p.y, m.x, m.y) < 500 && !p.dead) this.gainXp(p, m.def.xp);
      if (dmg > topDmg) { topDmg = dmg; top = p; }
    }
    if (m.def.kind === 'boss') {
      this.sys(`${m.def.name}: "Ối... thôi trả, trả mảnh trống đây..."`);
      this.sys(`${m.def.name} đã bị hạ gục${top ? ` bởi ${top.prof.name}` : ''}!`);
    }

    const owner = top?.id ?? null;
    const scatter = () => (this.rnd() - 0.5) * 30;
    const [g0, g1] = m.def.gold;
    this.addDrop('gold', g0 + Math.floor(this.rnd() * (g1 - g0 + 1)), m.x + scatter(), m.y + scatter(), owner);
    if (this.rnd() < m.def.drops.potion) this.addDrop('potion', 1, m.x + scatter(), m.y + scatter(), owner);
    if (top) {
      for (const rarity of ['rare', 'epic'] as const) {
        if (this.rnd() < m.def.drops[rarity]) {
          const pool = weaponsFor(top.prof.cls, rarity);
          if (pool.length) {
            const w = pool[Math.floor(this.rnd() * pool.length)];
            this.addDrop(w.key, 1, m.x + scatter(), m.y + scatter(), owner);
          }
        }
      }
    }

    // Đếm tiến độ nhiệm vụ cho người tham gia hạ quái
    for (const pid of m.dmgBy.keys()) {
      const p = this.players.get(pid);
      if (!p) continue;
      p.prof.quests = p.prof.quests ?? { main1: 1 };
      p.prof.questProg = p.prof.questProg ?? {};

      if (m.def.kind === 'slime') {
        if (p.prof.quests.main1 === 1) {
          const cur = (p.prof.questProg.main1 ?? 0) + 1;
          p.prof.questProg.main1 = cur;
          this.tell(p, `Diệt Bánh Trôi Tinh (${cur}/8)`);
          if (cur >= 8) {
            p.prof.quests.main1 = 2;
            this.tell(p, 'Đã diệt đủ 8 Bánh Trôi Tinh! Hãy về báo với Ông Táo.');
          }
          p.meDirty = true; p.saveDirty = true;
        }
        if (p.prof.quests.cuoi1 === 1) {
          p.prof.quests.cuoi1 = 2;
          this.tell(p, 'Đã tìm thấy "con trâu" Bánh Trôi Tinh của Cuội! Hãy về gặp Cuội.');
          p.meDirty = true; p.saveDirty = true;
        }
      } else if (m.def.kind === 'wolf') {
        if (p.prof.quests.main1 === 2 || p.prof.quests.main1 === 3) {
          if (this.rnd() < 0.35) {
            this.addDrop('leaf', 1, m.x + scatter(), m.y + scatter(), p.id);
          }
        }
      } else if (m.def.kind === 'boss') {
        p.prof.drumPieces = p.prof.drumPieces ?? [];
        if (!p.prof.drumPieces.includes(1)) {
          p.prof.drumPieces.push(1);
          this.recalc(p);
          this.tell(p, 'Bạn đã đoạt lại Mảnh Trống Đồng 1 (+5% máu tối đa)!');
        }
        if (p.prof.quests.main1 === 3 || p.prof.quests.main1 === 4) {
          p.prof.quests.main1 = 4;
          this.tell(p, 'Đã hạ Chúa Mộc Tinh! Hãy mang Mảnh Trống Đồng về cho Ông Táo.');
        }
        p.meDirty = true; p.saveDirty = true;
      }
    }
  }

  private addDrop(key: string, qty: number, x: number, y: number, owner: number | null) {
    const id = this.nextId++;
    this.drops.set(id, { id, key, qty, x, y, owner, born: this.t });
  }

  private hitPlayer(p: Player, atk: number, mult: number) {
    if (p.dead || this.t < p.iframeUntil || isSafe(this.map, p.x, p.y)) return;
    const { v, crit } = rollDamage(atk, mult, p.stats.def, this.rnd);
    p.hp -= v;
    p.lastCombat = this.t;
    if (p.khi < 100) {
      p.khi = Math.min(100, p.khi + 3); // +3 Khí khi nhận sát thương
    }
    p.meDirty = true;
    this.events.push(crit ? { e: 'dmg', id: p.id, v, crit: 1 } : { e: 'dmg', id: p.id, v });
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      p.khi = 0; // Chết về 0
      p.respawnAt = this.t + RESPAWN_MS;
      p.queue.length = 0;
      this.events.push({ e: 'die', id: p.id });
      this.tell(p, 'Bạn đã gục ngã! Sẽ hồi sinh ở Làng sau 4s.');
    }
  }

  private moveMob(m: Mob, tx: number, ty: number, speed: number) {
    const effSpeed = this.t < m.slowUntil ? speed * (1 - m.slowPct) : speed;
    const dx = tx - m.x, dy = ty - m.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) return;
    const dt = TICK_MS / 1000;
    const step = Math.min(d, effSpeed * dt);
    const p = moveWithCollision(this.map, m.x, m.y, (dx / d) * step, (dy / d) * step, m.def.radius);
    m.x = p.x; m.y = p.y;
    m.f = Math.atan2(dy, dx);
  }

  private updateMob(m: Mob) {
    const t = this.t;
    if (m.dead) {
      if (t >= m.respawnAt) this.spawnMob(m.spawn, m);
      return;
    }
    if (t < m.stunUntil) return; // Đang bị choáng bởi Phù Đổng Thiên Vương!
    if (t < m.castUntil) return; // boss đang vung đòn

    const d = m.def;
    const home = dist(m.x, m.y, m.spawn.x, m.spawn.y);

    if (m.state === 'idle') {
      let best: Player | null = null, bd = d.aggro;
      for (const p of this.players.values()) {
        if (p.dead || isSafe(this.map, p.x, p.y)) continue;
        const pd = dist(p.x, p.y, m.x, m.y);
        if (pd < bd) { bd = pd; best = p; }
      }
      if (best) {
        m.state = 'chase'; m.target = best.id;
        if (d.kind === 'boss' && !m.taunted) {
          m.taunted = true;
          this.sys(`${m.def.name}: "Trống là của ta! Cút về làng mà ăn bánh trôi đi!"`);
        }
      } else {
        if (t >= m.wanderAt) {
          m.wanderAt = t + 2000 + this.rnd() * 2500;
          m.wx = m.spawn.x + (this.rnd() - 0.5) * 80;
          m.wy = m.spawn.y + (this.rnd() - 0.5) * 80;
        }
        this.moveMob(m, m.wx, m.wy, d.speed * 0.4);
        return;
      }
    }

    if (m.state === 'chase') {
      const p = m.target != null ? this.players.get(m.target) : undefined;
      if (!p || p.dead || isSafe(this.map, p.x, p.y) || home > d.leash) {
        m.state = 'return'; m.target = null; m.taunted = false;
      } else {
        if (d.kind === 'boss') {
          if (m.nextSlam < t - BOSS_SLAM.every) m.nextSlam = t + 2500;
          if (t >= m.nextSlam) {
            m.nextSlam = t + BOSS_SLAM.every;
            m.castUntil = t + BOSS_SLAM.telegraphMs;
            const cx = m.x, cy = m.y, r = BOSS_SLAM.radius, atk = d.atk;
            this.events.push({ e: 'fx', k: 'slam', x: cx, y: cy, r, ms: BOSS_SLAM.telegraphMs });
            this.later(BOSS_SLAM.telegraphMs, () => {
              if (m.dead) return;
              this.events.push({ e: 'fx', k: 'boom', x: cx, y: cy, r });
              for (const q of this.players.values()) {
                if (dist(q.x, q.y, cx, cy) <= r + PLAYER_RADIUS) this.hitPlayer(q, atk, BOSS_SLAM.mult);
              }
            });
            return;
          }
        }
        const pd = dist(p.x, p.y, m.x, m.y);
        const reach = d.atkRange + d.radius + PLAYER_RADIUS;
        if (pd > reach * 0.85) {
          this.moveMob(m, p.x, p.y, d.speed);
        } else {
          m.f = Math.atan2(p.y - m.y, p.x - m.x);
        }
        if (pd <= reach && t >= m.nextAtk) {
          m.nextAtk = t + d.atkCd;
          this.events.push({ e: 'atk', id: m.id, tx: p.x, ty: p.y });
          this.hitPlayer(p, d.atk, 1);
        }
        return;
      }
    }

    // return: chạy về và hồi máu
    this.moveMob(m, m.spawn.x, m.spawn.y, d.speed * 1.4);
    m.hp = Math.min(d.hp, m.hp + d.hp * 0.05);
    if (dist(m.x, m.y, m.spawn.x, m.spawn.y) < 8) {
      m.state = 'idle'; m.hp = d.hp; m.dmgBy.clear();
    }
  }

  // ------------------------------------------------------------ đạn

  private spawnProj(
    p: Player, attack: 'arrow' | 'bolt', dx: number, dy: number,
    targetMobId: number | null, mult: number, aoe: number, maxDist: number,
  ) {
    const id = this.nextId++;
    const speed = p.stats.shotSpeed || 360;
    this.projs.set(id, {
      id, k: attack, owner: p.id, atk: p.stats.atk, mult, aoe,
      x: p.x, y: p.y, speed, dx, dy, target: targetMobId,
      ttl: Math.round((maxDist / speed) * 1000),
    });
  }

  private explode(pr: Proj, x: number, y: number) {
    this.events.push({ e: 'fx', k: 'boom', x, y, r: pr.aoe });
    for (const m of this.mobs.values()) {
      if (m.dead) continue;
      if (dist(x, y, m.x, m.y) <= pr.aoe + m.def.radius) this.hitMob(m, pr.owner, pr.atk, pr.mult);
    }
  }

  private updateProj(pr: Proj) {
    const dt = TICK_MS / 1000;
    if (pr.target != null) {
      const m = this.mobs.get(pr.target);
      if (m && !m.dead) {
        const d = dist(pr.x, pr.y, m.x, m.y);
        if (d > 0.001) { pr.dx = (m.x - pr.x) / d; pr.dy = (m.y - pr.y) / d; }
      }
    }

    const steps = 2;
    for (let s = 0; s < steps; s++) {
      pr.x += (pr.dx * pr.speed * dt) / steps;
      pr.y += (pr.dy * pr.speed * dt) / steps;
      if (shotBlocked(this.map, pr.x, pr.y)) {
        if (pr.aoe > 0) this.explode(pr, pr.x, pr.y);
        this.projs.delete(pr.id);
        return;
      }
      for (const m of this.mobs.values()) {
        if (m.dead || dist(pr.x, pr.y, m.x, m.y) > m.def.radius + 5) continue;
        if (pr.aoe > 0) this.explode(pr, pr.x, pr.y);
        else this.hitMob(m, pr.owner, pr.atk, pr.mult);
        this.projs.delete(pr.id);
        return;
      }
    }
    pr.ttl -= TICK_MS;
    if (pr.ttl <= 0) this.projs.delete(pr.id);
  }

  // ------------------------------------------------------------ vòng lặp

  private later(ms: number, run: () => void) { this.delayed.push({ at: this.t + ms, run }); }

  tick() {
    this.t += TICK_MS;
    const t = this.t;
    const dtS = TICK_MS / 1000;
    const resetCount = Math.floor(t / 1000) !== Math.floor((t - TICK_MS) / 1000);

    for (const p of this.players.values()) {
      if (resetCount) p.msgCount = 0;

      // 1) Input: token bucket => tối đa 1 gói/tick trung bình (chống speedhack)
      p.bucket = Math.min(3, p.bucket + 1);
      while (p.bucket >= 1 && p.queue.length) {
        const inp = p.queue.shift()!;
        p.bucket--;
        p.ack = Math.max(p.ack, inp.seq);
        if (p.dead) continue;
        const canDash = t >= p.dashReady;
        if (applyInput(this.map, p, inp, p.stats.speed, canDash)) {
          p.dashReady = t + DASH_CD;
          p.iframeUntil = t + DASH_IFRAME_MS;
          p.meDirty = true;
        }
      }

      // 2) Hồi sinh
      if (p.dead) {
        if (t >= p.respawnAt) {
          p.dead = false;
          p.hp = p.stats.maxHp;
          p.x = this.map.playerSpawn.x; p.y = this.map.playerSpawn.y;
          p.queue.length = 0;
        }
        continue;
      }

      // 3) Hồi máu: ngoài combat chậm, cạnh giếng làng nhanh
      const fo = this.map.fountain;
      let regen = 0;
      if (dist(p.x, p.y, fo.x, fo.y) < fo.r) regen = 0.15;
      else if (t - p.lastCombat > OUT_OF_COMBAT_MS) regen = 0.02;
      if (regen && p.hp < p.stats.maxHp) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * regen * dtS);

      // 4) Tự đánh thường mục tiêu gần nhất trong tầm
      if (t >= p.nextAtk && !isSafe(this.map, p.x, p.y)) {
        const m = this.nearestMob(p.x, p.y, p.stats.range);
        if (m) {
          p.nextAtk = t + p.stats.atkCd;
          p.f = Math.atan2(m.y - p.y, m.x - p.x);
          this.events.push({ e: 'atk', id: p.id, tx: m.x, ty: m.y });
          const cls = CLASSES[p.prof.cls];
          if (cls.attack === 'melee') this.hitMob(m, p.id, p.stats.atk, 1);
          else {
            const d = dist(p.x, p.y, m.x, m.y) || 1;
            this.spawnProj(p, cls.attack, (m.x - p.x) / d, (m.y - p.y) / d, m.id, 1, p.stats.aoe, p.stats.range + 60);
          }
        }
      }

      // 5) Thủy Long Quyển (nếu đang kích hoạt)
      if (p.waterVortexUntil > t) {
        const r = 70;
        for (const m of this.mobs.values()) {
          if (m.dead || dist(p.x, p.y, m.x, m.y) > r + m.def.radius) continue;
          const lastHit = p.vortexCooldowns.get(m.id) ?? 0;
          if (t - lastHit >= 500) {
            p.vortexCooldowns.set(m.id, t);
            m.slowUntil = Math.max(m.slowUntil, t + 1500);
            m.slowPct = 0.4;
            this.hitMob(m, p.id, p.stats.atk, 0.8);
          }
        }
      }
    }

    for (const pr of [...this.projs.values()]) this.updateProj(pr);
    for (const m of this.mobs.values()) this.updateMob(m);

    // hiệu ứng trễ (thiên thạch, đòn đập boss, bí kíp)
    if (this.delayed.length) {
      const due = this.delayed.filter((d) => d.at <= t);
      this.delayed = this.delayed.filter((d) => d.at > t);
      for (const d of due) d.run();
    }

    // nhặt đồ + đồ hết hạn
    for (const dr of [...this.drops.values()]) {
      if (t - dr.born > DROP_TTL_MS) { this.drops.delete(dr.id); continue; }
      for (const p of this.players.values()) {
        if (p.dead || dist(p.x, p.y, dr.x, dr.y) > PICKUP_RADIUS) continue;
        if (this.tryPickup(p, dr)) { this.drops.delete(dr.id); break; }
      }
    }
  }

  private tryPickup(p: Player, dr: Drop): boolean {
    if (dr.owner != null && dr.owner !== p.id && this.t - dr.born < LOOT_LOCK_MS) return false;
    if (dr.key === 'gold') {
      p.prof.gold += dr.qty;
      p.meDirty = true; p.saveDirty = true;
      return true;
    }
    if (dr.key === 'potion') {
      const slot = p.prof.inv.find((i) => i.key === 'potion');
      if (slot) slot.qty += dr.qty;
      else if (p.prof.inv.length < INVENTORY_SIZE) p.prof.inv.push({ uid: p.nextUid++, key: 'potion', qty: dr.qty });
      else return false;
      p.meDirty = true; p.saveDirty = true;
      return true;
    }
    if (dr.key === 'leaf') {
      const prog = p.prof.questProg ?? (p.prof.questProg = {});
      const cur = (prog.main1_leaf ?? 0) + dr.qty;
      prog.main1_leaf = cur;
      this.tell(p, `Nhặt được Lá Đa Cổ (${cur}/3)`);
      if (cur >= 3 && p.prof.quests?.main1 === 2) {
        p.prof.quests.main1 = 3;
        this.tell(p, 'Đã thu thập đủ 3 Lá Đa Cổ! Hãy về gặp Ông Táo.');
      }
      p.meDirty = true; p.saveDirty = true;
      return true;
    }
    const w = WEAPONS[dr.key];
    if (!w || w.cls !== p.prof.cls) return false;
    if (p.prof.inv.length >= INVENTORY_SIZE) { this.tell(p, 'Túi đồ đầy'); return false; }
    const uid = p.nextUid++;
    p.prof.inv.push({ uid, key: w.key, qty: 1 });
    this.tell(p, `Nhặt được ${w.name}`);
    if (w.atk > (WEAPONS[p.prof.weapon]?.atk ?? 0)) this.equip(p, uid);
    p.meDirty = true; p.saveDirty = true;
    return true;
  }

  // ------------------------------------------------------------ gửi đi

  selfState(p: Player): SelfState {
    const t = this.t;
    return {
      lv: p.prof.level, xp: p.prof.xp, next: xpToNext(p.prof.level), gold: p.prof.gold,
      inv: p.prof.inv.map((i) => ({ ...i })), weapon: p.prof.weapon,
      stats: { maxHp: p.stats.maxHp, atk: p.stats.atk, def: p.stats.def, range: p.stats.range },
      cd: {
        skill: Math.max(0, p.skillReady - t),
        dash: Math.max(0, p.dashReady - t),
        potion: Math.max(0, p.potionReady - t),
      },
      skillCd: CLASSES[p.prof.cls].skill.cd,
      khi: Math.round(p.khi),
      drumPieces: p.prof.drumPieces ?? [],
      quests: p.prof.quests ?? { main1: 1 },
      questProg: p.prof.questProg ?? {},
      title: p.prof.title ?? '',
    };
  }

  /** Tạo snapshot cho từng người chơi rồi xoá hàng đợi sự kiện. */
  buildSnapshots(): Outgoing[] {
    const ps: PlayerSnap[] = [...this.players.values()].map((p) => ({
      id: p.id, n: p.prof.name, c: p.prof.cls, x: Math.round(p.x), y: Math.round(p.y),
      f: Math.round(p.f * 100) / 100, hp: Math.ceil(p.hp), mh: p.stats.maxHp, lv: p.prof.level,
      dead: p.dead ? 1 : 0, w: p.prof.weapon,
    }));
    const ms: MobSnap[] = [];
    for (const m of this.mobs.values()) {
      if (m.dead) continue;
      const stun = this.t < m.stunUntil ? (1 as const) : undefined;
      const slow = this.t < m.slowUntil ? (1 as const) : undefined;
      ms.push({
        id: m.id, k: m.def.kind, x: Math.round(m.x), y: Math.round(m.y),
        hp: Math.ceil(m.hp), mh: m.def.hp, f: Math.round(m.f * 100) / 100,
        stun, slow,
      });
    }
    const pr = [...this.projs.values()].map((q) => ({ id: q.id, k: q.k, x: Math.round(q.x), y: Math.round(q.y) }));
    const d = [...this.drops.values()].map((q) => {
      const w = WEAPONS[q.key];
      return w ? { id: q.id, k: q.key, x: Math.round(q.x), y: Math.round(q.y), r: w.rarity } : { id: q.id, k: q.key, x: Math.round(q.x), y: Math.round(q.y) };
    });

    const out: Outgoing[] = [];
    for (const p of this.players.values()) {
      out.push({ to: p.id, msg: { t: 'snap', st: this.t, ack: p.ack, p: ps, m: ms, pr, d, ev: [...this.events, ...p.personal] } });
      p.personal = [];
      if (p.meDirty) {
        p.meDirty = false;
        out.push({ to: p.id, msg: { t: 'me', ...this.selfState(p) } });
      }
    }
    this.events = [];
    return out;
  }

  // dùng cho test
  debugPlayer(id: number) { return this.players.get(id); }
  get dropCount() { return this.drops.size; }
}
