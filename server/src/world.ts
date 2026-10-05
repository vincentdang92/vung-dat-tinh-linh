// Mô phỏng thế giới game phía server — nơi DUY NHẤT quyết định di chuyển thật,
// sát thương, quái, rơi đồ, XP. Không phụ thuộc mạng: index.ts nối WebSocket vào,
// còn test gọi trực tiếp.

import {
  TICK_MS, PLAYER_RADIUS, PICKUP_RADIUS, LOOT_LOCK_MS, DROP_TTL_MS, RESPAWN_MS,
  OUT_OF_COMBAT_MS, INVENTORY_SIZE, MAX_LEVEL, DASH_CD, DASH_IFRAME_MS, POTION_CD,
  POTION_HEAL, xpToNext,
} from '../../shared/constants.ts';
import { buildMap, moveWithCollision, isSafe, shotBlocked, lineOfSight, portalAt, MAP_NAMES } from '../../shared/map.ts';
import type { GameMap, SpawnPoint, MapId } from '../../shared/map.ts';
import {
  CLASSES, WEAPONS, MONSTERS, BOSS_SLAM, BOSS_SERPENT, statsFor, rollDamage, weaponsFor,
  CLASS_SKILL_TREES, PASSIVE_SKILLS, normalizeSkills,
} from '../../shared/data.ts';
import type { ClassId, MonsterDef, SkillData } from '../../shared/data.ts';
import { applyInput } from '../../shared/protocol.ts';
import type {
  ClientMsg, ServerMsg, InputMsg, GameEvent, InvItem, SelfState, PlayerSnap, MobSnap, FireSnap,
} from '../../shared/protocol.ts';
import { NPCS, QUESTS, SHOP_PRICES, TRIVIA_QUESTIONS } from '../../shared/story.ts';
import {
  LIFE_ITEMS, FOODS, RECIPES, FISH, FISH_XP, COOK_MS, COOK_RANGE, CAMPFIRE_MS, EAT_CD, COOK_SOCIAL_MULT,
  CUI_PRICE, SELL_DAILY_CAP, LIFE_SKILL_NAMES, applyFoodBuff, bagAdd, bagCanAdd, bagCount, bagTake,
  pickIngredients, fishSpotAt, rollFish, tugsFor, isNight, vnDay, lifeLevel, normalizeLife, unitSellPrice,
  CRITTER_LOOT, CATCH_NAME, HUNT, BAY_PRICE, rollTrap, trapSpotOk,
  FARM, FOLK_CHEERS, defaultFarm, updateFarmPlots, updateFarmChickens,
  CO_MO_SHOP, getTodayMarketEvent, getMarketSellPrice,
} from '../../shared/life.ts';
import type { FishSpot, LifeData, LifeSkill, CropKind, FarmData, FarmVisitSelf } from '../../shared/life.ts';
import { TRIVIA_ANSWERS, TRIVIA_REWARD } from './trivia.ts';
import type { MarketManager } from './market.ts';

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
  mapId?: MapId; // bản đồ đang đứng, vào lại game sẽ xuất hiện ở vùng an toàn của bản đồ này
  life?: LifeData; // Nghề Sống: cấp nghề, Giỏ Tre, buff ăn uống
  skills?: SkillData; // Võ học & Kỹ năng
}

type Stats = ReturnType<typeof statsFor>;

/** Đang câu cá (không lưu: thoát game/qua cổng là thu cần). */
interface FishState {
  spot: FishSpot;
  bx: number; by: number; // vị trí phao
  px: number; py: number; // chỗ ngồi câu: rời chỗ là thu cần
  castAt: number;
  catchKey: string; // loài đã quay sẵn lúc thả câu
  need: number; // số lần phải giật trúng
  hits: number;
  biteAt: number;
  bitten: boolean;
  social: boolean;
}

export interface Player {
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
  portalReadyAt: number; // vừa qua cổng thì chờ một chút mới cho qua tiếp
  portalMsgAt: number; // chống lặp thông báo "cổng còn khoá"
  slowUntil: number; // làm chậm khi trúng đòn Ma Da
  fish: FishState | null;
  cooking: { recipe: string; doneAt: number; x: number; y: number; social: boolean } | null;
  eatReady: number;
  khiAcc: number; // tích luỹ Khí lẻ từ buff Cá kho tộ
  visitingFarm: string | null;
  stall: { open: boolean; name: string } | null;
}

/** Yêu cầu chuyển người chơi sang bản đồ khác (Realm xử lý sau mỗi tick). */
export interface Transfer { id: number; to: MapId; x: number; y: number }

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
  shellUntil?: number; // Cua Đá khép càng
  nextShell?: number;
  submerged?: boolean; // Ma Da lặn
  nextSweep?: number; // Thuồng Luồng quẫy đuôi
  nextWave?: number;  // Thuồng Luồng sóng dữ
  fleeUntil?: number; // thú hiền: vừa bị đánh thì chạy tiếp một lúc
  runSince?: number;  // thú hiền: bắt đầu chạy từ lúc nào (chạy lâu thì đuối sức)
  restUntil?: number; // thú hiền: đang thở dốc, đứng yên
}

interface Proj {
  id: number;
  k: 'arrow' | 'bolt' | 'fireball';
  owner: number;
  isMob?: boolean;
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
  readonly mapId: MapId;
  t = 0;
  private nextId = 1;
  private ids: () => number;
  private rnd: () => number;
  /** Đồng hồ thật (ms) cho mốc lưu lâu dài: buff ăn uống, ngày bán hàng, câu đố mỗi ngày. */
  private now: () => number;
  players = new Map<number, Player>();
  mobs = new Map<number, Mob>();
  private projs = new Map<number, Proj>();
  private drops = new Map<number, Drop>();
  private fires = new Map<number, { id: number; x: number; y: number; until: number; owner: number }>();
  private delayed: Delayed[] = [];
  private events: GameEvent[] = [];
  private transfers: Transfer[] = [];
  outbox: Outgoing[] = [];
  onSave: (p: Profile) => void = () => {};
  onFindTargetFarm?: (name: string) => { player?: Player; farm: FarmData; farmLv: number; markDirty: () => void } | null;
  onGetOnlineFarmers?: () => { name: string; farmLv: number; likes: number }[];
  market?: MarketManager;
  onFindPlayerByToken?: (token: string) => Player | undefined;

  /**
   * Mỗi bản đồ một World. `ids` dùng chung giữa các World (Realm cấp) để id người chơi,
   * quái, đạn không trùng nhau khi người chơi đi qua cổng.
   */
  constructor(opts: {
    rnd?: () => number;
    mapId?: MapId;
    ids?: () => number;
    now?: () => number;
    market?: MarketManager;
    onFindPlayerByToken?: (token: string) => Player | undefined;
    onFindTargetFarm?: (name: string) => { player?: Player; farm: FarmData; farmLv: number; markDirty: () => void } | null;
    onGetOnlineFarmers?: () => { name: string; farmLv: number; likes: number }[];
  } = {}) {
    this.rnd = opts.rnd ?? Math.random;
    this.ids = opts.ids ?? (() => this.nextId++);
    this.now = opts.now ?? Date.now;
    this.mapId = opts.mapId ?? 'lang_tre';
    this.market = opts.market;
    this.onFindPlayerByToken = opts.onFindPlayerByToken;
    this.onFindTargetFarm = opts.onFindTargetFarm;
    this.onGetOnlineFarmers = opts.onGetOnlineFarmers;
    this.map = buildMap(this.mapId);
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
      mapId: 'lang_tre',
      life: { xp: {}, bag: {} },
    };
  }

  addPlayer(prof: Profile): number {
    const id = this.ids();
    prof.drumPieces = prof.drumPieces ?? [];
    prof.quests = prof.quests ?? { main1: 1 };
    prof.questProg = prof.questProg ?? {};
    prof.title = prof.title ?? '';
    prof.mapId = this.mapId;
    prof.life = normalizeLife(prof.life);
    prof.skills = normalizeSkills(prof.skills, prof.level);
    const stats = this.computeStats(prof);
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
      portalReadyAt: 0,
      portalMsgAt: -1e9,
      slowUntil: 0,
      fish: null,
      cooking: null,
      eatReady: 0,
      khiAcc: 0,
      visitingFarm: null,
      stall: null,
    };
    this.players.set(id, p);
    this.sys(`${prof.name} đã vào game`);
    return id;
  }

  removePlayer(id: number) {
    const p = this.players.get(id);
    if (!p) return;
    this.onSave(p.prof);
    this.forget(id);
    this.sys(`${p.prof.name} đã rời game`);
  }

  /** Bỏ người chơi khỏi bản đồ này (quái đang đuổi thì quay về). */
  private forget(id: number) {
    this.players.delete(id);
    for (const m of this.mobs.values()) if (m.target === id) { m.target = null; m.state = 'return'; m.taunted = false; }
  }

  /** Tách người chơi ra để chuyển sang bản đồ khác (giữ nguyên máu, Khí, hồi chiêu). */
  detachPlayer(id: number): Player | null {
    const p = this.players.get(id);
    if (!p) return null;
    this.forget(id);
    return p;
  }

  /**
   * Nhận người chơi từ bản đồ khác, đặt ở (x, y). Mốc thời gian hồi chiêu tính theo đồng hồ
   * của từng World, nên dời theo độ lệch đồng hồ để không mất hay được thêm thời gian hồi.
   */
  attachPlayer(p: Player, x: number, y: number, fromT: number) {
    const dt = this.t - fromT;
    if (dt !== 0) {
      p.skillReady += dt; p.dashReady += dt; p.potionReady += dt; p.iframeUntil += dt;
      p.nextAtk += dt; p.lastCombat += dt; p.lastChat += dt; p.respawnAt += dt; p.waterVortexUntil += dt;
      p.slowUntil += dt; p.eatReady += dt;
    }
    // qua cổng là thu cần, bỏ dở nồi đang nấu, gập sạp hàng
    p.fish = null;
    p.cooking = null;
    p.stall = null;
    p.x = x; p.y = y;
    p.queue.length = 0;
    p.vortexCooldowns.clear();
    p.portalReadyAt = this.t + 1500;
    p.prof.mapId = this.mapId;
    p.meDirty = true; p.saveDirty = true;
    this.players.set(p.id, p);
    this.tell(p, `Đã đến ${MAP_NAMES[this.mapId]}`);
  }

  /** Lấy các yêu cầu qua cổng phát sinh trong tick vừa rồi. */
  takeTransfers(): Transfer[] {
    const t = this.transfers;
    this.transfers = [];
    return t;
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
      case 'skill_upgrade': this.handleSkillUpgrade(p, msg.skill); break;
      case 'skill_reset': this.handleSkillReset(p); break;
      case 'talk': this.handleTalk(p, msg.npcId); break;
      case 'buy': this.handleBuy(p, msg.item); break;
      case 'sell': this.handleSell(p, msg.uid); break;
      case 'trivia': this.handleTrivia(p, msg.qId, msg.choice); break;
      case 'fish_cast': this.fishCast(p); break;
      case 'fish_reel': this.fishReel(p); break;
      case 'cook': this.cookStart(p, String(msg.recipe)); break;
      case 'eat': this.eat(p, String(msg.key)); break;
      case 'sell_bag': this.sellBag(p, String(msg.key), Math.floor(Number(msg.qty))); break;
      case 'bag_drop': this.bagDrop(p, String(msg.key)); break;
      case 'campfire': this.lightFire(p); break;
      case 'trap_set': this.trapSet(p); break;
      case 'trap_take': this.trapTake(p, Number(msg.id), !!msg.force); break;
      case 'farm_plow': this.farmPlow(p, Number(msg.plot)); break;
      case 'farm_plant': this.farmPlant(p, Number(msg.plot), msg.crop); break;
      case 'farm_water': this.farmWater(p, Number(msg.plot), msg.target); break;
      case 'farm_weed': this.farmWeed(p, Number(msg.plot), msg.target); break;
      case 'farm_fertilize': this.farmFertilize(p, Number(msg.plot)); break;
      case 'farm_harvest': this.farmHarvest(p, Number(msg.plot)); break;
      case 'farm_mill': this.farmMill(p, msg.crop); break;
      case 'coop_add': this.coopAdd(p); break;
      case 'coop_feed': this.coopFeed(p, msg.item); break;
      case 'coop_collect': this.coopCollect(p); break;
      case 'coop_clean': this.coopClean(p); break;
      case 'farm_visit': this.farmVisit(p, String(msg.name ?? '')); break;
      case 'farm_cheer': this.farmCheer(p, String(msg.target ?? ''), String(msg.text ?? '')); break;
      // ---- Chợ Phiên & Giao Thương ----
      case 'market_get': this.marketGet(p); break;
      case 'market_sell': this.marketSell(p, String(msg.key), Math.floor(Number(msg.qty)), Math.floor(Number(msg.unitPrice))); break;
      case 'market_buy': this.marketBuy(p, String(msg.id), Math.floor(Number(msg.qty))); break;
      case 'market_cancel': this.marketCancel(p, String(msg.id)); break;
      case 'market_claim': this.marketClaim(p); break;
      case 'npc_market_buy': this.npcMarketBuy(p, String(msg.key), Math.floor(Number(msg.qty ?? 1))); break;
      case 'stall_set': this.stallSet(p, Boolean(msg.open), msg.name ? String(msg.name).slice(0, 30) : undefined); break;
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

  /** Chỉ số = cấp + vũ khí + mảnh trống + tranh Đông Hồ + tâm pháp võ học + buff ăn uống (còn hạn). */
  private computeStats(prof: Profile): Stats {
    const s = statsFor(prof.cls, prof.level, prof.weapon, prof.drumPieces?.length ?? 0, prof.questProg, prof.skills?.passives);
    const b = prof.life?.buff;
    return applyFoodBuff(s, b && b.until > this.now() ? b.key : undefined);
  }

  recalc(p: Player) {
    const ratio = p.hp / p.stats.maxHp;
    p.stats = this.computeStats(p.prof);
    p.hp = Math.min(p.stats.maxHp, Math.max(1, ratio * p.stats.maxHp));
    p.meDirty = true;
  }

  /** Đố vui: mỗi câu chỉ trả lời 1 lần/ngày (giờ Việt Nam); đáp án chỉ gửi về sau khi trả lời. */
  private handleTrivia(p: Player, qId: number, choice: number) {
    if (!this.nearNpc(p, 'nuoc', 90)) {
      this.tell(p, 'Hãy lại gần Bà Hàng Nước');
      return;
    }
    const q = TRIVIA_QUESTIONS.find((x) => x.id === qId);
    const a = TRIVIA_ANSWERS[qId];
    if (!q || !a || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return;
    const life = this.life(p);
    const day = vnDay(this.now());
    if (!life.trivia || life.trivia.day !== day) life.trivia = { day, done: [] };
    const repeat = life.trivia.done.includes(qId);
    const ok = choice === a.ans;
    this.outbox.push({ to: p.id, msg: { t: 'trivia_result', qId, ok, ans: a.ans, exp: a.exp, ...(repeat ? { repeat: 1 as const } : {}) } });
    if (repeat) return;
    life.trivia.done.push(qId);
    p.meDirty = true; p.saveDirty = true;
    if (ok) {
      this.gainXp(p, TRIVIA_REWARD.xp);
      p.prof.gold += TRIVIA_REWARD.gold;
      p.khi = 100;
      p.prof.questProg = p.prof.questProg ?? {};
      p.prof.questProg.trivia_correct = (p.prof.questProg.trivia_correct ?? 0) + 1;
      this.sys(`${p.prof.name} vừa giải đúng một câu đố dân gian ở quán nước!`); // không lộ đáp án
    }
  }

  // ------------------------------------------------------------ Nghề Sống: câu cá, nấu nướng

  private life(p: Player): LifeData {
    const l = p.prof.life ?? (p.prof.life = normalizeLife(undefined));
    if (!l.farm) l.farm = defaultFarm();
    return l;
  }
  private farm(p: Player): FarmData { return this.life(p).farm ?? (this.life(p).farm = defaultFarm()); }

  private findTargetFarm(name: string): { player?: Player; farm: FarmData; farmLv: number; markDirty: () => void } | null {
    if (this.onFindTargetFarm) {
      const res = this.onFindTargetFarm(name);
      if (res && res.farm) return res;
    }
    const lower = name.toLowerCase();
    for (const p of this.players.values()) {
      if (p.prof.name.toLowerCase() === lower) {
        const farm = this.farm(p);
        return {
          player: p,
          farm,
          farmLv: this.lifeLv(p, 'farm'),
          markDirty: () => { p.meDirty = true; p.saveDirty = true; },
        };
      }
    }
    return null;
  }

  private lifeLv(p: Player, s: LifeSkill) { return lifeLevel(this.life(p).xp[s] ?? 0); }

  private gainLifeXp(p: Player, s: LifeSkill, amount: number) {
    const life = this.life(p);
    const before = lifeLevel(life.xp[s] ?? 0);
    life.xp[s] = (life.xp[s] ?? 0) + Math.max(1, Math.round(amount));
    const after = lifeLevel(life.xp[s]);
    if (after > before) {
      this.tell(p, `Nghề ${LIFE_SKILL_NAMES[s]} lên cấp ${after}!`);
      this.events.push({ e: 'fx', k: 'ripple', x: p.x, y: p.y, r: 40, ms: 700 });
    }
    p.meDirty = true; p.saveDirty = true;
  }

  private fishMsg(p: Player, m: Omit<Extract<ServerMsg, { t: 'fish' }>, 't'>) {
    this.outbox.push({ to: p.id, msg: { t: 'fish', ...m } });
  }

  private othersNear(p: Player, r: number, pred: (o: Player) => boolean = () => true) {
    for (const o of this.players.values()) if (o !== p && !o.dead && dist(o.x, o.y, p.x, p.y) <= r && pred(o)) return true;
    return false;
  }

  private fishCast(p: Player) {
    if (p.dead || p.fish || p.cooking) return;
    if (this.t - p.lastCombat < FISH.calmMs) { this.tell(p, 'Đang giao tranh, chưa ngồi câu được'); return; }
    const sp = fishSpotAt(this.map, p.x, p.y, PLAYER_RADIUS);
    if (!sp) { this.tell(p, 'Hãy đứng sát mép nước để thả câu'); return; }
    const lv = this.lifeLv(p, 'fish');
    // Ngồi câu cùng bạn: cá cắn nhanh hơn. Dùng Cần Trúc Ngà: cắn nhanh hơn 35%
    const social = this.othersNear(p, FISH.socialR, (o) => !!o.fish);
    const hasTrucRod = bagCount(this.life(p).bag, 'can_cau_truc') > 0;
    const rodMult = hasTrucRod ? 0.65 : 1;
    const delay = (FISH.biteMin + this.rnd() * (FISH.biteMax - FISH.biteMin)) * (social ? FISH.socialMult : 1) * (1 - 0.02 * (lv - 1)) * rodMult;
    const catchKey = rollFish(sp.spot, lv, isNight(this.now()), this.rnd);
    p.fish = {
      spot: sp.spot, bx: sp.x, by: sp.y, px: p.x, py: p.y, castAt: this.t,
      catchKey, need: tugsFor(catchKey), hits: 0, biteAt: this.t + delay, bitten: false, social,
    };
    p.f = Math.atan2(sp.y - p.y, sp.x - p.x);
    this.events.push({ e: 'fx', k: 'splash', x: sp.x, y: sp.y, r: 10 });
    this.fishMsg(p, social ? { s: 'cast', social: 1 } : { s: 'cast' });
  }

  private fishReel(p: Player) {
    const fs = p.fish;
    if (!fs) return;
    if (!fs.bitten) {
      p.fish = null;
      this.fishMsg(p, { s: 'early' });
      return;
    }
    if (this.t > fs.biteAt + FISH.window(this.lifeLv(p, 'fish')) + FISH.lag) {
      p.fish = null;
      this.fishMsg(p, { s: 'miss' });
      return;
    }
    fs.hits++;
    if (fs.hits < fs.need) {
      // cá to còn vùng vẫy: phải giật tiếp
      fs.bitten = false;
      fs.biteAt = this.t + FISH.tugMin + this.rnd() * (FISH.tugMax - FISH.tugMin);
      this.fishMsg(p, { s: 'cast', n: fs.need - fs.hits });
      return;
    }
    this.fishLand(p, fs);
  }

  private fishLand(p: Player, fs: FishState) {
    p.fish = null;
    const key = fs.catchKey;
    const item = LIFE_ITEMS[key];
    const life = this.life(p);
    if (!bagCanAdd(life.bag, key, 1)) {
      this.fishMsg(p, { s: 'full', key });
      return;
    }
    bagAdd(life.bag, key, 1);
    let kg: number | undefined;
    if (item.kg) {
      kg = Math.round((item.kg[0] + this.rnd() ** 2 * (item.kg[1] - item.kg[0])) * 100) / 100;
      if (!life.best || kg > life.best.kg) life.best = { key, kg };
    }
    this.gainLifeXp(p, 'fish', FISH_XP[item.kind === 'fish' ? item.tier ?? 'common' : 'junk']);
    this.events.push({ e: 'fx', k: 'splash', x: fs.bx, y: fs.by, r: 18 });
    this.fishMsg(p, kg != null ? { s: 'catch', key, kg } : { s: 'catch', key });
    if (item.tier === 'rare' || item.tier === 'legend') {
      this.sys(`${p.prof.name} vừa câu được ${item.name}${kg != null ? ` nặng ${kg}kg` : ''}!`);
    }
    p.meDirty = true; p.saveDirty = true;
  }

  /** Mỗi tick: phao chìm, cá sổng, rời chỗ / bị đánh là thu cần. */
  private updateFishing(p: Player) {
    const fs = p.fish!;
    if (p.dead || dist(p.x, p.y, fs.px, fs.py) > 6 || p.lastCombat > fs.castAt) {
      p.fish = null;
      this.fishMsg(p, { s: 'cancel' });
      return;
    }
    if (!fs.bitten && this.t >= fs.biteAt) {
      fs.bitten = true;
      this.fishMsg(p, { s: 'bite', n: fs.need - fs.hits });
      this.events.push({ e: 'fx', k: 'splash', x: fs.bx, y: fs.by, r: 14 });
    } else if (fs.bitten && this.t > fs.biteAt + FISH.window(this.lifeLv(p, 'fish')) + FISH.lag) {
      p.fish = null;
      this.fishMsg(p, { s: 'miss' });
    }
  }

  /** Bếp Ông Táo (nấu được mọi món) hoặc bếp nhà tranh ở Vườn Nhà hoặc lửa trại (chỉ nướng). */
  private cookPlace(p: Player): 'bep' | 'fire' | null {
    if (this.nearNpc(p, 'tao', COOK_RANGE + 20)) return 'bep';
    if (this.mapId === 'vuon_nha' && Math.hypot(p.x - 17.5 * 32, p.y - 45 * 32) <= 300) return 'bep';
    for (const f of this.fires.values()) if (dist(p.x, p.y, f.x, f.y) <= COOK_RANGE) return 'fire';
    return null;
  }

  private cookStart(p: Player, key: string) {
    const r = RECIPES[key];
    if (!r || p.dead || p.cooking || p.fish) return;
    const where = this.cookPlace(p);
    if (!where) { this.tell(p, 'Cần đứng cạnh Bếp Ông Táo ở đình làng hoặc một đống lửa trại'); return; }
    if (r.fire === 'bep' && where !== 'bep') { this.tell(p, `${r.name} cần nồi niêu ở Bếp Ông Táo`); return; }
    if (this.lifeLv(p, 'cook') < r.minLv) { this.tell(p, `Cần nghề Nấu nướng cấp ${r.minLv}`); return; }
    if (this.t - p.lastCombat < 2000) { this.tell(p, 'Đang giao tranh, chưa nấu được'); return; }
    const bag = this.life(p).bag;
    const use = pickIngredients(bag, r);
    if (!use) { this.tell(p, `Thiếu nguyên liệu cho ${r.name}`); return; }
    const after = { ...bag };
    for (const [k, q] of Object.entries(use)) bagTake(after, k, q);
    if (!bagCanAdd(after, r.key, 1)) { this.tell(p, 'Giỏ Tre đầy'); return; }
    const social = this.othersNear(p, FISH.socialR);
    p.cooking = { recipe: key, doneAt: this.t + COOK_MS, x: p.x, y: p.y, social };
    this.outbox.push({ to: p.id, msg: { t: 'cook', s: 'start', recipe: key, ms: COOK_MS } });
  }

  private updateCooking(p: Player) {
    const c = p.cooking!;
    const cancel = () => {
      p.cooking = null;
      this.outbox.push({ to: p.id, msg: { t: 'cook', s: 'cancel', recipe: c.recipe } });
    };
    if (p.dead || dist(p.x, p.y, c.x, c.y) > 6 || p.lastCombat > c.doneAt - COOK_MS) { cancel(); return; }
    if (this.t < c.doneAt) return;
    const r = RECIPES[c.recipe];
    const bag = this.life(p).bag;
    const use = pickIngredients(bag, r); // trong lúc nấu có thể đã bán/ăn bớt
    if (!use) { cancel(); return; }
    for (const [k, q] of Object.entries(use)) bagTake(bag, k, q);
    bagAdd(bag, r.key, 1);
    p.cooking = null;
    this.gainLifeXp(p, 'cook', r.xp * (c.social ? COOK_SOCIAL_MULT : 1));
    this.outbox.push({ to: p.id, msg: { t: 'cook', s: 'done', recipe: r.key } });
    this.tell(p, `Nấu xong ${r.name}${c.social ? ' (quây quần bên bếp lửa: +50% kinh nghiệm)' : ''}!`);
    p.meDirty = true; p.saveDirty = true;
  }

  private eat(p: Player, key: string) {
    const food = FOODS[key];
    const life = this.life(p);
    if (!food || p.dead || this.t < p.eatReady || bagCount(life.bag, key) < 1) return;
    bagTake(life.bag, key, 1);
    p.eatReady = this.t + EAT_CD;
    const name = LIFE_ITEMS[key].name;
    if (food.buff) {
      const now = this.now();
      const old = life.buff && life.buff.until > now && life.buff.key !== key ? LIFE_ITEMS[life.buff.key]?.name : null;
      life.buff = { key, until: now + food.buff.ms };
      this.recalc(p);
      this.tell(p, `Ăn ${name}: ${food.buff.label} trong ${Math.round(food.buff.ms / 60_000)} phút${old ? ` (thay cho ${old})` : ''}`);
    }
    if (food.heal && p.hp < p.stats.maxHp) {
      const v = Math.min(p.stats.maxHp - p.hp, Math.round(p.stats.maxHp * food.heal));
      p.hp += v;
      this.events.push({ e: 'heal', id: p.id, v: Math.round(v) });
    }
    if (food.khi) p.khi = Math.min(100, p.khi + food.khi);
    if (!food.buff) this.tell(p, `Ăn ${name}: ${food.desc}`);
    p.meDirty = true; p.saveDirty = true;
  }

  /** Mỗi giây: hết hạn buff ăn uống; Cá kho tộ hồi Khí. */
  private updateFood(p: Player) {
    const life = p.prof.life;
    const b = life?.buff;
    if (!life || !b) return;
    if (this.now() >= b.until) {
      delete life.buff;
      this.recalc(p);
      this.tell(p, `Hết tác dụng ${LIFE_ITEMS[b.key]?.name ?? 'món ăn'}`);
      p.saveDirty = true;
      return;
    }
    if (FOODS[b.key]?.buff?.stat === 'khi' && !p.dead && p.khi < 100) {
      p.khiAcc += FOODS[b.key].buff!.pct;
      if (p.khiAcc >= 1) {
        const add = Math.floor(p.khiAcc);
        p.khiAcc -= add;
        p.khi = Math.min(100, p.khi + add);
        p.meDirty = true;
      }
    }
  }

  private sellBag(p: Player, key: string, qty: number) {
    if (!this.nearNpc(p, 'nuoc', 85) && !this.nearNpc(p, 'do', 85) && !this.nearNpc(p, 'mo', 85)) {
      this.tell(p, 'Hãy lại gần Cô Mơ, Bà Hàng Nước hoặc Bác Lái Đò');
      return;
    }
    const item = LIFE_ITEMS[key];
    const life = this.life(p);
    if (!item || !(qty > 0)) return;
    qty = Math.min(qty, bagCount(life.bag, key));
    if (!qty) return;
    if (item.sell <= 0) { this.tell(p, `${item.name} chẳng ai mua cả`); return; }
    const day = vnDay(this.now());
    if (!life.sold || life.sold.day !== day) life.sold = { day, gold: 0 };
    const evt = getTodayMarketEvent(this.now());
    const hasBonus = (evt.multipliers[key] ?? 1.0) > 1.0;
    let gold = 0;
    for (let i = 0; i < qty; i++) gold += getMarketSellPrice(key, life.sold.gold + gold, this.now());
    bagTake(life.bag, key, qty);
    p.prof.gold += gold;
    life.sold.gold += gold;
    const capped = life.sold.gold >= SELL_DAILY_CAP;
    this.tell(p, `Đã bán ${qty} ${item.name} (+${gold} vàng)${hasBonus ? ` [Ưu đãi Chợ Phiên: ${evt.title}]` : ''}${capped ? '. Hôm nay bán nhiều rồi, thương lái chỉ trả 1/4 giá' : ''}`);
    p.meDirty = true; p.saveDirty = true;
  }

  private bagDrop(p: Player, key: string) {
    const life = this.life(p);
    if (!bagCount(life.bag, key)) return;
    delete life.bag[key];
    this.tell(p, `Đã bỏ ${LIFE_ITEMS[key]?.name ?? key} khỏi Giỏ Tre`);
    p.meDirty = true; p.saveDirty = true;
  }

  private lightFire(p: Player) {
    if (p.dead || p.fish || p.cooking) return;
    const life = this.life(p);
    if (bagCount(life.bag, 'cui') < 1) { this.tell(p, 'Cần 1 Cành củi để nhóm lửa (câu được, hoặc mua ở Bà Hàng Nước)'); return; }
    if (this.t - p.lastCombat < FISH.calmMs) { this.tell(p, 'Đang giao tranh, chưa nhóm lửa được'); return; }
    for (const f of [...this.fires.values()]) if (f.owner === p.id) this.fires.delete(f.id); // mỗi người 1 đống lửa
    bagTake(life.bag, 'cui', 1);
    const id = this.ids();
    this.fires.set(id, { id, x: Math.round(p.x), y: Math.round(p.y + 18), until: this.t + CAMPFIRE_MS, owner: p.id });
    this.tell(p, 'Lửa trại bập bùng! Mọi người quanh đây đều nướng được (cháy 90 giây)');
    p.meDirty = true; p.saveDirty = true;
  }

  // ------------------------------------------------------------ Nghề Sống: săn bắt, đặt bẫy

  /** Cho thịt (và phụ phẩm) vào Giỏ Tre; Giỏ đầy thì báo và bỏ. */
  private huntGain(p: Player, how: 'hunt' | 'trap', key: string, qty: number, extra?: { key: string; p: number }, xp = 0) {
    const life = this.life(p);
    if (!bagCanAdd(life.bag, key, qty)) { this.tell(p, `Giỏ Tre đầy, đành bỏ lại ${LIFE_ITEMS[key]?.name ?? key}`); return; }
    bagAdd(life.bag, key, qty);
    let ex: string | undefined;
    if (extra && this.rnd() < extra.p && bagCanAdd(life.bag, extra.key, 1)) { bagAdd(life.bag, extra.key, 1); ex = extra.key; }
    if (xp) this.gainLifeXp(p, 'hunt', xp);
    this.outbox.push({ to: p.id, msg: ex ? { t: 'gain', how, key, qty, extra: ex } : { t: 'gain', how, key, qty } });
    p.meDirty = true; p.saveDirty = true;
  }

  private trapSet(p: Player) {
    if (p.dead || p.fish || p.cooking) return;
    const life = this.life(p);
    if (bagCount(life.bag, 'bay') < 1) { this.tell(p, 'Cần 1 Bẫy thòng lọng (mua ở Bà Hàng Nước)'); return; }
    if (!trapSpotOk(this.map, p.x, p.y)) { this.tell(p, 'Hãy đặt bẫy trên bãi cỏ ngoài làng'); return; }
    if (this.t - p.lastCombat < FISH.calmMs) { this.tell(p, 'Đang giao tranh, chưa đặt bẫy được'); return; }
    const lv = this.lifeLv(p, 'hunt');
    const traps = life.traps ?? (life.traps = []);
    const max = HUNT.trapCount(lv);
    if (traps.length >= max) { this.tell(p, `Chỉ đặt được ${max} bẫy cùng lúc (Săn bắt cấp ${lv})`); return; }
    if (traps.some((tr) => tr.map === this.mapId && dist(tr.x, tr.y, p.x, p.y) < HUNT.trapGap)) { this.tell(p, 'Gần đây đã có bẫy của bạn, hãy đặt xa hơn'); return; }
    bagTake(life.bag, 'bay', 1);
    const ms = (HUNT.trapMin + this.rnd() * (HUNT.trapMax - HUNT.trapMin)) * HUNT.trapSpeed(lv);
    traps.push({
      id: Math.max(0, ...traps.map((tr) => tr.id)) + 1,
      map: this.mapId, x: Math.round(p.x), y: Math.round(p.y),
      readyAt: this.now() + Math.round(ms), catch: rollTrap(this.mapId, lv, this.rnd),
    });
    this.tell(p, `Đã giăng bẫy thòng lọng. Chừng ${Math.round(ms / 60_000)} phút nữa quay lại xem nhé!`);
    p.meDirty = true; p.saveDirty = true;
  }

  private trapTake(p: Player, id: number, force: boolean) {
    if (p.dead) return;
    const life = this.life(p);
    const traps = life.traps ?? [];
    const i = traps.findIndex((tr) => tr.id === id);
    if (i < 0) return;
    const tr = traps[i];
    if (tr.map !== this.mapId || dist(tr.x, tr.y, p.x, p.y) > HUNT.trapReach + PLAYER_RADIUS) { this.tell(p, 'Hãy lại gần bẫy'); return; }
    const left = tr.readyAt - this.now();
    if (left > 0 && !force) { this.tell(p, `Bẫy chưa sập, chừng ${Math.max(1, Math.ceil(left / 60_000))} phút nữa`); return; }
    // thu bẫy về (bẫy dùng lại được); Giỏ đầy thì để bẫy nằm đó
    if (!bagCanAdd(life.bag, 'bay', 1)) { this.tell(p, 'Giỏ Tre đầy, chưa thu bẫy được'); return; }
    traps.splice(i, 1);
    if (!traps.length) delete life.traps;
    bagAdd(life.bag, 'bay', 1);
    if (left > 0) {
      this.tell(p, 'Đã gỡ bẫy về (chưa bắt được gì)');
    } else if (tr.catch) {
      this.huntGain(p, 'trap', tr.catch, 1, tr.catch === 'thit_ga' ? { key: 'long_ga', p: 0.3 } : undefined, HUNT.trapXp);
      this.events.push({ e: 'fx', k: 'ripple', x: tr.x, y: tr.y, r: 22, ms: 500 });
    } else {
      this.tell(p, 'Bẫy đã sập nhưng con mồi giãy thoát mất rồi...');
      this.gainLifeXp(p, 'hunt', 2);
    }
    p.meDirty = true; p.saveDirty = true;
  }

  // ------------------------------------------------------------ Canh Nông & Thăm Vườn

  private farmPlow(p: Player, plotId: number) {
    if (p.dead) return;
    if (this.mapId !== 'vuon_nha') { this.tell(p, 'Hãy về Vườn Nhà để cuốc xới đất!'); return; }
    if (!Number.isInteger(plotId) || plotId < 0 || plotId >= FARM.plotCount) return;
    const farm = this.farm(p);
    const plot = farm.plots[plotId];
    if (!plot || plot.state !== 'empty') {
      this.tell(p, 'Ô đất này không thể cuốc');
      return;
    }
    plot.state = 'plowed';
    plot.fertilized = false;
    this.gainLifeXp(p, 'farm', 2);
    this.tell(p, `Đã cuốc xới ô đất ${plotId + 1} tơi xốp, sẵn sàng gieo giống!`);
    p.meDirty = true; p.saveDirty = true;
  }

  private farmPlant(p: Player, plotId: number, crop: CropKind) {
    if (p.dead) return;
    if (this.mapId !== 'vuon_nha') { this.tell(p, 'Hãy về Vườn Nhà để gieo giống lúa!'); return; }
    if (!Number.isInteger(plotId) || plotId < 0 || plotId >= FARM.plotCount) return;
    if (crop !== 'giong_te' && crop !== 'giong_nep') return;
    const bag = this.life(p).bag;
    if (bagCount(bag, crop) < 1) {
      this.tell(p, `Cần 1 ${LIFE_ITEMS[crop]?.name ?? 'hạt giống'} trong Giỏ Tre`);
      return;
    }
    const farm = this.farm(p);
    const plot = farm.plots[plotId];
    if (!plot || plot.state !== 'plowed') {
      this.tell(p, 'Cần cuốc xới đất trước khi gieo');
      return;
    }
    bagTake(bag, crop, 1);
    plot.state = 'planted';
    plot.crop = crop;
    plot.progress = 0;
    plot.pest = false;
    plot.waterUntil = this.now() + FARM.waterDurationMs; // vừa gieo tưới ẩm ngay
    plot.lastUpdate = this.now();
    this.gainLifeXp(p, 'farm', 3);
    this.tell(p, `Đã gieo ${FARM.crops[crop].name} vào ô đất ${plotId + 1}!`);
    p.meDirty = true; p.saveDirty = true;
  }

  private farmWater(p: Player, plotId: number, targetName?: string) {
    if (p.dead) return;
    if (!Number.isInteger(plotId) || plotId < 0 || plotId >= FARM.plotCount) return;
    const now = this.now();

    if (targetName && targetName.toLowerCase() !== p.prof.name.toLowerCase()) {
      const target = this.findTargetFarm(targetName);
      if (!target) { this.tell(p, `Không tìm thấy vườn của ${targetName}`); return; }
      const plot = target.farm.plots[plotId];
      if (!plot || plot.state !== 'planted') { this.tell(p, 'Ô đất này chưa trồng cây'); return; }
      plot.waterUntil = now + FARM.waterDurationMs;
      target.markDirty();
      this.gainLifeXp(p, 'farm', FARM.socialWaterXp);
      p.prof.gold += FARM.socialWaterGold;
      this.tell(p, `Đã tưới nước giúp ruộng của ${targetName}! (+${FARM.socialWaterXp} XP Canh nông, +${FARM.socialWaterGold} vàng)`);
      p.meDirty = true; p.saveDirty = true;
      return;
    }

    if (this.mapId !== 'vuon_nha') { this.tell(p, 'Hãy về Vườn Nhà để tưới nước cho lúa!'); return; }
    const farm = this.farm(p);
    const plot = farm.plots[plotId];
    if (!plot || plot.state !== 'planted') { this.tell(p, 'Ô đất này chưa trồng cây'); return; }
    plot.waterUntil = now + FARM.waterDurationMs;
    this.gainLifeXp(p, 'farm', 1);
    this.tell(p, `Đã tưới đẫm nước cho ô đất ${plotId + 1} (giữ ẩm 2 phút, lớn nhanh gấp đôi)!`);
    p.meDirty = true; p.saveDirty = true;
  }

  private farmWeed(p: Player, plotId: number, targetName?: string) {
    if (p.dead) return;
    if (!Number.isInteger(plotId) || plotId < 0 || plotId >= FARM.plotCount) return;

    if (targetName && targetName.toLowerCase() !== p.prof.name.toLowerCase()) {
      const target = this.findTargetFarm(targetName);
      if (!target) { this.tell(p, `Không tìm thấy vườn của ${targetName}`); return; }
      const plot = target.farm.plots[plotId];
      if (!plot || !plot.pest) { this.tell(p, 'Ô đất này không có sâu bọ'); return; }
      plot.pest = false;
      plot.lastUpdate = this.now();
      target.markDirty();
      this.gainLifeXp(p, 'farm', FARM.socialWeedXp);
      p.prof.gold += FARM.socialWeedGold;
      this.tell(p, `Đã bắt sâu/đuổi chim giúp ô ${plotId + 1} của ${targetName}! (+${FARM.socialWeedXp} XP Canh nông, +${FARM.socialWeedGold} vàng)`);
      p.meDirty = true; p.saveDirty = true;
      return;
    }

    if (this.mapId !== 'vuon_nha') { this.tell(p, 'Hãy về Vườn Nhà để bắt sâu bọ!'); return; }
    const farm = this.farm(p);
    const plot = farm.plots[plotId];
    if (!plot || !plot.pest) { this.tell(p, 'Ô đất này không có sâu bọ'); return; }
    plot.pest = false;
    plot.lastUpdate = this.now();
    this.gainLifeXp(p, 'farm', 3);
    this.tell(p, `Đã bắt sâu bọ và xua chim sẻ ở ô ${plotId + 1}!`);
    p.meDirty = true; p.saveDirty = true;
  }

  private farmFertilize(p: Player, plotId: number) {
    if (p.dead) return;
    if (this.mapId !== 'vuon_nha') { this.tell(p, 'Hãy về Vườn Nhà để bón phân cho ruộng!'); return; }
    if (!Number.isInteger(plotId) || plotId < 0 || plotId >= FARM.plotCount) return;
    const bag = this.life(p).bag;
    const hasSuper = bagCount(bag, 'phan_bon_rong') >= 1;
    const hasNormal = bagCount(bag, 'phan_ga') >= 1;
    if (!hasSuper && !hasNormal) {
      this.tell(p, 'Cần 1 Phân chuồng hoai mục (dọn từ chuồng gà) hoặc Phân trùn quế (Chợ Phiên)');
      return;
    }
    const farm = this.farm(p);
    const plot = farm.plots[plotId];
    if (!plot || (plot.state !== 'plowed' && plot.state !== 'planted')) {
      this.tell(p, 'Chỉ bón phân cho đất đã cuốc hoặc đang trồng');
      return;
    }
    if (plot.fertilized && (!hasSuper || plot.superFertilized)) {
      this.tell(p, 'Ô đất này đã được bón phân tốt nhất');
      return;
    }
    if (hasSuper) {
      bagTake(bag, 'phan_bon_rong', 1);
      plot.fertilized = true;
      plot.superFertilized = true;
      if (plot.progress != null) plot.progress = Math.min(1, plot.progress + 0.35);
      this.gainLifeXp(p, 'farm', 6);
      this.tell(p, `Đã bón Phân Trùn Quế cho ô ${plotId + 1}! Lúa lớn nhanh thần tốc (+40% sản lượng khi gặt)!`);
    } else {
      bagTake(bag, 'phan_ga', 1);
      plot.fertilized = true;
      this.gainLifeXp(p, 'farm', 2);
      this.tell(p, `Đã bón phân chuồng cho ô ${plotId + 1} (+25% sản lượng thóc khi gặt)!`);
    }
    p.meDirty = true; p.saveDirty = true;
  }

  private farmHarvest(p: Player, plotId: number) {
    if (p.dead) return;
    if (this.mapId !== 'vuon_nha') { this.tell(p, 'Hãy về Vườn Nhà để thu hoạch lúa chín!'); return; }
    if (!Number.isInteger(plotId) || plotId < 0 || plotId >= FARM.plotCount) return;
    const farm = this.farm(p);
    updateFarmPlots(farm.plots, this.now(), this.rnd);
    const plot = farm.plots[plotId];
    if (!plot || plot.state !== 'planted' || !plot.crop || (plot.progress ?? 0) < 1) {
      this.tell(p, 'Lúa chưa chín rộ');
      return;
    }
    const info = FARM.crops[plot.crop];
    const mult = plot.superFertilized ? 1.4 : (plot.fertilized ? 1.25 : 1);
    const yieldQty = Math.round(info.yieldQty * mult);
    const strawQty = info.strawQty;
    const bag = this.life(p).bag;
    if (!bagCanAdd(bag, info.yieldKey, yieldQty) || !bagCanAdd(bag, 'rom', strawQty)) {
      this.tell(p, 'Giỏ Tre đầy, không chứa thêm nông sản được');
      return;
    }
    bagAdd(bag, info.yieldKey, yieldQty);
    bagAdd(bag, 'rom', strawQty);
    plot.state = 'empty';
    delete plot.crop;
    delete plot.progress;
    delete plot.waterUntil;
    delete plot.fertilized;
    delete plot.superFertilized;
    delete plot.pest;
    delete plot.lastUpdate;
    this.gainLifeXp(p, 'farm', info.xp);
    this.tell(p, `Thu hoạch ô ${plotId + 1}: nhận ${yieldQty} ${LIFE_ITEMS[info.yieldKey].name} và ${strawQty} Rơm vàng!`);
    p.meDirty = true; p.saveDirty = true;
  }

  private farmMill(p: Player, crop: CropKind) {
    if (p.dead) return;
    if (this.mapId !== 'vuon_nha') { this.tell(p, 'Hãy về Vườn Nhà và đứng bên cối đá để xay thóc!'); return; }
    const bag = this.life(p).bag;
    if (crop === 'giong_te') {
      if (bagCount(bag, 'thoc') < 2) { this.tell(p, 'Cần ít nhất 2 Thóc tẻ để xay cối đá'); return; }
      const after = { ...bag };
      bagTake(after, 'thoc', 2);
      if (!bagCanAdd(after, 'gao_te', 2) || !bagCanAdd(after, 'cam_gao', 1)) { this.tell(p, 'Giỏ Tre đầy'); return; }
      bagTake(bag, 'thoc', 2);
      bagAdd(bag, 'gao_te', 2);
      bagAdd(bag, 'cam_gao', 1);
      this.gainLifeXp(p, 'farm', 4);
      this.tell(p, 'Cối đá xay xát: Nhận 2 Gạo tẻ trắng ngần và 1 Cám gạo!');
    } else if (crop === 'giong_nep') {
      if (bagCount(bag, 'thoc_nep') < 2) { this.tell(p, 'Cần ít nhất 2 Thóc nếp để xay cối đá'); return; }
      const after = { ...bag };
      bagTake(after, 'thoc_nep', 2);
      if (!bagCanAdd(after, 'gao_nep', 2) || !bagCanAdd(after, 'cam_gao', 1)) { this.tell(p, 'Giỏ Tre đầy'); return; }
      bagTake(bag, 'thoc_nep', 2);
      bagAdd(bag, 'gao_nep', 2);
      bagAdd(bag, 'cam_gao', 1);
      this.gainLifeXp(p, 'farm', 5);
      this.tell(p, 'Cối đá xay xát: Nhận 2 Gạo nếp cái hoa vàng và 1 Cám gạo!');
    } else if (crop === 'giong_tam_thom') {
      if (bagCount(bag, 'thoc_tam_thom') < 2) { this.tell(p, 'Cần ít nhất 2 Thóc Tám Thơm để xay cối đá'); return; }
      const after = { ...bag };
      bagTake(after, 'thoc_tam_thom', 2);
      if (!bagCanAdd(after, 'gao_tam_thom', 2) || !bagCanAdd(after, 'cam_gao', 1)) { this.tell(p, 'Giỏ Tre đầy'); return; }
      bagTake(bag, 'thoc_tam_thom', 2);
      bagAdd(bag, 'gao_tam_thom', 2);
      bagAdd(bag, 'cam_gao', 1);
      this.gainLifeXp(p, 'farm', 6);
      this.tell(p, 'Cối đá xay xát: Nhận 2 Gạo Tám Thơm đặc sản và 1 Cám gạo!');
    }
    p.meDirty = true; p.saveDirty = true;
  }

  private coopAdd(p: Player) {
    if (p.dead) return;
    if (this.mapId !== 'vuon_nha') { this.tell(p, 'Hãy về Vườn Nhà để thả gà vào chuồng!'); return; }
    const farm = this.farm(p);
    updateFarmChickens(farm, this.now(), this.rnd);
    if (farm.chickens.length >= FARM.maxChickens) {
      this.tell(p, `Chuồng đã nuôi tối đa ${FARM.maxChickens} con gà`);
      return;
    }
    const bag = this.life(p).bag;
    if (bagCount(bag, 'ga_con') < 1) {
      this.tell(p, 'Cần 1 Gà con giống trong Giỏ Tre (mua ở Bà Hàng Nước)');
      return;
    }
    bagTake(bag, 'ga_con', 1);
    const nextId = farm.chickens.length ? Math.max(...farm.chickens.map((c) => c.id)) + 1 : 1;
    farm.chickens.push({ id: nextId, bornAt: this.now(), fedTime: 0, laidTime: 0 });
    farm.lastUpdate = this.now();
    this.gainLifeXp(p, 'farm', 5);
    this.tell(p, 'Đã thả một chú gà con lông vàng vào chuồng! Cho ăn đều đặn để gà mau lớn nhé.');
    p.meDirty = true; p.saveDirty = true;
  }

  private coopFeed(p: Player, item: 'thoc' | 'cam_gao') {
    if (p.dead) return;
    if (this.mapId !== 'vuon_nha') { this.tell(p, 'Hãy về Vườn Nhà để cho gà ăn!'); return; }
    if (item !== 'thoc' && item !== 'cam_gao') return;
    const bag = this.life(p).bag;
    if (bagCount(bag, item) < 1) {
      this.tell(p, `Cần 1 ${LIFE_ITEMS[item]?.name ?? 'thức ăn'}`);
      return;
    }
    const farm = this.farm(p);
    updateFarmChickens(farm, this.now(), this.rnd);
    if (farm.troughFood >= FARM.maxTrough) {
      this.tell(p, 'Máng ăn đã đầy thức ăn');
      return;
    }
    bagTake(bag, item, 1);
    farm.troughFood = (farm.troughFood ?? 0) + 1;
    if ((farm.troughUntil ?? 0) <= this.now()) {
      farm.troughUntil = this.now() + FARM.troughPerGrainMs;
    }
    farm.lastUpdate = this.now();
    this.gainLifeXp(p, 'farm', 2);
    this.tell(p, `Đã đổ thức ăn vào máng (máng có ${farm.troughFood}/${FARM.maxTrough} phần)!`);
    p.meDirty = true; p.saveDirty = true;
  }

  private coopCollect(p: Player) {
    if (p.dead) return;
    if (this.mapId !== 'vuon_nha') { this.tell(p, 'Hãy về Vườn Nhà để nhặt trứng gà!'); return; }
    const farm = this.farm(p);
    updateFarmChickens(farm, this.now(), this.rnd);
    const totalEggs = farm.eggs + farm.goldenEggs;
    if (totalEggs <= 0) {
      this.tell(p, 'Trong chuồng chưa có trứng nào');
      return;
    }
    const bag = this.life(p).bag;
    if (farm.eggs > 0 && !bagCanAdd(bag, 'trung_ga', farm.eggs)) { this.tell(p, 'Giỏ Tre đầy'); return; }
    if (farm.goldenEggs > 0 && !bagCanAdd(bag, 'trung_hai_long', farm.goldenEggs)) { this.tell(p, 'Giỏ Tre đầy'); return; }
    const eggs = farm.eggs, golden = farm.goldenEggs;
    if (eggs > 0) bagAdd(bag, 'trung_ga', eggs);
    if (golden > 0) bagAdd(bag, 'trung_hai_long', golden);
    farm.eggs = 0; farm.goldenEggs = 0;
    this.gainLifeXp(p, 'farm', eggs * 2 + golden * 6);
    this.tell(p, `Đã nhặt ${eggs} Trứng gà ta${golden > 0 ? ` và ${golden} Trứng gà hai lòng may mắn` : ''}!`);
    p.meDirty = true; p.saveDirty = true;
  }

  private coopClean(p: Player) {
    if (p.dead) return;
    if (this.mapId !== 'vuon_nha') { this.tell(p, 'Hãy về Vườn Nhà để dọn chuồng gà!'); return; }
    const farm = this.farm(p);
    updateFarmChickens(farm, this.now(), this.rnd);
    if (farm.manure <= 0) {
      this.tell(p, 'Chuồng gà đã sạch sẽ');
      return;
    }
    const bag = this.life(p).bag;
    if (!bagCanAdd(bag, 'phan_ga', farm.manure)) {
      this.tell(p, 'Giỏ Tre đầy');
      return;
    }
    const collected = farm.manure;
    bagAdd(bag, 'phan_ga', collected);
    farm.manure = 0;
    this.gainLifeXp(p, 'farm', collected * 2);
    this.tell(p, `Đã dọn chuồng thu được ${collected} Phân chuồng hoai mục (bón lót ruộng lúa +25% sản lượng)!`);
    p.meDirty = true; p.saveDirty = true;
  }

  private farmVisit(p: Player, name: string) {
    if (p.dead) return;
    name = String(name ?? '').trim();
    if (!name || name.toLowerCase() === p.prof.name.toLowerCase()) {
      p.visitingFarm = null;
      this.outbox.push({ to: p.id, msg: { t: 'farm_visit', farm: null } });
      this.tell(p, 'Đã quay về Vườn Nhà của mình');
      p.meDirty = true;
      return;
    }
    const target = this.findTargetFarm(name);
    if (!target) {
      this.tell(p, `Không tìm thấy người chơi "${name}"`);
      return;
    }
    const now = this.now();
    updateFarmPlots(target.farm.plots, now, this.rnd);
    updateFarmChickens(target.farm, now, this.rnd);
    p.visitingFarm = name;
    const visitSelf: FarmVisitSelf = {
      ownerName: target.player?.prof.name ?? name,
      farmLv: target.farmLv,
      plots: target.farm.plots.map((pl) => ({ ...pl })),
      chickens: target.farm.chickens.map((c) => ({ ...c })),
      troughFood: target.farm.troughFood,
      eggs: target.farm.eggs,
      goldenEggs: target.farm.goldenEggs,
      manure: target.farm.manure,
      likes: target.farm.likes,
      cheers: [...target.farm.cheers],
    };
    this.outbox.push({ to: p.id, msg: { t: 'farm_visit', farm: visitSelf } });
    this.tell(p, `Đang ghé thăm Vườn Nhà của ${name}!`);
    p.meDirty = true;
  }

  private farmCheer(p: Player, targetName: string, text: string) {
    if (p.dead) return;
    targetName = String(targetName ?? '').trim();
    if (!targetName) return;
    const target = this.findTargetFarm(targetName);
    if (!target) {
      this.tell(p, `Không tìm thấy vườn của "${targetName}"`);
      return;
    }
    target.farm.likes = (target.farm.likes ?? 0) + 1;
    let cheerText = String(text ?? '').trim();
    if (!cheerText) {
      cheerText = FOLK_CHEERS[Math.floor(this.rnd() * FOLK_CHEERS.length)];
    }
    target.farm.cheers.push({ by: p.prof.name, text: cheerText.slice(0, 100), time: this.now() });
    if (target.farm.cheers.length > 20) target.farm.cheers.splice(0, target.farm.cheers.length - 20);
    target.markDirty();
    this.gainLifeXp(p, 'farm', 2);
    p.prof.gold += 1;
    this.tell(p, `Đã thả tim và gửi lời chúc đến ${targetName}! (+2 XP Canh nông, +1 vàng)`);
    p.meDirty = true;
  }

  // ------------------------------------------------------------ Chợ Phiên & Giao Thương

  private marketGet(p: Player) {
    if (!this.market) return;
    const listings = this.market.getListings();
    const myEarnings = this.market.getPendingEarnings(p.prof.token);
    const mySales = this.market.getSalesHistory(p.prof.token);
    const event = getTodayMarketEvent(this.now());
    this.outbox.push({
      to: p.id,
      msg: {
        t: 'market_data',
        listings,
        myEarnings,
        mySales,
        event,
      },
    });
  }

  private marketSell(p: Player, key: string, qty: number, unitPrice: number) {
    if (!this.market) return;
    const res = this.market.createListing(p, key, qty, unitPrice);
    this.tell(p, res.msg);
    if (res.ok) {
      p.meDirty = true; p.saveDirty = true;
      this.marketGet(p);
      this.sys(`[Chợ Phiên] ${p.prof.name} vừa ký gửi ${qty} ${LIFE_ITEMS[key]?.name ?? key} lên Chợ Làng!`);
    }
  }

  private marketBuy(p: Player, id: string, qty: number) {
    if (!this.market) return;
    const res = this.market.buyListing(
      p,
      id,
      qty,
      (token) => (this.onFindPlayerByToken ? this.onFindPlayerByToken(token) : undefined),
    );
    this.tell(p, res.msg);
    if (res.ok) {
      p.meDirty = true; p.saveDirty = true;
      this.marketGet(p);
      if (res.sellerToken) {
        const seller = this.onFindPlayerByToken ? this.onFindPlayerByToken(res.sellerToken) : undefined;
        if (seller) {
          this.tell(seller, `[Chợ Phiên] ${p.prof.name} đã mua ${res.qtyBought} ${res.itemName} (+${res.totalGold} Vàng)!`);
        }
      }
    }
  }

  private marketCancel(p: Player, id: string) {
    if (!this.market) return;
    const res = this.market.cancelListing(p, id);
    this.tell(p, res.msg);
    if (res.ok) {
      p.meDirty = true; p.saveDirty = true;
      this.marketGet(p);
    }
  }

  private marketClaim(p: Player) {
    if (!this.market) return;
    const res = this.market.claimEarnings(p);
    this.tell(p, res.msg);
    if (res.claimed > 0) {
      p.meDirty = true; p.saveDirty = true;
      this.marketGet(p);
    }
  }

  private npcMarketBuy(p: Player, key: string, qty = 1) {
    if (!this.nearNpc(p, 'mo', 85)) {
      this.tell(p, 'Hãy lại gần Cô Mơ tại Chợ Làng Tre để mua nông cụ!');
      return;
    }
    const item = CO_MO_SHOP.find((i) => i.key === key);
    if (!item) {
      this.tell(p, 'Mặt hàng không có trong sạp của Cô Mơ');
      return;
    }
    qty = Math.max(1, Math.min(20, Math.floor(qty)));
    const totalCost = item.price * qty;
    if (p.prof.gold < totalCost) {
      this.tell(p, `Không đủ vàng (cần ${totalCost} vàng, bạn có ${p.prof.gold} vàng)`);
      return;
    }
    const bag = this.life(p).bag;
    if (!bagCanAdd(bag, key, qty)) {
      this.tell(p, 'Giỏ Tre đã đầy');
      return;
    }
    p.prof.gold -= totalCost;
    bagAdd(bag, key, qty);
    this.tell(p, `Đã mua ${qty} ${item.name} từ Cô Mơ (-${totalCost} vàng)!`);
    p.meDirty = true; p.saveDirty = true;
  }

  private stallSet(p: Player, open: boolean, name?: string) {
    if (open) {
      if (this.mapId !== 'lang_tre' || !isSafe(this.map, p.x, p.y)) {
        this.tell(p, 'Chỉ có thể bày sạp tại khu vực an toàn Làng Tre (sân chợ làng)!');
        return;
      }
      const stallName = name ? name.trim().slice(0, 30) : `Sạp của ${p.prof.name}`;
      p.stall = { open: true, name: stallName };
      this.tell(p, `Bạn đã mở "${stallName}". Người khác có thể lại gần sạp để xem hàng.`);
      this.sys(`[Chợ Phiên] ${p.prof.name} vừa dựng "${stallName}" tại Làng Tre!`);
    } else {
      p.stall = null;
      this.tell(p, 'Bạn đã đóng sạp hàng.');
    }
    p.meDirty = true;
  }

  private gainXp(p: Player, amount: number) {
    p.prof.xp += amount;
    while (p.prof.level < MAX_LEVEL && p.prof.xp >= xpToNext(p.prof.level)) {
      p.prof.xp -= xpToNext(p.prof.level);
      p.prof.level++;
      if (p.prof.skills) {
        p.prof.skills.sp++;
      } else {
        p.prof.skills = normalizeSkills(undefined, p.prof.level);
      }
      this.recalc(p);
      p.hp = p.stats.maxHp;
      this.events.push({ e: 'lvl', id: p.id, lv: p.prof.level });
      this.tell(p, `Lên cấp ${p.prof.level}! Nhận +1 Điểm Võ Học (SP).`);
    }
    if (p.prof.level >= MAX_LEVEL) p.prof.xp = 0;
    p.meDirty = true; p.saveDirty = true;
  }

  private useSkill(p: Player) {
    if (p.dead || this.t < p.skillReady || isSafe(this.map, p.x, p.y)) return;
    const mainLv = p.prof.skills?.mainLv ?? 1;
    const tree = CLASS_SKILL_TREES[p.prof.cls];
    const mainDef = tree.main.levels[mainLv - 1] ?? tree.main.levels[0];
    p.skillReady = this.t + mainDef.cd;
    p.meDirty = true;
    p.lastCombat = this.t;

    if (p.prof.cls === 'warrior') {
      const r = 78;
      this.events.push({ e: 'fx', k: 'whirl', x: p.x, y: p.y, r });
      for (const m of this.mobs.values()) {
        if (!m.dead && dist(p.x, p.y, m.x, m.y) <= r + m.def.radius) {
          if (mainLv >= 5) {
            m.stunUntil = Math.max(m.stunUntil, this.t + 500); // Đột phá Cấp 5
          }
          this.hitMob(m, p.id, p.stats.atk, mainDef.mult);
        }
      }
    } else if (p.prof.cls === 'archer') {
      const tgt = this.nearestMob(p.x, p.y, 280);
      const base = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : p.f;
      this.events.push({ e: 'fx', k: 'volley', x: p.x, y: p.y, r: 0 });
      const arrows = mainLv >= 5 ? 7 : 5;
      const half = Math.floor(arrows / 2);
      for (let i = -half; i <= half; i++) {
        const a = base + i * 0.17;
        this.spawnProj(p, 'arrow', Math.cos(a), Math.sin(a), null, mainDef.mult, 0, 300);
      }
    } else {
      const tgt = this.nearestMob(p.x, p.y, 240, false);
      const tx = tgt ? tgt.x : p.x + Math.cos(p.f) * 120;
      const ty = tgt ? tgt.y : p.y + Math.sin(p.f) * 120;
      const r = 72 + (mainLv - 1) * 6;
      const delay = mainLv === 5 ? 400 : mainLv >= 3 ? 500 : 600;
      const atk = p.stats.atk, owner = p.id;
      this.events.push({ e: 'fx', k: 'meteor', x: tx, y: ty, r, ms: delay });
      this.later(delay, () => {
        this.events.push({ e: 'fx', k: 'boom', x: tx, y: ty, r });
        for (const m of this.mobs.values()) {
          if (!m.dead && dist(tx, ty, m.x, m.y) <= r + m.def.radius) {
            if (mainLv >= 5) {
              m.slowUntil = Math.max(m.slowUntil, this.t + 2000);
              m.slowPct = 0.5;
            }
            this.hitMob(m, owner, atk, mainDef.mult);
          }
        }
      });
    }
  }

  private useUltimate(p: Player) {
    if (p.dead || p.khi < 100 || isSafe(this.map, p.x, p.y)) return;
    const ultLv = p.prof.skills?.ultLv ?? 1;
    const tree = CLASS_SKILL_TREES[p.prof.cls];
    const ultDef = tree.ult.levels[ultLv - 1] ?? tree.ult.levels[0];
    p.khi = 0;
    p.meDirty = true;
    p.lastCombat = this.t;

    if (p.prof.cls === 'warrior') {
      // Phù Đổng Thiên Vương: nện đất vùng mở rộng theo cấp, choáng quái
      const r = ultDef.radius ?? 110, delay = 300, atk = p.stats.atk, owner = p.id;
      const stunMs = 1200 + (ultLv - 1) * 300;
      const cx = p.x, cy = p.y;
      this.events.push({ e: 'fx', k: 'ult_warrior', x: cx, y: cy, r, ms: delay });
      this.later(delay, () => {
        this.events.push({ e: 'fx', k: 'boom', x: cx, y: cy, r });
        for (const m of this.mobs.values()) {
          if (!m.dead && dist(cx, cy, m.x, m.y) <= r + m.def.radius) {
            m.stunUntil = Math.max(m.stunUntil, this.t + stunMs);
            this.hitMob(m, owner, atk, ultDef.mult);
          }
        }
      });
    } else if (p.prof.cls === 'archer') {
      // Nỏ Thần Kim Quy: mưa tên vàng vùng phủ
      const tgt = this.nearestMob(p.x, p.y, 300, false);
      const tx = tgt ? tgt.x : p.x + Math.cos(p.f) * 150;
      const ty = tgt ? tgt.y : p.y + Math.sin(p.f) * 150;
      const r = ultDef.radius ?? 90, atk = p.stats.atk, owner = p.id;
      const dur = ultDef.duration ?? 3000;
      const ticks = Math.round(dur / 250);
      this.events.push({ e: 'fx', k: 'ult_archer', x: tx, y: ty, r, ms: dur });
      for (let i = 1; i <= ticks; i++) {
        this.later(i * 250, () => {
          for (const m of this.mobs.values()) {
            if (!m.dead && dist(tx, ty, m.x, m.y) <= r + m.def.radius) {
              this.hitMob(m, owner, atk, ultDef.mult);
            }
          }
        });
      }
    } else {
      // Thủy Long Quyển: giọt nước xoay quanh người, chạm gây sát thương và làm chậm 40%
      const dur = ultDef.duration ?? 4000;
      p.waterVortexUntil = this.t + dur;
      p.vortexCooldowns.clear();
      this.events.push({ e: 'fx', k: 'ult_mage', x: p.x, y: p.y, r: ultDef.radius ?? 70, ms: dur });
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

  private handleSkillUpgrade(p: Player, skill: 'main' | 'ult' | 'atk' | 'def' | 'spd') {
    if (p.dead) return;
    const skills = p.prof.skills ?? (p.prof.skills = normalizeSkills(undefined, p.prof.level));
    if (skills.sp <= 0) {
      this.tell(p, 'Không đủ Điểm Võ Học (SP)!');
      return;
    }

    if (skill === 'main') {
      const cur = skills.mainLv ?? 1;
      const max = CLASS_SKILL_TREES[p.prof.cls].main.levels.length;
      if (cur >= max) {
        this.tell(p, 'Kỹ năng chủ động đã đạt cấp tối đa!');
        return;
      }
      skills.mainLv = cur + 1;
      skills.sp--;
      this.tell(p, `Nâng cấp kỹ năng ${CLASS_SKILL_TREES[p.prof.cls].main.name} lên Cấp ${skills.mainLv}!`);
    } else if (skill === 'ult') {
      const cur = skills.ultLv ?? 1;
      const max = CLASS_SKILL_TREES[p.prof.cls].ult.levels.length;
      if (cur >= max) {
        this.tell(p, 'Tuyệt kỹ đã đạt cấp tối đa!');
        return;
      }
      skills.ultLv = cur + 1;
      skills.sp--;
      this.tell(p, `Nâng cấp Tuyệt kỹ ${CLASS_SKILL_TREES[p.prof.cls].ult.name} lên Cấp ${skills.ultLv}!`);
    } else if (skill === 'atk' || skill === 'def' || skill === 'spd') {
      const cur = skills.passives[skill] ?? 0;
      const max = PASSIVE_SKILLS[skill].maxLv;
      if (cur >= max) {
        this.tell(p, `Tâm pháp ${PASSIVE_SKILLS[skill].name} đã đạt cấp tối đa!`);
        return;
      }
      skills.passives[skill] = cur + 1;
      skills.sp--;
      this.recalc(p);
      this.tell(p, `Nâng cấp ${PASSIVE_SKILLS[skill].name} lên Cấp ${skills.passives[skill]}!`);
    } else {
      return;
    }

    this.events.push({ e: 'fx', k: 'ripple', x: p.x, y: p.y, r: 40, ms: 600 });
    p.meDirty = true;
    p.saveDirty = true;
  }

  private handleSkillReset(p: Player) {
    if (p.dead) return;
    const skills = p.prof.skills ?? (p.prof.skills = normalizeSkills(undefined, p.prof.level));
    const totalEarned = Math.max(0, p.prof.level - 1);
    skills.mainLv = 1;
    skills.ultLv = 1;
    skills.passives = { atk: 0, def: 0, spd: 0 };
    skills.sp = totalEarned;

    this.recalc(p);
    this.events.push({ e: 'fx', k: 'whirl', x: p.x, y: p.y, r: 60 });
    this.tell(p, `Tẩy điểm võ học thành công! Đã hồi lại ${totalEarned} SP.`);
    p.meDirty = true;
    p.saveDirty = true;
  }

  // ------------------------------------------------------------ NPC & Nhiệm vụ & Cửa hàng

  private handleTalk(p: Player, npcId: string) {
    const npc = NPCS[npcId];
    if (!npc || npc.mapId !== this.mapId || dist(p.x, p.y, npc.x, npc.y) > 75) return;

    p.prof.quests = p.prof.quests ?? { main1: 1 };
    p.prof.questProg = p.prof.questProg ?? {};

    if (npcId === 'tao') {
      // Nếu đang ở bước 6 của main2 và đã có Mảnh Trống Đồng 2: trả nhiệm vụ Sương Mù Bến Đò
      if (p.prof.quests.main2 === 6 && p.prof.drumPieces?.includes(2)) {
        const step6 = QUESTS.main2.steps[6];
        this.dialogue(p, npcId, 'Ông Táo', step6.dialogue, 6, true);
        if (step6.reward?.xp) this.gainXp(p, step6.reward.xp);
        if (step6.reward?.gold) p.prof.gold += step6.reward.gold;
        if (step6.reward?.title) p.prof.title = step6.reward.title;
        if (step6.reward?.weaponReward) {
          const pool = weaponsFor(p.prof.cls, 'epic');
          if (pool.length && p.prof.inv.length < INVENTORY_SIZE) {
            p.prof.inv.push({ uid: p.nextUid++, key: pool[0].key, qty: 1 });
            this.tell(p, `Nhận thưởng Thần Binh: ${pool[0].name}!`);
          }
        }
        p.prof.quests.main2 = 7;
        p.prof.questProg.codex_vinh_hoa = 1;
        this.recalc(p);
        this.tell(p, 'Chúc mừng hoàn thành chuỗi nhiệm vụ Sương Mù Bến Đò!');
        this.tell(p, 'Manh mối hé lộ: Kẻ chủ mưu chính là Hồ Tinh Chín Đuôi ở Rừng Sương Mù!');
        p.meDirty = true; p.saveDirty = true;
        return;
      }

      // Phóng sinh Cá Chép Vàng: cá chép đưa Ông Táo về trời ngày 23 tháng Chạp
      const life = this.life(p);
      if (bagCount(life.bag, 'ca_chep_vang') > 0) {
        bagTake(life.bag, 'ca_chep_vang', 1);
        this.dialogue(p, npcId, 'Ông Táo', [
          'Ôi chao, Cá Chép Vàng! Cứ 23 tháng Chạp, ta lại cưỡi cá chép này bay về chầu Trời đấy.',
          'Con thả nó về sông là việc phúc đức. Ta tặng con chút lộc và danh hiệu "Cá Chép Hoá Rồng"!',
        ], 0, false);
        this.gainXp(p, 150);
        p.prof.gold += 150;
        p.prof.title = 'Cá Chép Hoá Rồng';
        this.gainLifeXp(p, 'fish', 30);
        this.sys(`${p.prof.name} đã phóng sinh Cá Chép Vàng ở đình làng!`);
        p.meDirty = true; p.saveDirty = true;
        return;
      }

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
          this.tell(p, 'Cổng phía đông Làng Tre đã mở lối sang Đầm Sen.');
          p.meDirty = true; p.saveDirty = true;
        } else {
          this.dialogue(p, npcId, 'Ông Táo', ['Chúa Mộc Tinh đang ở Gốc Đa Cổ phía trên rừng. Hãy cùng đồng đội tiêu diệt hắn đoạt lại Trống Đồng!'], q, false);
        }
      } else {
        if ((p.prof.quests.main2 ?? 1) >= 7) {
          this.dialogue(p, npcId, 'Ông Táo', [
            'Con đã lấy lại cả hai Mảnh Trống Đồng, làm yên sóng bến đò Đầm Sen!',
            'Hãy tích lũy kinh nghiệm, rèn luyện võ nghệ. Khi thời khắc đến, chúng ta sẽ truy kích Hồ Tinh Chín Đuôi!',
          ], 5, false);
        } else {
          this.dialogue(p, npcId, 'Ông Táo', [
            'Cảm ơn con, Người Giữ Trống! Nhờ con mà làng ta yên ổn rồi.',
            'Mảnh trống thứ hai nghe nói ở Đầm Sen. Cổng phía đông làng đã mở, con ra bến đò xem sao!',
          ], 5, false);
        }
      }
    } else if (npcId === 'cuoi') {
      const q = p.prof.quests.cuoi1 ?? 1;
      const def = QUESTS.cuoi1.steps[q] ?? QUESTS.cuoi1.steps[1];
      if (q === 1) {
        this.dialogue(p, npcId, 'Chú Cuội', def.dialogue, q, true);
        if (p.prof.quests.cuoi1 == null) {
          p.prof.quests.cuoi1 = 1;
          p.meDirty = true; p.saveDirty = true;
        }
      } else if (q === 2) {
        this.dialogue(p, npcId, 'Chú Cuội', def.dialogue, q, true);
        if (def.reward?.potion) {
          const slot = p.prof.inv.find((i) => i.key === 'potion');
          if (slot) slot.qty += def.reward.potion;
          else if (p.prof.inv.length < INVENTORY_SIZE) p.prof.inv.push({ uid: p.nextUid++, key: 'potion', qty: def.reward.potion });
        }
        if (def.reward?.xp) this.gainXp(p, def.reward.xp);
        p.prof.quests.cuoi1 = 3;
        p.prof.questProg.codex_chan_trau = 1;
        this.recalc(p);
        this.tell(p, 'Nhận thưởng từ Cuội: +1 Bình máu, +25 XP, mở khóa Tranh Đông Hồ!');
        p.meDirty = true; p.saveDirty = true;
      } else {
        this.dialogue(p, npcId, 'Chú Cuội', ['Cuội đang ngồi ngắm trăng với cây đa đây, vui lắm bạn ơi!'], 3, false);
      }
    } else if (npcId === 'do') {
      const q = p.prof.quests.main2 ?? 1;
      const prog = p.prof.questProg;
      const def = QUESTS.main2.steps[q] ?? QUESTS.main2.steps[1];

      if (q === 1) {
        this.dialogue(p, npcId, 'Bác Lái Đò', def.dialogue, q, true);
        if (p.prof.quests.main2 == null) {
          p.prof.quests.main2 = 1;
          p.meDirty = true; p.saveDirty = true;
        }
      } else if (q === 2) {
        const crabs = prog.main2_crab ?? 0;
        if (crabs >= 10) {
          this.dialogue(p, npcId, 'Bác Lái Đò', def.dialogue, q, true);
          if (def.reward?.xp) this.gainXp(p, def.reward.xp);
          if (def.reward?.gold) p.prof.gold += def.reward.gold;
          p.prof.quests.main2 = 3;
          this.tell(p, 'Nhận thưởng từ Bác Lái Đò: +80 XP, +40 Vàng!');
          p.meDirty = true; p.saveDirty = true;
        } else {
          this.dialogue(p, npcId, 'Bác Lái Đò', [`Lũ Cua Đá vẫn đang phá bến đò (${crabs}/10 con). Tráng sĩ hãy trừ sạch giúp ta nhé!`], q, false);
        }
      } else if (q === 3) {
        const seeds = prog.main2_seed ?? 0;
        if (seeds >= 4) {
          const step3Def = QUESTS.main2.steps[3];
          this.dialogue(p, npcId, 'Bác Lái Đò', step3Def.dialogue, q, true);
          if (step3Def.reward?.xp) this.gainXp(p, step3Def.reward.xp);
          if (step3Def.reward?.potion) {
            const slot = p.prof.inv.find((i) => i.key === 'potion');
            if (slot) slot.qty += step3Def.reward.potion;
            else if (p.prof.inv.length < INVENTORY_SIZE) p.prof.inv.push({ uid: p.nextUid++, key: 'potion', qty: step3Def.reward.potion });
          }
          p.prof.quests.main2 = 4;
          this.tell(p, 'Nhận thưởng từ Bác Lái Đò: +120 XP, +2 Bình máu!');
          p.meDirty = true; p.saveDirty = true;
        } else {
          this.dialogue(p, npcId, 'Bác Lái Đò', [`Con đò vẫn kẹt vì sương mù. Tráng sĩ hãy tìm đủ 4 Hạt Sen Đêm từ Ếch Lửa (hiện có ${seeds}/4).`], q, false);
        }
      } else if (q === 4) {
        const madas = prog.main2_mada ?? 0;
        if (madas >= 5) {
          const step4Def = QUESTS.main2.steps[4];
          this.dialogue(p, npcId, 'Bác Lái Đò', step4Def.dialogue, q, true);
          if (step4Def.reward?.xp) this.gainXp(p, step4Def.reward.xp);
          if (step4Def.reward?.gold) p.prof.gold += step4Def.reward.gold;
          p.prof.quests.main2 = 5;
          this.tell(p, 'Nhận thưởng từ Bác Lái Đò: +180 XP, +60 Vàng!');
          p.meDirty = true; p.saveDirty = true;
        } else {
          this.dialogue(p, npcId, 'Bác Lái Đò', [`Khúc sông Ma còn nhiều Ma Da ẩn nấp (${madas}/5). Hãy cẩn thận khi lội nước!`], q, false);
        }
      } else if (q === 5) {
        this.dialogue(p, npcId, 'Bác Lái Đò', ['Chúa Thuồng Luồng đang trấn giữ Vực Sông Ma phía trên cùng. Hãy cùng đồng đội tiêu diệt hắn đoạt lại Mảnh Trống Đồng 2!'], q, false);
      } else if (q === 6) {
        this.dialogue(p, npcId, 'Bác Lái Đò', ['Thuồng Luồng đã bị hạ rồi, sông nước lại êm ả! Con hãy mau mang Mảnh Trống Đồng 2 về đình làng báo công cho Ông Táo nhé.'], q, false);
      } else {
        this.dialogue(p, npcId, 'Bác Lái Đò', ['Nhờ có con, bến đò Đầm Sen đã bình yên trở lại. Khách thương hồ qua lại ai nấy đều tấm tắc khen ngợi người hùng Lặng Sóng!'], 7, false);
      }
    } else if (npcId === 'tam') {
      const q = p.prof.quests.tam1 ?? 1;
      const def = QUESTS.tam1.steps[q] ?? QUESTS.tam1.steps[1];

      if (q === 1) {
        this.dialogue(p, npcId, 'Cô Tấm', def.dialogue, q, true);
        if (p.prof.quests.tam1 == null) {
          p.prof.quests.tam1 = 1;
          p.meDirty = true; p.saveDirty = true;
        }
      } else if (q === 2) {
        const hasShoe = (p.prof.questProg.tam1_shoe ?? 0) >= 1;
        if (hasShoe) {
          this.dialogue(p, npcId, 'Cô Tấm', def.dialogue, q, true);
          if (def.reward?.xp) this.gainXp(p, def.reward.xp);
          if (def.reward?.gold) p.prof.gold += def.reward.gold;
          if (def.reward?.title) p.prof.title = def.reward.title;
          p.prof.quests.tam1 = 3;
          p.prof.questProg.codex_chan_trau = 1;
          p.prof.questProg.codex_hung_dua = 1;
          this.recalc(p);
          this.tell(p, 'Nhận thưởng từ Cô Tấm: +90 XP, +50 Vàng, danh hiệu [Đoan Trang]!');
          this.tell(p, 'Mở khóa Tranh Đông Hồ "Chăn Trâu Thổi Sáo" & "Hứng Dừa" (+Máu, +Công)!');
          p.meDirty = true; p.saveDirty = true;
        } else {
          this.dialogue(p, npcId, 'Cô Tấm', ['Chàng/Nàng đã thấy chiếc hài thêu của thiếp chưa? Chắc lũ Ếch Lửa đã tha về đầm sen rồi...'], q, false);
        }
      } else {
        this.dialogue(p, npcId, 'Cô Tấm', [
          'Thiếp cảm ơn người nhiều lắm! Bến đò sen ngát hương, chiếc hài thêu đã lại vẹn nguyên.',
          'Người xưa có câu "Cái nết đánh chết cái đẹp", nhưng trang phục chỉnh tề, đoan trang chính là nét văn hóa nghìn năm của cha ông ta.',
        ], 3, false);
      }
    } else if (npcId === 'caothi') {
      this.dialogue(p, npcId, 'Cáo Thị Làng', [
        'CÁO THỊ ĐÌNH LÀNG: Giữ gìn phong tục và trật tự xóm thôn.',
        '1. Nông tang: Giữ nguồn nước ngọt, xua đuổi thủy quái phá hoại mùa vụ.',
        '2. Phong tục: "Miếng trầu là đầu câu chuyện", ghé quán nước đầu đình thưởng thức chén trà và thử tài Đố Vui Dân Gian.',
        '3. Cổ truyền: Thu thập các Mảnh Tranh Khắc Gỗ để hoàn thiện Sổ Tay Tranh Đông Hồ nhận chỉ số vĩnh viễn.',
      ], 1, false);
    } else if (npcId === 'nuoc') {
      this.dialogue(p, npcId, 'Bà Hàng Nước', [
        'Uống bát nước chè xanh mát lành nhé con ơi! "Miếng trầu là đầu câu chuyện, chén trà là nghĩa tri giao".',
        'Bà có bán bình máu bồi bổ (10 vàng) và thu mua vũ khí cũ giá tốt.',
        'Con cũng có thể thử tài trả lời Đố Vui Dân Gian để nhận lời chúc may mắn và hồi phục Khí nhé!',
      ], 1, false);
    } else if (npcId === 'mo') {
      const evt = getTodayMarketEvent(this.now());
      this.dialogue(p, npcId, 'Cô Mơ', [
        'Dạ em chào tráng sĩ! Em là Cô Mơ bán hàng xén ở Chợ Phiên Làng Tre đây ạ.',
        `Hôm nay phiên chợ có sự kiện: "${evt.title}"! ${evt.desc}`,
        'Em bán nông cụ đặc sản: Cần trúc ngà, Bẫy thép cải tiến, Phân trùn quế và Giống lúa Tám Thơm.',
        'Tráng sĩ muốn mua sắm, bán nông sản lấy vàng hay ký gửi hàng hóa lên Chợ Làng thì cứ chọn ở sạp chợ nhé!',
      ], 1, false);
      this.marketGet(p);
    }
  }

  /** Người chơi đứng gần NPC (cùng bản đồ, trong bán kính r). */
  private nearNpc(p: Player, npcId: string, r: number): boolean {
    const npc = NPCS[npcId];
    return !!npc && npc.mapId === this.mapId && dist(p.x, p.y, npc.x, npc.y) <= r;
  }

  private dialogue(p: Player, npcId: string, title: string, lines: string[], step: number, canAdvance = false) {
    this.outbox.push({
      to: p.id,
      msg: { t: 'npc_dialogue', npcId, title, lines, step, canAdvance },
    });
  }

  private handleBuy(p: Player, item: string) {
    const isFarmItem = item === 'giong_te' || item === 'giong_nep' || item === 'ga_con';
    if (!this.nearNpc(p, 'nuoc', 85) && !(this.mapId === 'vuon_nha' && isFarmItem)) {
      this.tell(p, 'Hãy lại gần Bà Hàng Nước');
      return;
    }
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
    } else if (item === 'cui') {
      const bag = this.life(p).bag;
      if (p.prof.gold < CUI_PRICE) { this.tell(p, 'Không đủ vàng'); return; }
      if (!bagCanAdd(bag, 'cui', 1)) { this.tell(p, 'Giỏ Tre đầy'); return; }
      p.prof.gold -= CUI_PRICE;
      bagAdd(bag, 'cui', 1);
      p.meDirty = true; p.saveDirty = true;
      this.tell(p, `Đã mua 1 Cành củi (-${CUI_PRICE} vàng)`);
    } else if (item === 'bay') {
      const bag = this.life(p).bag;
      if (p.prof.gold < BAY_PRICE) { this.tell(p, 'Không đủ vàng'); return; }
      if (!bagCanAdd(bag, 'bay', 1)) { this.tell(p, 'Giỏ Tre đầy'); return; }
      p.prof.gold -= BAY_PRICE;
      bagAdd(bag, 'bay', 1);
      p.meDirty = true; p.saveDirty = true;
      this.tell(p, `Đã mua 1 Bẫy thòng lọng (-${BAY_PRICE} vàng)`);
    } else if (item === 'giong_te') {
      const price = FARM.crops.giong_te.seedCost;
      const bag = this.life(p).bag;
      if (p.prof.gold < price) { this.tell(p, 'Không đủ vàng'); return; }
      if (!bagCanAdd(bag, 'giong_te', 1)) { this.tell(p, 'Giỏ Tre đầy'); return; }
      p.prof.gold -= price;
      bagAdd(bag, 'giong_te', 1);
      p.meDirty = true; p.saveDirty = true;
      this.tell(p, `Đã mua 1 Giống lúa tẻ (-${price} vàng)`);
    } else if (item === 'giong_nep') {
      const price = FARM.crops.giong_nep.seedCost;
      const bag = this.life(p).bag;
      if (p.prof.gold < price) { this.tell(p, 'Không đủ vàng'); return; }
      if (!bagCanAdd(bag, 'giong_nep', 1)) { this.tell(p, 'Giỏ Tre đầy'); return; }
      p.prof.gold -= price;
      bagAdd(bag, 'giong_nep', 1);
      p.meDirty = true; p.saveDirty = true;
      this.tell(p, `Đã mua 1 Giống nếp cái hoa vàng (-${price} vàng)`);
    } else if (item === 'ga_con') {
      const price = FARM.chickCost;
      const bag = this.life(p).bag;
      if (p.prof.gold < price) { this.tell(p, 'Không đủ vàng'); return; }
      if (!bagCanAdd(bag, 'ga_con', 1)) { this.tell(p, 'Giỏ Tre đầy'); return; }
      p.prof.gold -= price;
      bagAdd(bag, 'ga_con', 1);
      p.meDirty = true; p.saveDirty = true;
      this.tell(p, `Đã mua 1 Gà con giống (-${price} vàng)`);
    }
  }

  private handleSell(p: Player, uid: number) {
    if (!this.nearNpc(p, 'nuoc', 85)) { this.tell(p, 'Hãy lại gần Bà Hàng Nước'); return; }
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
      id: this.ids(), def, spawn: sp, x: 0, y: 0, f: 0, hp: 0, dead: false, respawnAt: 0,
      state: 'idle', target: null, nextAtk: 0, wanderAt: 0, wx: sp.x, wy: sp.y,
      dmgBy: new Map(), castUntil: 0, nextSlam: 0,
      stunUntil: 0, slowUntil: 0, slowPct: 0,
    };
    m.x = sp.x; m.y = sp.y; m.hp = def.hp; m.dead = false; m.state = 'idle'; m.target = null;
    m.dmgBy.clear(); m.wx = sp.x; m.wy = sp.y; m.castUntil = 0;
    m.stunUntil = 0; m.slowUntil = 0; m.slowPct = 0; m.taunted = false;
    m.shellUntil = 0; m.nextShell = 0; m.submerged = sp.kind === 'mada';
    m.nextSweep = 0; m.nextWave = 0;
    this.mobs.set(m.id, m);
  }

  /** `critter`: true = chỉ thú rừng, false = chỉ quái dữ, bỏ trống = mọi loại. */
  private nearestMob(x: number, y: number, maxD: number, needSight = true, critter?: boolean): Mob | null {
    let best: Mob | null = null, bd = maxD;
    for (const m of this.mobs.values()) {
      if (m.dead || m.submerged) continue;
      if (critter !== undefined && !!m.def.critter !== critter) continue;
      const d = dist(x, y, m.x, m.y) - m.def.radius;
      if (d > bd) continue;
      if (needSight && d > 40 && !lineOfSight(this.map, x, y, m.x, m.y)) continue;
      bd = d; best = m;
    }
    return best;
  }

  private hitMob(m: Mob, attackerId: number, atk: number, mult: number) {
    if (m.dead || m.submerged) return;
    let { v, crit } = rollDamage(atk, mult, m.def.def, this.rnd);
    if (this.t < (m.shellUntil ?? 0)) {
      v = Math.max(1, Math.round(v * 0.2)); // Cua Đá khép càng: giảm 80% sát thương
    }
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

    if (m.def.critter === 'flee') {
      // thú hiền không đánh lại: giật mình chạy tiếp một lúc
      m.fleeUntil = this.t + 2500;
      if (attacker) m.target = attackerId;
    } else if (m.state === 'idle' && attacker && !attacker.dead) {
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
    } else if (m.def.kind === 'serpent') {
      this.sys(`${m.def.name}: "Hồ Tinh đại nhân... xin tha tội... Mảnh trống thứ hai đã mất..."`);
      this.sys(`${m.def.name} đã bị tiêu diệt${top ? ` bởi ${top.prof.name}` : ''}!`);
    }

    const owner = top?.id ?? null;
    const scatter = () => (this.rnd() - 0.5) * 30;
    const loot = CRITTER_LOOT[m.def.kind];
    if (m.def.critter && loot) {
      // thú rừng: thịt vào thẳng Giỏ Tre của người gây nhiều sát thương nhất, không rơi vàng/vũ khí
      if (top && !top.dead) {
        const qty = 1 + (this.rnd() < HUNT.bonus(this.lifeLv(top, 'hunt')) ? 1 : 0);
        this.huntGain(top, 'hunt', loot.meat, qty, loot.extra, loot.xp);
      }
      return;
    }
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
      } else if (m.def.kind === 'crab') {
        if (p.prof.quests.main2 === 1) {
          const cur = (p.prof.questProg.main2_crab ?? 0) + 1;
          p.prof.questProg.main2_crab = cur;
          this.tell(p, `Diệt Cua Đá (${cur}/10)`);
          if (cur >= 10) {
            p.prof.quests.main2 = 2;
            this.tell(p, 'Đã diệt đủ 10 Cua Đá! Hãy về bến đò báo cho Bác Lái Đò.');
          }
          p.meDirty = true; p.saveDirty = true;
        }
      } else if (m.def.kind === 'frog') {
        if (p.prof.quests.main2 === 2) {
          if (this.rnd() < 0.5) {
            this.addDrop('lotus_seed', 1, m.x + scatter(), m.y + scatter(), p.id);
          }
        }
        if (p.prof.quests.tam1 === 1 && !p.prof.questProg.tam1_shoe) {
          if (this.rnd() < 0.6) {
            this.addDrop('shoe', 1, m.x + scatter(), m.y + scatter(), p.id);
          }
        }
      } else if (m.def.kind === 'mada') {
        if (p.prof.quests.main2 === 3 || p.prof.quests.main2 === 4) {
          const cur = (p.prof.questProg.main2_mada ?? 0) + 1;
          p.prof.questProg.main2_mada = cur;
          this.tell(p, `Trừ Ma Da Sông Ma (${cur}/5)`);
          if (cur >= 5) {
            p.prof.quests.main2 = 5;
            this.tell(p, 'Đã trừ đủ 5 Ma Da! Hãy tiến vào Vực Sông Ma diệt Chúa Thuồng Luồng.');
          }
          p.meDirty = true; p.saveDirty = true;
        }
      } else if (m.def.kind === 'serpent') {
        p.prof.drumPieces = p.prof.drumPieces ?? [];
        if (!p.prof.drumPieces.includes(2)) {
          p.prof.drumPieces.push(2);
          this.tell(p, 'Bạn đã đoạt lại Mảnh Trống Đồng 2 (+5% máu tối đa)!');
        }
        if (p.prof.quests.main2 === 4 || p.prof.quests.main2 === 5) {
          p.prof.quests.main2 = 6;
          this.tell(p, 'Đã hạ Chúa Thuồng Luồng! Hãy mang Mảnh Trống Đồng 2 về cho Ông Táo ở Làng Tre.');
        }
        p.prof.questProg.codex_dam_cuoi_chuot = 1;
        this.recalc(p);
        p.meDirty = true; p.saveDirty = true;
      }
    }
  }

  private addDrop(key: string, qty: number, x: number, y: number, owner: number | null) {
    const id = this.ids();
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
      p.slowUntil = 0;
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

    if (d.critter === 'flee') { this.updateCritter(m, home); return; }

    if (m.state === 'idle') {
      let best: Player | null = null, bd = d.critter === 'neutral' ? 0 : d.aggro; // lợn rừng: chỉ đánh trả khi bị đánh
      for (const p of this.players.values()) {
        if (p.dead || isSafe(this.map, p.x, p.y)) continue;
        const pd = dist(p.x, p.y, m.x, m.y);
        if (pd < bd) { bd = pd; best = p; }
      }
      if (best) {
        if (d.kind === 'mada' && m.submerged) {
          m.castUntil = t + 800;
          this.events.push({ e: 'fx', k: 'ripple', x: m.x, y: m.y, r: 26, ms: 800 });
          this.later(800, () => {
            if (!m.dead) m.submerged = false;
          });
        }
        m.state = 'chase'; m.target = best.id;
        if (d.kind === 'boss' && !m.taunted) {
          m.taunted = true;
          this.sys(`${m.def.name}: "Trống là của ta! Cút về làng mà ăn bánh trôi đi!"`);
        } else if (d.kind === 'serpent' && !m.taunted) {
          m.taunted = true;
          this.sys(`${m.def.name}: "Kẻ nào dám khuấy động Vực Sông Ma? Thủy quái sẽ dìm xác ngươi xuống đáy đầm!"`);
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
        if (d.kind === 'crab') {
          if (m.nextShell == null || m.nextShell < t - 5000) m.nextShell = t + 3000;
          if (t >= m.nextShell) {
            m.nextShell = t + 5000;
            m.shellUntil = t + 1500;
            this.events.push({ e: 'fx', k: 'shell', x: m.x, y: m.y, r: 20, ms: 1500 });
          }
        }
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
        if (d.kind === 'serpent') {
          // 1. Quẫy Đuôi (Sweep): mọi 5.5s, báo trước 900ms, phạm vi 85px
          if (m.nextSweep == null || m.nextSweep < t - BOSS_SERPENT.sweepEvery) m.nextSweep = t + 2000;
          if (t >= m.nextSweep) {
            m.nextSweep = t + BOSS_SERPENT.sweepEvery;
            m.castUntil = t + BOSS_SERPENT.sweepTelegraphMs;
            const cx = m.x, cy = m.y, r = BOSS_SERPENT.sweepRadius, atk = d.atk;
            this.events.push({ e: 'fx', k: 'sweep', x: cx, y: cy, r, ms: BOSS_SERPENT.sweepTelegraphMs });
            this.later(BOSS_SERPENT.sweepTelegraphMs, () => {
              if (m.dead) return;
              this.events.push({ e: 'fx', k: 'boom', x: cx, y: cy, r });
              for (const q of this.players.values()) {
                if (dist(q.x, q.y, cx, cy) <= r + PLAYER_RADIUS) {
                  this.hitPlayer(q, atk, BOSS_SERPENT.sweepMult);
                }
              }
            });
            return;
          }

          // 2. Sóng Dữ (Tidal Surge): khi máu <= 50%, mỗi 8.5s tỏa vòng nước dữ dội
          if (m.hp <= d.hp * 0.5) {
            if (m.nextWave == null || m.nextWave < t - BOSS_SERPENT.waveEvery) m.nextWave = t + 1000;
            if (t >= m.nextWave) {
              m.nextWave = t + BOSS_SERPENT.waveEvery;
              const cx = m.x, cy = m.y, r = BOSS_SERPENT.waveRadius, atk = d.atk;
              this.events.push({ e: 'fx', k: 'wave', x: cx, y: cy, r, ms: 1000 });
              for (const q of this.players.values()) {
                if (dist(q.x, q.y, cx, cy) <= r + PLAYER_RADIUS) {
                  this.hitPlayer(q, atk, BOSS_SERPENT.waveMult);
                  q.slowUntil = t + 2500;
                }
              }
            }
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
          if (d.kind === 'frog') {
            const invD = pd > 0.001 ? 1 / pd : 1;
            this.spawnMobProj(m, 'fireball', (p.x - m.x) * invD, (p.y - m.y) * invD, d.atk, 160, 240);
          } else {
            this.hitPlayer(p, d.atk, 1);
            if (d.kind === 'mada') {
              p.slowUntil = t + 2000;
            }
          }
        }
        return;
      }
    }

    // return: chạy về và hồi máu
    this.moveMob(m, m.spawn.x, m.spawn.y, d.speed * 1.4);
    m.hp = Math.min(d.hp, m.hp + d.hp * 0.05);
    if (dist(m.x, m.y, m.spawn.x, m.spawn.y) < 8) {
      m.state = 'idle'; m.hp = d.hp; m.dmgBy.clear();
      if (d.kind === 'mada') m.submerged = true;
    }
  }

  /**
   * Thú hiền (thỏ, gà rừng, le le): thấy người lại gần thì bỏ chạy, không bao giờ đánh trả.
   * Chạy ~1.6s thì đuối sức đứng thở ~0.9s, để cả cận chiến cũng đuổi kịp; chạy quá xa thì vòng về tổ.
   */
  private updateCritter(m: Mob, home: number) {
    const t = this.t, d = m.def;
    let threat: Player | null = null, bd = d.aggro;
    for (const p of this.players.values()) {
      if (p.dead) continue;
      const pd = dist(p.x, p.y, m.x, m.y);
      if (pd < bd) { bd = pd; threat = p; }
    }
    if (!threat && t < (m.fleeUntil ?? 0) && m.target != null) {
      const p = this.players.get(m.target);
      if (p && !p.dead) threat = p;
    }
    if (!threat) {
      m.runSince = 0;
      // yên ổn một lúc thì lành vết thương, quên kẻ đã đánh
      if (m.hp < d.hp && t > (m.fleeUntil ?? 0) + 6000) { m.hp = d.hp; m.dmgBy.clear(); m.target = null; }
      if (t >= m.wanderAt) {
        m.wanderAt = t + 1500 + this.rnd() * 3000;
        m.wx = m.spawn.x + (this.rnd() - 0.5) * 90;
        m.wy = m.spawn.y + (this.rnd() - 0.5) * 90;
      }
      this.moveMob(m, m.wx, m.wy, d.speed * 0.3);
      return;
    }
    if (t < (m.restUntil ?? 0)) return; // đang thở dốc
    if (!m.runSince) m.runSince = t;
    if (t - m.runSince > 1600) { m.restUntil = t + 900; m.runSince = 0; return; }
    let ax = m.x - threat.x, ay = m.y - threat.y;
    const al = Math.hypot(ax, ay) || 1;
    ax /= al; ay /= al;
    if (home > d.leash * 0.6) {
      // chạy xa tổ quá thì bẻ lái vòng về
      const w = Math.min(1, (home - d.leash * 0.6) / (d.leash * 0.4));
      ax = ax * (1 - w) + ((m.spawn.x - m.x) / home) * w;
      ay = ay * (1 - w) + ((m.spawn.y - m.y) / home) * w;
    }
    const ox = m.x, oy = m.y;
    this.moveMob(m, m.x + ax * 40, m.y + ay * 40, d.speed);
    if (dist(ox, oy, m.x, m.y) < 0.5) {
      // vướng tường/bụi: lách sang ngang
      const s = m.id % 2 ? 1 : -1;
      this.moveMob(m, m.x - ay * 40 * s, m.y + ax * 40 * s, d.speed);
    }
  }

  // ------------------------------------------------------------ đạn

  private spawnProj(
    p: Player, attack: 'arrow' | 'bolt', dx: number, dy: number,
    targetMobId: number | null, mult: number, aoe: number, maxDist: number,
  ) {
    const id = this.ids();
    const speed = p.stats.shotSpeed || 360;
    this.projs.set(id, {
      id, k: attack, owner: p.id, atk: p.stats.atk, mult, aoe,
      x: p.x, y: p.y, speed, dx, dy, target: targetMobId,
      ttl: Math.round((maxDist / speed) * 1000),
    });
  }

  private spawnMobProj(
    m: Mob, attack: 'fireball', dx: number, dy: number,
    atk: number, speed: number, maxDist: number,
  ) {
    const id = this.ids();
    this.projs.set(id, {
      id, k: attack, owner: m.id, isMob: true, atk, mult: 1, aoe: 0,
      x: m.x, y: m.y, speed, dx, dy, target: null,
      ttl: Math.round((maxDist / speed) * 1000),
    });
  }

  private explode(pr: Proj, x: number, y: number) {
    this.events.push({ e: 'fx', k: 'boom', x, y, r: pr.aoe });
    for (const m of this.mobs.values()) {
      if (m.dead || m.submerged) continue;
      if (dist(x, y, m.x, m.y) <= pr.aoe + m.def.radius) this.hitMob(m, pr.owner, pr.atk, pr.mult);
    }
  }

  private updateProj(pr: Proj) {
    const dt = TICK_MS / 1000;
    if (pr.target != null) {
      const m = this.mobs.get(pr.target);
      if (m && !m.dead && !m.submerged) {
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
        else if (pr.isMob) this.events.push({ e: 'fx', k: 'boom', x: pr.x, y: pr.y, r: 10 });
        this.projs.delete(pr.id);
        return;
      }
      if (pr.isMob) {
        for (const p of this.players.values()) {
          if (p.dead || isSafe(this.map, p.x, p.y) || dist(pr.x, pr.y, p.x, p.y) > PLAYER_RADIUS + 6) continue;
          this.hitPlayer(p, pr.atk, 1);
          this.events.push({ e: 'fx', k: 'boom', x: pr.x, y: pr.y, r: 14 });
          this.projs.delete(pr.id);
          return;
        }
      } else {
        for (const m of this.mobs.values()) {
          if (m.dead || m.submerged || dist(pr.x, pr.y, m.x, m.y) > m.def.radius + 5) continue;
          if (pr.aoe > 0) this.explode(pr, pr.x, pr.y);
          else this.hitMob(m, pr.owner, pr.atk, pr.mult);
          this.projs.delete(pr.id);
          return;
        }
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
      if (resetCount) { p.msgCount = 0; this.updateFood(p); }

      // 1) Input: token bucket => tối đa 1 gói/tick trung bình (chống speedhack)
      p.bucket = Math.min(3, p.bucket + 1);
      while (p.bucket >= 1 && p.queue.length) {
        const inp = p.queue.shift()!;
        p.bucket--;
        p.ack = Math.max(p.ack, inp.seq);
        if (p.dead) continue;
        if (p.stall && (Math.abs(inp.x) > 0.05 || Math.abs(inp.y) > 0.05 || inp.dash)) {
          p.stall = null;
          p.meDirty = true;
          this.tell(p, 'Bạn đã rời vị trí, sạp hàng đã được gập lại.');
        }
        const canDash = t >= p.dashReady;
        const effSpeed = t < p.slowUntil ? p.stats.speed * 0.6 : p.stats.speed;
        if (applyInput(this.map, p, inp, effSpeed, canDash)) {
          const spdLv = p.prof.skills?.passives?.spd ?? 0;
          const dashCd = Math.max(1200, DASH_CD - spdLv * 100);
          p.dashReady = t + dashCd;
          p.iframeUntil = t + DASH_IFRAME_MS;
          p.meDirty = true;
        }
      }

      // 1b) Qua cổng sang bản đồ khác (Realm thực hiện chuyển sau tick)
      if (!p.dead && t >= p.portalReadyAt) {
        const portal = portalAt(this.map, p.x, p.y);
        if (portal) {
          if (portal.need && (p.prof.quests?.[portal.need] ?? 1) < 5) {
            if (t - p.portalMsgAt > 3000) {
              p.portalMsgAt = t;
              this.tell(p, 'Cổng còn khoá. Hãy giúp Ông Táo lấy lại Mảnh Trống Đồng 1 trước đã.');
            }
          } else {
            p.portalReadyAt = Number.POSITIVE_INFINITY; // chờ Realm chuyển, không xin chuyển lần nữa
            this.transfers.push({ id: p.id, to: portal.to, x: portal.tx, y: portal.ty });
          }
        }
      }

      // 1c) Nghề Sống: phao chìm / nồi chín (chết, bị đánh, rời chỗ là bỏ dở)
      if (p.fish) this.updateFishing(p);
      if (p.cooking) this.updateCooking(p);

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

      // 4) Tự đánh thường mục tiêu gần nhất trong tầm (ưu tiên quái dữ hơn thú rừng; đang câu/nấu thì thôi)
      if (t >= p.nextAtk && !p.fish && !p.cooking && !isSafe(this.map, p.x, p.y)) {
        const m = this.nearestMob(p.x, p.y, p.stats.range, true, false) ?? this.nearestMob(p.x, p.y, p.stats.range, true, true);
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
        const ultLv = p.prof.skills?.ultLv ?? 1;
        const ultMult = CLASS_SKILL_TREES.mage.ult.levels[ultLv - 1]?.mult ?? 0.8;
        for (const m of this.mobs.values()) {
          if (m.dead || dist(p.x, p.y, m.x, m.y) > r + m.def.radius) continue;
          const lastHit = p.vortexCooldowns.get(m.id) ?? 0;
          if (t - lastHit >= 500) {
            p.vortexCooldowns.set(m.id, t);
            m.slowUntil = Math.max(m.slowUntil, t + 1500);
            m.slowPct = 0.4;
            this.hitMob(m, p.id, p.stats.atk, ultMult);
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

    // lửa trại tàn
    for (const f of [...this.fires.values()]) if (t >= f.until) this.fires.delete(f.id);
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
    if (dr.key === 'lotus_seed') {
      const prog = p.prof.questProg ?? (p.prof.questProg = {});
      const cur = (prog.main2_seed ?? 0) + dr.qty;
      prog.main2_seed = cur;
      this.tell(p, `Nhặt được Hạt Sen Đêm (${cur}/4)`);
      if (cur >= 4 && p.prof.quests?.main2 === 2) {
        p.prof.quests.main2 = 3;
        this.tell(p, 'Đã thu thập đủ 4 Hạt Sen Đêm! Hãy đem về cho Bác Lái Đò.');
      }
      p.meDirty = true; p.saveDirty = true;
      return true;
    }
    if (dr.key === 'shoe') {
      const prog = p.prof.questProg ?? (p.prof.questProg = {});
      prog.tam1_shoe = 1;
      if (p.prof.quests?.tam1 === 1) {
        p.prof.quests.tam1 = 2;
      }
      this.tell(p, 'Nhặt được Chiếc Hài Thêu! Hãy đem về cho Cô Tấm.');
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
    const now = this.now();
    const life = this.life(p);
    const today = vnDay(now);

    // Cập nhật tiến độ nông trại và chuồng gà của chính mình
    if (life.farm) {
      updateFarmPlots(life.farm.plots, now, this.rnd);
      updateFarmChickens(life.farm, now, this.rnd);
    }

    let visitFarm: FarmVisitSelf | null = null;
    if (p.visitingFarm) {
      const target = this.findTargetFarm(p.visitingFarm);
      if (target) {
        updateFarmPlots(target.farm.plots, now, this.rnd);
        updateFarmChickens(target.farm, now, this.rnd);
        visitFarm = {
          ownerName: target.player?.prof.name ?? p.visitingFarm,
          farmLv: target.farmLv,
          plots: target.farm.plots.map((pl) => ({ ...pl })),
          chickens: target.farm.chickens.map((c) => ({ ...c })),
          troughFood: target.farm.troughFood,
          eggs: target.farm.eggs,
          goldenEggs: target.farm.goldenEggs,
          manure: target.farm.manure,
          likes: target.farm.likes,
          cheers: [...target.farm.cheers],
        };
      } else {
        p.visitingFarm = null;
      }
    }

    return {
      lv: p.prof.level, xp: p.prof.xp, next: xpToNext(p.prof.level), gold: p.prof.gold,
      inv: p.prof.inv.map((i) => ({ ...i })), weapon: p.prof.weapon,
      stats: { maxHp: p.stats.maxHp, atk: p.stats.atk, def: p.stats.def, range: p.stats.range, speed: p.stats.speed },
      cd: {
        skill: Math.max(0, p.skillReady - t),
        dash: Math.max(0, p.dashReady - t),
        potion: Math.max(0, p.potionReady - t),
      },
      skillCd: CLASS_SKILL_TREES[p.prof.cls].main.levels[(p.prof.skills?.mainLv ?? 1) - 1]?.cd ?? CLASSES[p.prof.cls].skill.cd,
      skills: p.prof.skills,
      khi: Math.round(p.khi),
      drumPieces: p.prof.drumPieces ?? [],
      quests: p.prof.quests ?? { main1: 1 },
      questProg: p.prof.questProg ?? {},
      title: p.prof.title ?? '',
      life: {
        xp: { ...life.xp },
        bag: { ...life.bag },
        buff: life.buff && life.buff.until > now ? { key: life.buff.key, left: life.buff.until - now } : undefined,
        soldToday: life.sold?.day === today ? life.sold.gold : 0,
        best: life.best,
        triviaDone: life.trivia?.day === today ? [...life.trivia.done] : [],
        traps: (life.traps ?? []).map((tr) => ({ id: tr.id, map: tr.map, x: tr.x, y: tr.y, left: Math.max(0, tr.readyAt - now) })),
        farm: {
          plots: life.farm!.plots.map((pl) => ({ ...pl })),
          chickens: life.farm!.chickens.map((c) => ({ ...c })),
          troughFood: life.farm!.troughFood,
          troughUntil: life.farm!.troughUntil,
          eggs: life.farm!.eggs,
          goldenEggs: life.farm!.goldenEggs,
          manure: life.farm!.manure,
          likes: life.farm!.likes,
          cheers: [...life.farm!.cheers],
          lastUpdate: life.farm!.lastUpdate,
        },
      },
      visitFarm,
      onlineFarmers: this.onGetOnlineFarmers ? this.onGetOnlineFarmers() : undefined,
      marketEarnings: this.market?.getPendingEarnings(p.prof.token) ?? 0,
    };
  }

  /** Tạo snapshot cho từng người chơi rồi xoá hàng đợi sự kiện. */
  buildSnapshots(): Outgoing[] {
    const ps: PlayerSnap[] = [...this.players.values()].map((p) => ({
      id: p.id, n: p.prof.name, c: p.prof.cls, x: Math.round(p.x), y: Math.round(p.y),
      f: Math.round(p.f * 100) / 100, hp: Math.ceil(p.hp), mh: p.stats.maxHp, lv: p.prof.level,
      dead: p.dead ? 1 : 0, w: p.prof.weapon,
      slow: this.t < p.slowUntil ? (1 as const) : undefined,
      fb: p.fish ? [p.fish.bx, p.fish.by, p.fish.bitten ? 1 : 0] as [number, number, 0 | 1] : undefined,
      ck: p.cooking ? (1 as const) : undefined,
      stall: p.stall?.open ? (p.stall.name || 'Sạp Hàng') : undefined,
    }));
    const ms: MobSnap[] = [];
    for (const m of this.mobs.values()) {
      if (m.dead) continue;
      const stun = this.t < m.stunUntil ? (1 as const) : undefined;
      const slow = this.t < m.slowUntil ? (1 as const) : undefined;
      const sh = this.t < (m.shellUntil ?? 0) ? (1 as const) : undefined;
      const sub = m.submerged ? (1 as const) : undefined;
      ms.push({
        id: m.id, k: m.def.kind, x: Math.round(m.x), y: Math.round(m.y),
        hp: Math.ceil(m.hp), mh: m.def.hp, f: Math.round(m.f * 100) / 100,
        stun, slow, sh, sub,
      });
    }
    const pr = [...this.projs.values()].map((q) => ({ id: q.id, k: q.k, x: Math.round(q.x), y: Math.round(q.y) }));
    const d = [...this.drops.values()].map((q) => {
      const w = WEAPONS[q.key];
      return w ? { id: q.id, k: q.key, x: Math.round(q.x), y: Math.round(q.y), r: w.rarity } : { id: q.id, k: q.key, x: Math.round(q.x), y: Math.round(q.y) };
    });

    const cf: FireSnap[] = [...this.fires.values()].map((f) => ({ id: f.id, x: f.x, y: f.y }));

    const out: Outgoing[] = [];
    for (const p of this.players.values()) {
      out.push({ to: p.id, msg: { t: 'snap', st: this.t, ack: p.ack, p: ps, m: ms, pr, d, ...(cf.length ? { cf } : {}), ev: [...this.events, ...p.personal] } });
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
