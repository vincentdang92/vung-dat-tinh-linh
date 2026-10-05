import Phaser from 'phaser';
import { buildMap, WORLD_W, WORLD_H } from '../../../shared/map.ts';
import type { GameMap, MapId } from '../../../shared/map.ts';
import { INTERP_DELAY_MS, TICK_MS, DASH_CD, SNAP_EVERY, PLAYER_RADIUS, TILE } from '../../../shared/constants.ts';
import { CLASSES, MONSTERS, RARITY_COLOR } from '../../../shared/data.ts';
import type { ClassId } from '../../../shared/data.ts';
import { applyInput } from '../../../shared/protocol.ts';
import type { InputMsg, MoveState, ServerMsg, PlayerSnap, MobSnap, ProjSnap, DropSnap, GameEvent, SelfState, FireSnap } from '../../../shared/protocol.ts';
import { fishSpotAt, COOK_RANGE, HUNT, trapSpotOk, lifeLevel } from '../../../shared/life.ts';
import { makeMapTexture, makeTextures } from './textures.ts';
import type { Net } from '../net.ts';
import { store, controls } from '../state.ts';
import { marketGet } from '../actions.ts';
import { NPCS } from '../../../shared/story.ts';
import { ensureHeroSheet, heroAnimKey, npcAnimKey } from './sprites/sheet.ts';
import { FRAME, FEET_ROW } from './sprites/heroes.ts';
import type { Dir, HeroAnim } from './sprites/heroes.ts';
import { NPC_PROPS } from './sprites/npcs.ts';
import type { NpcId } from './sprites/npcs.ts';

type SnapMsg = Extract<ServerMsg, { t: 'snap' }>;

interface Buffered {
  st: number;
  p: Map<number, PlayerSnap>;
  m: Map<number, MobSnap>;
  pr: Map<number, ProjSnap>;
  d: DropSnap[];
  ev: GameEvent[];
  fired: boolean;
}

/** Trạng thái hoạt ảnh của nhân vật pixel art (chọn hướng, đi/đứng/đánh, đổi sheet khi đổi vũ khí). */
interface HeroState {
  sprite: Phaser.GameObjects.Sprite;
  weapon: string;
  texKey: string;
  animKey: string;
  movingUntil: number;
  attackUntil: number;
  atkAng: number;
  talismans: Phaser.GameObjects.Image[]; // bùa bay quanh Đạo sĩ
}

interface UnitView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  bar: Phaser.GameObjects.Graphics;
  label?: Phaser.GameObjects.Text;
  lastHp: number;
  lastMh: number;
  x: number;
  y: number;
  hero?: HeroState;
  stallGfx?: Phaser.GameObjects.Graphics;
  stallLabel?: Phaser.GameObjects.Text;
}

interface NpcView {
  id: NpcId;
  sprite: Phaser.GameObjects.Sprite;
  marker: Phaser.GameObjects.Text;
  talking: boolean;
  markerKey: string;
}

/** Chân nhân vật/NPC trong khung 48×48 (hàng ngay dưới đế giày). */
const FEET_ORIGIN = (FEET_ROW + 1) / FRAME;
const MARKER_Y = -70;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Góc hướng mặt -> hướng sprite; nhìn trái = lật sprite nhìn phải. Đường chéo ưu tiên nhìn ngang. */
function facing(f: number): { dir: Dir; flip: boolean } {
  const c = Math.cos(f), s = Math.sin(f);
  if (Math.abs(c) >= Math.abs(s) * 0.9) return { dir: 'side', flip: c < 0 };
  return { dir: s > 0 ? 'down' : 'up', flip: false };
}

/** Dấu nhiệm vụ trên đầu NPC: "!" vàng = có việc mới, "?" vàng = có thể trả, "?" xám = đang làm. */
function questMarker(id: NpcId, me: SelfState | null): { text: string; color: string } | null {
  if (!me) return null;
  const ready = (text: string) => ({ text, color: '#facc15' });
  const waiting = { text: '?', color: '#cbd5e1' };
  const qs = me.quests ?? {};
  const prog = me.questProg ?? {};
  if (id === 'tao') {
    if (qs.main2 === 6 && me.drumPieces?.includes(2)) return ready('?');
    const q = qs.main1 ?? 1;
    if (q === 1) return (prog.main1 ?? 0) === 0 ? ready('!') : waiting;
    if (q === 2) return (prog.main1 ?? 0) >= 8 ? ready('?') : waiting;
    if (q === 3) return (prog.main1_leaf ?? 0) >= 3 ? ready('?') : waiting;
    if (q === 4) return me.drumPieces?.includes(1) ? ready('?') : waiting;
    return null;
  }
  if (id === 'cuoi') {
    const q = qs.cuoi1;
    if (q == null) return ready('!');
    if (q === 1) return waiting;
    if (q === 2) return ready('?');
  }
  if (id === 'do') {
    const q = qs.main2;
    if (q == null) return ready('!');
    if (q === 1) return (prog.main2_crab ?? 0) >= 10 ? ready('?') : waiting;
    if (q === 2) return ready('?');
    if (q === 3) return (prog.main2_seed ?? 0) >= 4 ? ready('?') : waiting;
    if (q === 4) return (prog.main2_mada ?? 0) >= 5 ? ready('?') : waiting;
    if (q === 5) return me.drumPieces?.includes(2) ? ready('?') : waiting;
    if (q === 6) return waiting;
  }
  if (id === 'tam') {
    const q = qs.tam1;
    if (q == null) return ready('!');
    if (q === 1) return prog.tam1_shoe ? ready('?') : waiting;
    if (q === 2) return ready('?');
  }
  if (id === 'caothi') return { text: '📜', color: '#fde047' };
  if (id === 'nuoc') return { text: '🍵', color: '#86efac' };
  if (id === 'mo') return { text: '🏮', color: '#f472b6' };
  return null;
}

export class WorldScene extends Phaser.Scene {
  private net!: Net;
  private map!: GameMap;
  private snaps: Buffered[] = [];
  private offset: number | null = null; // serverTime - clientTime
  // Độ trễ nội suy tự co giãn theo độ dao động mạng (qua Cloudflare Tunnel gói đến không đều)
  private jitter = 0;
  private interpDelay = INTERP_DELAY_MS;
  private interpTarget = INTERP_DELAY_MS;

  private players = new Map<number, UnitView>();
  private mobs = new Map<number, UnitView>();
  private projs = new Map<number, { img: Phaser.GameObjects.Image; x: number; y: number }>();
  private drops = new Map<number, Phaser.GameObjects.Image>();
  private npcViews: NpcView[] = [];
  // Nghề Sống: lửa trại, dây câu + phao, khói bếp
  private fires = new Map<number, Phaser.GameObjects.Container>();
  private fireList: FireSnap[] = [];
  private lineGfx!: Phaser.GameObjects.Graphics;
  private steamAt = new Map<number, number>();
  // Bẫy thòng lọng của mình (chỉ mình thấy)
  private trapViews = new Map<number, { c: Phaser.GameObjects.Container; set: Phaser.GameObjects.Graphics; sprung: Phaser.GameObjects.Graphics; mark: Phaser.GameObjects.Text; ready: boolean | null }>();
  // Canh Nông: 8 ô ruộng lúa, chuồng gà và ổ trứng
  private plotViews: { root: Phaser.GameObjects.Container; gfx: Phaser.GameObjects.Graphics; mark: Phaser.GameObjects.Text; key: string }[] = [];
  private chickenViews: { root: Phaser.GameObjects.Container; body: Phaser.GameObjects.Graphics; tx: number; ty: number; nextWalk: number }[] = [];
  private nestGfx?: Phaser.GameObjects.Graphics;
  private lastLowFreqSync = 0;

  // dự đoán phía client cho nhân vật của mình
  private pred: MoveState | null = null;
  private prevPred: MoveState | null = null;
  private pending: InputMsg[] = [];
  private inputAcc = 0;
  private visOff = { x: 0, y: 0 };
  private myCls: ClassId = 'warrior';
  private myDead = false;
  private mySlow = false;

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() { super('world'); }

  private mapId: MapId = 'lang_tre';

  init(data: { net: Net; mapId: MapId }) { this.net = data.net; this.mapId = data.mapId; }

  create() {
    this.map = buildMap(this.mapId);
    makeTextures(this);
    const mapKey = makeMapTexture(this, this.map);
    this.add.image(0, 0, mapKey).setOrigin(0, 0).setDepth(-10);

    // Biển chỉ đường ở cổng sang bản đồ khác
    for (const pt of this.map.portals) {
      const cx = pt.x + pt.w / 2, cy = pt.y + pt.h / 2;
      const sx = Phaser.Math.Clamp(cx, 46, WORLD_W - 46);
      this.add.text(sx, pt.y - 10, pt.label, {
        fontFamily: 'system-ui, sans-serif', fontSize: '11px', fontStyle: 'bold',
        color: '#fde68a', stroke: '#2B1E3A', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(cy + 1000);
      const glow = this.add.ellipse(cx, cy, pt.w + 14, pt.h + 6, 0xfacc15, 0.18).setDepth(-5);
      this.tweens.add({ targets: glow, alpha: { from: 0.08, to: 0.3 }, duration: 900, yoyo: true, repeat: -1 });
    }

    // Vẽ các NPC của bản đồ này: sprite pixel art, đồ vật đi kèm, tên + danh hiệu và dấu nhiệm vụ
    for (const npc of Object.values(NPCS)) {
      if (npc.mapId !== this.mapId) continue;
      const id = npc.id as NpcId;
      const container = this.add.container(npc.x, npc.y).setDepth(npc.y);
      const shadow = this.add.image(0, 6, 'shadow').setScale(0.9).setAlpha(0.6);
      const sprite = this.add.sprite(0, 6, `npc_${id}`, 'idle_0').setOrigin(0.5, FEET_ORIGIN);
      sprite.play({ key: npcAnimKey(id, 'idle'), startFrame: Phaser.Math.Between(0, 3) });
      const label = this.add.text(0, -44, npc.name, {
        fontFamily: 'system-ui, sans-serif', fontSize: '11px', fontStyle: 'bold',
        color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5);
      const title = this.add.text(0, -56, npc.title, {
        fontFamily: 'system-ui, sans-serif', fontSize: '9px',
        color: '#facc15', stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5);
      const marker = this.add.text(0, MARKER_Y, '', {
        fontFamily: 'system-ui, sans-serif', fontSize: '18px', fontStyle: 'bold',
        color: '#facc15', stroke: '#2B1E3A', strokeThickness: 4,
      }).setOrigin(0.5);
      container.add([shadow, sprite, label, title, marker]);

      const prop = NPC_PROPS[id];
      const ps = this.add.sprite(npc.x + prop.dx, npc.y + prop.dy, prop.key, 'f0').setOrigin(0.5, 1).setDepth(npc.y + prop.dy);
      if (prop.frames > 1) ps.play(`${prop.key}:loop`);
      this.npcViews.push({ id, sprite, marker, talking: false, markerKey: '' });
    }

    // Hiệu ứng đom đóm & bụi phấn vàng thanh bình cho Vườn Nhà
    if (this.mapId === 'vuon_nha') {
      for (let i = 0; i < 20; i++) {
        const fx = Phaser.Math.Between(4 * TILE, 28 * TILE);
        const fy = Phaser.Math.Between(10 * TILE, 50 * TILE);
        const firefly = this.add.circle(fx, fy, Phaser.Math.Between(1.5, 2.5), 0xfef08a, 0.65).setDepth(fy + 50);
        this.tweens.add({
          targets: firefly,
          x: fx + Phaser.Math.Between(-30, 30),
          y: fy + Phaser.Math.Between(-25, 25),
          alpha: { from: 0.2, to: 0.85 },
          duration: Phaser.Math.Between(2500, 4500),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setBackgroundColor('#1d2b1a');

    if (this.input.keyboard) {
      this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,Q,E,R', false) as Record<string, Phaser.Input.Keyboard.Key>;
      // bỏ qua phím khi đang gõ chat
      const typing = () => document.activeElement instanceof HTMLInputElement;
      this.input.keyboard.on('keydown-Q', () => { if (!typing()) window.dispatchEvent(new Event('rpg:skill')); });
      this.input.keyboard.on('keydown-R', () => { if (!typing()) window.dispatchEvent(new Event('rpg:ult')); });
      this.input.keyboard.on('keydown-E', () => { if (!typing()) window.dispatchEvent(new Event('rpg:potion')); });
      this.input.keyboard.on('keydown-SPACE', () => { if (!typing()) controls.dash = true; });
      this.input.keyboard.on('keydown-F', () => { if (!typing()) window.dispatchEvent(new Event('rpg:fish')); });
    }

    this.lineGfx = this.add.graphics().setDepth(4000);
    this.net.onSnap = (s) => this.onSnap(s);
  }

  // ---------------------------------------------------------------- mạng

  private onSnap(s: SnapMsg) {
    const now = performance.now();
    const o = s.st - now;
    // o = serverTime - clientTime - độ trễ gói. Gói đến nhanh nhất cho o LỚN nhất, nên lấy max
    // (hạ dần rất chậm để theo kịp lệch đồng hồ). Trước đây lấy min = bám theo gói chậm nhất,
    // một lần lag là hình bị trễ thêm cả phút mới hồi lại.
    this.offset = this.offset == null ? o : Math.max(o, this.offset - 0.2);
    // gói này đến muộn hơn gói nhanh nhất bao nhiêu ms: bắt đỉnh ngay, hạ dần (~5 giây)
    const late = this.offset - o;
    this.jitter = late > this.jitter ? late : this.jitter * 0.98 + late * 0.02;
    const snapGap = TICK_MS * SNAP_EVERY;
    // Khống chế trần độ trễ nội suy tối đa 220ms (thay vì 500ms) để không bị cảm giác delay nửa giây
    this.interpTarget = Phaser.Math.Clamp(snapGap + this.jitter + 15, 100, 220);

    this.snaps.push({
      st: s.st,
      p: new Map(s.p.map((q) => [q.id, q])),
      m: new Map(s.m.map((q) => [q.id, q])),
      pr: new Map(s.pr.map((q) => [q.id, q])),
      d: s.d,
      ev: s.ev,
      fired: false,
    });
    if (this.snaps.length > 16) this.snaps.shift();

    this.syncDrops(s.d);
    this.syncFires(s.cf ?? []);

    const myId = store.get().myId;
    const mine = s.p.find((p) => p.id === myId);
    if (!mine) return;
    this.myCls = mine.c;
    const wasDead = this.myDead;
    this.myDead = !!mine.dead;
    this.mySlow = !!mine.slow;

    if (!this.pred || this.myDead || wasDead) {
      this.pred = { x: mine.x, y: mine.y, f: mine.f };
      this.prevPred = { ...this.pred };
      this.pending = [];
      this.visOff = { x: 0, y: 0 };
      return;
    }

    // Đối chiếu: lấy vị trí server, bỏ input đã xác nhận, chạy lại phần chưa xác nhận
    const old = { x: this.pred.x, y: this.pred.y };
    const p: MoveState = { x: mine.x, y: mine.y, f: this.pred.f };
    this.pending = this.pending.filter((i) => i.seq > s.ack);
    const speed = this.mySpeed();
    for (const i of this.pending) applyInput(this.map, p, i, speed, !!i.dash);
    this.pred = p;
    const ex = old.x - p.x, ey = old.y - p.y;
    if (Math.hypot(ex, ey) < 80) {
      this.visOff.x += ex; this.visOff.y += ey;
      if (this.prevPred) { this.prevPred.x -= ex; this.prevPred.y -= ey; }
    } else {
      this.visOff = { x: 0, y: 0 };
      this.prevPred = { ...p };
    }
  }

  private stepInput() {
    if (!this.pred || this.myDead) { controls.dash = false; return; }
    // Luôn dời mốc nội suy mỗi tick, kể cả khi đứng yên. Nếu không, lúc dừng lại
    // nhân vật cứ nhảy qua lại giữa 2 vị trí cuối (giật tại chỗ).
    this.prevPred = { ...this.pred };
    let x = controls.x, y = controls.y;
    const k = this.keys;
    if (k && !(document.activeElement instanceof HTMLInputElement)) {
      const kx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
      const ky = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
      if (kx || ky) { const l = Math.hypot(kx, ky); x = kx / l; y = ky / l; }
    }
    const now = performance.now();
    let dash = controls.dash;
    controls.dash = false;
    if (dash && now < store.get().readyAt.dash) dash = false;
    const moving = Math.hypot(x, y) > 0.05;
    if (this.pred) {
      const px = this.pred.x, py = this.pred.y;
      const near = Object.values(NPCS).find((n) => n.mapId === this.mapId && Math.hypot(px - n.x, py - n.y) < 65);
      const st = store.get();
      if ((near?.id ?? null) !== st.nearNpc) {
        store.set({ nearNpc: near ? near.id : null });
      }
      // Nghề Sống: đứng sát mép nước thì thả câu được; cạnh Bếp Ông Táo / lửa trại thì nấu được
      const nearWater = !!fishSpotAt(this.map, px, py, PLAYER_RADIUS);
      const tao = NPCS.tao;
      let cookPlace: 'bep' | 'fire' | null = null;
      if (tao && tao.mapId === this.mapId && Math.hypot(px - tao.x, py - tao.y) <= COOK_RANGE + 20) cookPlace = 'bep';
      else if (this.mapId === 'vuon_nha' && py >= 38 * TILE && py <= 45 * TILE && px >= 13 * TILE && px <= 23 * TILE) cookPlace = 'bep';
      else if (this.fireList.some((f) => Math.hypot(px - f.x, py - f.y) <= COOK_RANGE)) cookPlace = 'fire';
      if (nearWater !== st.nearWater || cookPlace !== st.cookPlace) store.set({ nearWater, cookPlace });

      // Săn bắt: đứng cạnh bẫy của mình thì thu/gỡ; bãi cỏ ngoài làng (có bẫy trong giỏ) thì đặt được
      const life = st.me?.life;
      const traps = life?.traps ?? [];
      let nearTrap: { id: number; ready: boolean } | null = null;
      for (const tr of traps) {
        if (tr.map === this.mapId && Math.hypot(px - tr.x, py - tr.y) <= HUNT.trapReach + PLAYER_RADIUS - 4) {
          nearTrap = { id: tr.id, ready: now >= (st.trapReady[tr.id] ?? 0) };
          break;
        }
      }
      const canTrap = !nearTrap && (life?.bag.bay ?? 0) > 0
        && traps.length < HUNT.trapCount(lifeLevel(life?.xp.hunt ?? 0))
        && trapSpotOk(this.map, px, py)
        && !traps.some((tr) => tr.map === this.mapId && Math.hypot(px - tr.x, py - tr.y) < HUNT.trapGap);
      if (nearTrap?.id !== st.nearTrap?.id || nearTrap?.ready !== st.nearTrap?.ready || canTrap !== st.canTrap) {
        store.set({ nearTrap, canTrap });
      }
    }

    if (!moving && !dash) return;

    const inp: InputMsg = { t: 'in', seq: ++this.net.seq, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
    if (dash) {
      inp.dash = 1;
      store.set((s) => ({ readyAt: { ...s.readyAt, dash: now + DASH_CD } }));
    }
    applyInput(this.map, this.pred, inp, this.mySpeed(), dash);
    this.pending.push(inp);
    if (this.pending.length > 60) this.pending.shift();
    this.net.send(inp);
  }

  /** Tốc độ chạy giống hệt server: chỉ số đã cộng thưởng (Bách Khoa, đồ ăn), bị làm chậm thì ×0.6. */
  private mySpeed() {
    const base = store.get().me?.stats.speed ?? CLASSES[this.myCls].speed;
    return this.mySlow ? base * 0.6 : base;
  }

  // ---------------------------------------------------------------- vẽ

  update(_time: number, delta: number) {
    this.inputAcc += delta;
    let n = 0;
    while (this.inputAcc >= TICK_MS && n < 4) { this.inputAcc -= TICK_MS; this.stepInput(); n++; }
    if (this.inputAcc > TICK_MS * 4) this.inputAcc = 0;

    const decay = Math.exp(-delta / 90);
    this.visOff.x *= decay; this.visOff.y *= decay;

    // Chỉ đồng bộ nông trại và bẫy mỗi 250ms (thay vì 60-120fps) để giảm tải CPU
    if (_time - this.lastLowFreqSync >= 250) {
      this.lastLowFreqSync = _time;
      this.syncTraps();
      this.syncFarm();
    }
    this.updateNpcs();

    if (this.offset == null || this.snaps.length === 0) return;
    // tăng nhanh khi mạng xấu đi, giảm chậm để không thấy hình bị tua
    const rate = this.interpTarget > this.interpDelay ? 0.004 : 0.0007;
    this.interpDelay += (this.interpTarget - this.interpDelay) * Math.min(1, delta * rate);
    const renderT = performance.now() + this.offset - this.interpDelay;

    // tìm 2 snapshot kẹp renderT
    let a = this.snaps[0], b = this.snaps[0];
    for (let i = 0; i < this.snaps.length; i++) {
      if (this.snaps[i].st <= renderT) a = this.snaps[i];
      if (this.snaps[i].st >= renderT) { b = this.snaps[i]; break; }
      b = this.snaps[i];
    }
    const span = b.st - a.st;
    const t = span > 0 ? Phaser.Math.Clamp((renderT - a.st) / span, 0, 1) : 1;

    // bắn sự kiện khi tới thời điểm của chúng
    for (const s of this.snaps) {
      if (!s.fired && s.st <= renderT) { s.fired = true; for (const e of s.ev) this.fireEvent(e, s); }
    }
    while (this.snaps.length > 2 && this.snaps[1].st < renderT - 350) this.snaps.shift();

    this.renderPlayers(a, b, t);
    this.renderMobs(a, b, t);
    this.renderProjs(a, b, t);
  }

  private makeUnit(tex: string, label: string | null, shadowScale: number): UnitView {
    const shadow = this.add.image(0, 10 * shadowScale, 'shadow').setScale(shadowScale);
    const body = this.add.image(0, 0, tex);
    const bar = this.add.graphics();
    const parts: Phaser.GameObjects.GameObject[] = [shadow, body, bar];
    let text: Phaser.GameObjects.Text | undefined;
    if (label != null) {
      text = this.add.text(0, -30 * shadowScale, label, {
        fontFamily: 'system-ui, sans-serif', fontSize: '11px', color: '#ffffff',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5, 1);
      parts.push(text);
    }
    const root = this.add.container(0, 0, parts);
    return { root, body, bar, label: text, lastHp: -1, lastMh: -1, x: 0, y: 0 };
  }

  private drawBar(v: UnitView, hp: number, mh: number, w: number, yOff: number, color: number) {
    if (hp === v.lastHp && mh === v.lastMh) return;
    v.lastHp = hp; v.lastMh = mh;
    v.bar.clear();
    v.bar.fillStyle(0x000000, 0.6); v.bar.fillRect(-w / 2 - 1, yOff - 1, w + 2, 5);
    v.bar.fillStyle(color, 1); v.bar.fillRect(-w / 2, yOff, w * Math.max(0, hp / mh), 3);
  }

  /** Nhân vật pixel art: chân đặt giữa bóng, tên trên đầu, Đạo sĩ có 2 lá bùa bay quanh. */
  private makeHero(pb: PlayerSnap): UnitView {
    const weapon = pb.w ?? '';
    const texKey = ensureHeroSheet(this, pb.c, weapon);
    const shadow = this.add.image(0, 10, 'shadow');
    const sprite = this.add.sprite(0, 10, texKey, 'idle_down_0').setOrigin(0.5, FEET_ORIGIN);
    const bar = this.add.graphics();
    const label = this.add.text(0, -41, `${pb.n} · ${pb.lv}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '11px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 1);
    const stallGfx = this.add.graphics();
    const stallLabel = this.add.text(0, -56, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '10px', fontStyle: 'bold',
      color: '#fef08a', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setVisible(false);
    stallLabel.setInteractive({ useHandCursor: true });
    stallLabel.on('pointerdown', (e: Phaser.Input.Pointer) => {
      e.event?.stopPropagation?.();
      store.set({ marketOpen: true, marketTab: 'market' });
      marketGet();
    });
    const talismans: Phaser.GameObjects.Image[] = [];
    if (pb.c === 'mage') for (let i = 0; i < 2; i++) talismans.push(this.add.image(0, 0, 'fx_talisman'));
    const root = this.add.container(0, 0, [stallGfx, shadow, sprite, ...talismans, bar, label, stallLabel]);
    return {
      root, body: sprite, bar, label, lastHp: -1, lastMh: -1, x: pb.x, y: pb.y,
      stallGfx, stallLabel,
      hero: { sprite, weapon, texKey, animKey: '', movingUntil: 0, attackUntil: 0, atkAng: 0, talismans },
    };
  }

  private updateHero(v: UnitView, pb: PlayerSnap, f: number, moved: number) {
    const h = v.hero;
    if (!h) return;
    const now = this.time.now;
    const weapon = pb.w ?? '';
    if (weapon !== h.weapon) { // đổi vũ khí -> đổi sheet (vũ khí vẽ liền trong khung hình)
      h.weapon = weapon;
      h.texKey = ensureHeroSheet(this, pb.c, weapon);
      h.animKey = '';
    }
    if (moved > 0.25 && !pb.dead) h.movingUntil = now + 120;
    const anim: HeroAnim = pb.dead ? 'idle' : now < h.attackUntil ? 'attack' : now < h.movingUntil ? 'walk' : 'idle';
    const { dir, flip } = facing(anim === 'attack' ? h.atkAng : f);
    const key = heroAnimKey(h.texKey, anim, dir);
    if (key !== h.animKey) { h.animKey = key; h.sprite.play(key); }
    h.sprite.setFlipX(flip);

    // bùa bay vòng quanh: chỉ reorder layer khi vị trí trước/sau thực sự thay đổi
    if (h.talismans.length > 0) {
      const spriteIdx = v.root.getIndex(h.sprite);
      h.talismans.forEach((tl, i) => {
        const ang = now / 520 + i * Math.PI;
        const s = Math.sin(ang);
        tl.setPosition(Math.cos(ang) * 17, -12 + s * 5 + Math.sin(now / 200 + i) * 1.5);
        const tlIdx = v.root.getIndex(tl);
        if (s < 0 && tlIdx > spriteIdx) v.root.moveBelow(tl, h.sprite);
        else if (s >= 0 && tlIdx < spriteIdx) v.root.moveAbove(tl, h.sprite);
      });
    }
  }

  /** NPC chuyển sang hoạt ảnh nói khi đang mở hội thoại với mình; cập nhật dấu nhiệm vụ. */
  private updateNpcs() {
    const st = store.get();
    const talkId = st.dialogue?.npcId ?? null;
    const bob = Math.sin(this.time.now / 250) * 2;
    for (const n of this.npcViews) {
      const talking = talkId === n.id;
      if (talking !== n.talking) {
        n.talking = talking;
        n.sprite.play(npcAnimKey(n.id, talking ? 'talk' : 'idle'));
      }
      const mk = questMarker(n.id, st.me);
      const mkKey = mk ? mk.text + mk.color : '';
      if (mkKey !== n.markerKey) {
        n.markerKey = mkKey;
        n.marker.setText(mk?.text ?? '').setColor(mk?.color ?? '#facc15');
      }
      n.marker.y = MARKER_Y + bob;
    }
  }

  private renderPlayers(a: Buffered, b: Buffered, t: number) {
    const myId = store.get().myId;
    this.lineGfx.clear();
    for (const [id, pb] of b.p) {
      let v = this.players.get(id);
      if (!v) {
        v = this.makeHero(pb);
        this.players.set(id, v);
        // Camera bám chặt (lerp 1): vị trí của mình đã được nội suy mượt. Lerp < 1 kèm roundPixels
        // làm camera và nhân vật làm tròn lệch nhau mỗi khung hình, nhân vật rung 1px.
        if (id === myId) this.cameras.main.startFollow(v.root, true, 1, 1);
      }
      let x: number, y: number, f: number;
      if (id === myId && this.pred && this.prevPred && !pb.dead) {
        const k = this.inputAcc / TICK_MS;
        x = lerp(this.prevPred.x, this.pred.x, k) + this.visOff.x;
        y = lerp(this.prevPred.y, this.pred.y, k) + this.visOff.y;
        f = this.pred.f;
      } else {
        const pa = a.p.get(id) ?? pb;
        x = lerp(pa.x, pb.x, t); y = lerp(pa.y, pb.y, t); f = lerpAngle(pa.f, pb.f, t);
      }
      const moved = Math.hypot(x - v.x, y - v.y);
      v.x = x; v.y = y;
      v.root.setPosition(x, y).setDepth(y);
      this.updateHero(v, pb, f, moved);
      if (pb.slow) v.body.setTint(0x38bdf8);
      else v.body.clearTint();
      v.root.setAlpha(pb.dead ? 0.35 : 1);
      if (v.label && v.label.text !== `${pb.n} · ${pb.lv}`) v.label.setText(`${pb.n} · ${pb.lv}`);
      this.drawBar(v, pb.hp, pb.mh, 28, -38, id === myId ? 0x4ade80 : 0x60a5fa);
      this.drawStall(v, pb);
      this.drawLife(id, x, y, pb);
    }
    for (const [id, v] of this.players) {
      if (!b.p.has(id)) { v.root.destroy(); this.players.delete(id); this.steamAt.delete(id); }
    }
  }

  /** Sạp hàng chợ quê: Chiếu cói vàng trải dưới chân, mẹt tre hàng họ, và biển tên sạp trên đầu */
  private drawStall(v: UnitView, pb: PlayerSnap) {
    if (!v.stallGfx || !v.stallLabel) return;
    if (pb.stall && !pb.dead) {
      const stallText = `🏮 ${pb.stall}`;
      if (v.stallLabel.text !== stallText) {
        v.stallLabel.setText(stallText);
      }
      v.stallLabel.setVisible(true);
      // Nhấp nhô nhẹ biển sạp
      v.stallLabel.y = -56 + Math.sin(this.time.now / 200) * 1.5;

      v.stallGfx.clear();
      // Chiếu cói vàng trải dưới chân
      v.stallGfx.fillStyle(0xd97706, 0.4);
      v.stallGfx.fillRoundedRect(-21, 2, 42, 17, 3);
      v.stallGfx.fillStyle(0xfde68a, 0.95);
      v.stallGfx.fillRoundedRect(-20, 1, 40, 16, 2);
      v.stallGfx.lineStyle(1.5, 0xb45309, 1);
      v.stallGfx.strokeRoundedRect(-20, 1, 40, 16, 2);
      // Gân nan chiếu cói
      v.stallGfx.lineStyle(1, 0xd97706, 0.4);
      for (let sx = -16; sx <= 16; sx += 5) {
        v.stallGfx.lineBetween(sx, 1, sx, 17);
      }
      // Mẹt tre 1 bên trái: thúng thóc / nông sản
      v.stallGfx.fillStyle(0x78350f, 1);
      v.stallGfx.fillEllipse(-13, 9, 6, 4);
      v.stallGfx.fillStyle(0xfacc15, 1);
      v.stallGfx.fillCircle(-13, 8.5, 2.5);

      // Mẹt tre 2 bên phải: cá tươi / ẩm thực
      v.stallGfx.fillStyle(0x78350f, 1);
      v.stallGfx.fillEllipse(13, 9, 6, 4);
      v.stallGfx.fillStyle(0x38bdf8, 1);
      v.stallGfx.fillCircle(13, 8.5, 2.5);
      v.stallGfx.setVisible(true);
    } else {
      if (v.stallLabel.visible) v.stallLabel.setVisible(false);
      if (v.stallGfx.visible) {
        v.stallGfx.clear();
        v.stallGfx.setVisible(false);
      }
    }
  }

  /** Cần câu + dây + phao (phao chìm khi cá cắn) và khói bốc lên khi đang nấu. */
  private drawLife(id: number, x: number, y: number, pb: PlayerSnap) {
    const now = this.time.now;
    if (pb.fb && !pb.dead) {
      const [bx, by, bit] = pb.fb;
      const g = this.lineGfx;
      const dir = bx >= x ? 1 : -1;
      const hx = x + dir * 6, hy = y - 8; // tay cầm
      const tx = x + dir * 22, ty = y - 30; // đầu cần
      g.lineStyle(2, 0x8b5a2b, 1);
      g.lineBetween(hx, hy, tx, ty);
      // dây câu võng xuống giữa, cá cắn thì căng thẳng
      const dip = bit ? 3 + Math.sin(now / 45) * 2 : Math.sin(now / 500) * 1.2;
      const ex = bx, ey = by + dip;
      const sag = bit ? 2 : 14;
      g.lineStyle(1, 0xf1f5f9, 0.75);
      g.beginPath();
      g.moveTo(tx, ty);
      for (let i = 1; i <= 8; i++) {
        const k = i / 8;
        g.lineTo(lerp(tx, ex, k), lerp(ty, ey, k) + Math.sin(k * Math.PI) * sag);
      }
      g.strokePath();
      // phao: đỏ trên, trắng dưới; cá cắn thì gợn sóng
      if (bit) {
        const r = 5 + ((now / 8) % 10);
        g.lineStyle(1, 0xe0f2fe, 1 - (r - 5) / 10);
        g.strokeEllipse(bx, by + 2, r * 2, r);
      }
      g.fillStyle(0xffffff, 1); g.fillCircle(ex, ey + 1, 2.5);
      g.fillStyle(0xef4444, 1); g.fillCircle(ex, ey - 1.5, 2.5);
    }
    if (pb.ck && !pb.dead && now >= (this.steamAt.get(id) ?? 0)) {
      this.steamAt.set(id, now + 260);
      const puff = this.add.circle(x + Phaser.Math.Between(-6, 6), y - 6, Phaser.Math.Between(3, 5), 0xf8fafc, 0.7).setDepth(y + 2);
      this.tweens.add({ targets: puff, y: puff.y - 30, alpha: 0, scale: 2, duration: 900, ease: 'Sine.easeOut', onComplete: () => puff.destroy() });
    }
  }

  /** Lửa trại: củi bắt chéo + ngọn lửa lập loè, ai đứng gần cũng nướng được. */
  private syncFires(list: FireSnap[]) {
    this.fireList = list;
    const seen = new Set<number>();
    for (const f of list) {
      seen.add(f.id);
      if (this.fires.has(f.id)) continue;
      const glow = this.add.circle(0, -4, 26, 0xf97316, 0.18);
      const logs = this.add.graphics();
      logs.fillStyle(0x6b3f1d, 1);
      logs.fillRoundedRect(-11, -2, 22, 5, 2);
      logs.fillStyle(0x8b5a2b, 1);
      logs.fillRoundedRect(-9, -5, 18, 4, 2);
      logs.fillStyle(0x57534e, 1);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; logs.fillCircle(Math.cos(a) * 13, 2 + Math.sin(a) * 5, 2.5); }
      const outer = this.add.ellipse(0, -10, 14, 20, 0xf97316, 0.95);
      const inner = this.add.ellipse(0, -7, 7, 11, 0xfde047, 1);
      const c = this.add.container(f.x, f.y, [glow, logs, outer, inner]).setDepth(f.y);
      this.tweens.add({ targets: outer, scaleY: { from: 0.85, to: 1.15 }, scaleX: { from: 1.05, to: 0.9 }, duration: 180, yoyo: true, repeat: -1 });
      this.tweens.add({ targets: inner, scaleY: { from: 1.1, to: 0.8 }, duration: 140, yoyo: true, repeat: -1 });
      this.tweens.add({ targets: glow, alpha: { from: 0.12, to: 0.28 }, scale: { from: 0.95, to: 1.08 }, duration: 400, yoyo: true, repeat: -1 });
      c.setScale(0.2);
      this.tweens.add({ targets: c, scale: 1, duration: 300, ease: 'Back.easeOut' });
      this.fires.set(f.id, c);
    }
    for (const [id, c] of this.fires) {
      if (seen.has(id)) continue;
      this.fires.delete(id);
      this.tweens.killTweensOf(c.list);
      this.tweens.add({ targets: c, alpha: 0, scale: 0.4, duration: 500, onComplete: () => c.destroy() });
    }
  }

  /** Bẫy thòng lọng của mình: cần tre uốn cong + vòng dây; sập rồi thì cần bật thẳng, hiện dấu "!". */
  private syncTraps() {
    const st = store.get();
    const now = performance.now();
    const seen = new Set<number>();
    for (const tr of st.me?.life?.traps ?? []) {
      if (tr.map !== this.mapId) continue;
      seen.add(tr.id);
      let v = this.trapViews.get(tr.id);
      if (!v) {
        const base = this.add.graphics();
        base.fillStyle(0x000000, 0.22); base.fillEllipse(0, 3, 24, 7);
        base.fillStyle(0x6b3f1d, 1); base.fillRect(-9, -4, 3, 7); // cọc ghim
        const set = this.add.graphics();
        // cần tre uốn cong xuống, dây buộc vòng thòng lọng nằm trên cỏ
        set.lineStyle(2.5, 0x65a30d, 1);
        set.beginPath(); set.moveTo(-8, 2);
        for (let i = 1; i <= 8; i++) { const k = i / 8; set.lineTo(-8 + k * 16, 2 - Math.sin(k * Math.PI * 0.85) * 18); }
        set.strokePath();
        set.lineStyle(1.2, 0xe7d3a8, 1);
        set.lineBetween(8, -4, 6, 1);
        set.strokeEllipse(6, 2, 13, 5);
        const sprung = this.add.graphics();
        // cần bật thẳng lên, dây thít chặt treo con mồi
        sprung.lineStyle(2.5, 0x65a30d, 1);
        sprung.lineBetween(-8, 2, -6, -26);
        sprung.lineStyle(1.2, 0xe7d3a8, 1);
        sprung.lineBetween(-6, -26, 2, -16);
        sprung.fillStyle(0x8d6e4a, 1); sprung.fillEllipse(3, -11, 9, 8);
        const mark = this.add.text(0, -34, '❗', { fontFamily: 'system-ui, sans-serif', fontSize: '14px' }).setOrigin(0.5);
        const c = this.add.container(tr.x, tr.y, [base, set, sprung, mark]).setDepth(tr.y - 2);
        v = { c, set, sprung, mark, ready: null };
        this.trapViews.set(tr.id, v);
      }
      const ready = now >= (st.trapReady[tr.id] ?? 0);
      if (v.ready !== ready) {
        v.ready = ready;
        v.set.setVisible(!ready);
        v.sprung.setVisible(ready);
        v.mark.setVisible(ready);
      }
      if (ready) v.mark.y = -34 + Math.sin(this.time.now / 180) * 2;
    }
    for (const [id, v] of this.trapViews) {
      if (!seen.has(id)) { v.c.destroy(); this.trapViews.delete(id); }
    }
  }

  /** Canh Nông: mô phỏng 8 ô ruộng lúa, đàn gà trong chuồng, ổ trứng trên bản đồ Vườn Nhà. */
  private syncFarm() {
    if (this.mapId !== 'vuon_nha') {
      if (this.plotViews.length > 0) {
        for (const pv of this.plotViews) pv.root.destroy();
        this.plotViews = [];
      }
      if (this.chickenViews.length > 0) {
        for (const cv of this.chickenViews) cv.root.destroy();
        this.chickenViews = [];
      }
      if (this.nestGfx) { this.nestGfx.destroy(); this.nestGfx = undefined; }
      return;
    }

    const st = store.get();
    const farm = st.me?.visitFarm ?? st.me?.life?.farm;
    if (!farm) return;

    const PLOT_COORDS: [number, number][] = [
      [5, 22], [9, 22],
      [5, 25], [9, 25],
      [5, 28], [9, 28],
      [5, 31], [9, 31],
    ];

    // Khởi tạo 8 view ô ruộng nếu chưa có
    if (this.plotViews.length === 0) {
      for (let i = 0; i < PLOT_COORDS.length; i++) {
        const [px, py] = PLOT_COORDS[i];
        const cx = (px + 1) * TILE;
        const cy = (py + 1) * TILE;
        const root = this.add.container(cx, cy).setDepth(cy - 2);
        const gfx = this.add.graphics();
        const mark = this.add.text(0, -18, '', {
          fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: 'bold',
          color: '#facc15', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);
        root.add([gfx, mark]);
        root.setInteractive(new Phaser.Geom.Rectangle(-32, -32, 64, 64), Phaser.Geom.Rectangle.Contains);
        root.on('pointerdown', () => {
          store.set({ farmOpen: true });
        });
        this.plotViews.push({ root, gfx, mark, key: '' });
      }
    }

    // Vẽ và cập nhật từng ô đất
    const now = performance.now();
    for (let i = 0; i < 8; i++) {
      const pData = farm.plots[i];
      const pv = this.plotViews[i];
      if (!pData || !pv) continue;

      const progress = pData.progress ?? 0;
      const isWet = (pData.waterUntil ?? 0) > Date.now();
      const stateKey = `${pData.state}_${pData.crop ?? ''}_${Math.floor(progress * 10)}_${isWet ? 1 : 0}_${pData.pest ? 1 : 0}_${pData.fertilized ? 1 : 0}`;

      if (pv.key !== stateKey) {
        pv.key = stateKey;
        const g = pv.gfx;
        g.clear();

        // Nền đất: nếu đã cuốc hoặc đã gieo
        if (pData.state === 'plowed' || pData.state === 'planted') {
          // Màu bùn đất tơi xốp
          const mudColor = isWet ? 0x2e1e0f : 0x4a3219;
          g.fillStyle(mudColor, 1);
          g.fillRect(-26, -26, 52, 52);

          // Luống cày
          g.lineStyle(1.5, isWet ? 0x1f140a : 0x382412, 0.8);
          for (let ly = -20; ly <= 20; ly += 10) {
            g.beginPath(); g.moveTo(-24, ly); g.lineTo(24, ly); g.strokePath();
          }

          // Phân bón gà (đốm hạt hữu cơ màu sẫm đen)
          if (pData.fertilized) {
            g.fillStyle(0x181008, 0.8);
            for (let f = 0; f < 6; f++) {
              g.fillCircle(-16 + (f % 3) * 16, -14 + Math.floor(f / 3) * 24, 2);
            }
          }

          // Mặt nước sâm sấp bóng loáng nếu có nước
          if (isWet) {
            g.fillStyle(0x38bdf8, 0.25);
            g.fillRect(-24, -24, 48, 48);
          }
        }

        // Cây lúa theo từng giai đoạn
        if (pData.state === 'planted') {
          if (progress < 0.35) {
            // Mạ non (Sprout): từng khóm mạ xanh tươi cắm thẳng hàng
            g.fillStyle(0x84cc16, 1);
            for (let row = -14; row <= 14; row += 14) {
              for (let col = -14; col <= 14; col += 14) {
                g.fillRect(col - 1, row - 4, 2, 7);
                g.fillRect(col, row - 6, 2, 4);
              }
            }
          } else if (progress < 0.85) {
            // Lúa đơm bông xanh mướt (Green Rice Stalks)
            g.fillStyle(0x4d7c0f, 1);
            for (let row = -16; row <= 16; row += 14) {
              for (let col = -16; col <= 16; col += 14) {
                g.fillRect(col - 2, row - 8, 4, 12);
                g.fillStyle(0x65a30d, 1);
                g.fillTriangle(col - 5, row - 2, col + 5, row - 2, col, row - 12);
              }
            }
          } else {
            // Lúa chín vàng ươm trĩu hạt (Golden Ripe Rice)
            const gold = pData.crop === 'giong_nep' ? 0xf59e0b : 0xeab308;
            const brightGold = pData.crop === 'giong_nep' ? 0xfde68a : 0xfef08a;
            g.fillStyle(gold, 1);
            for (let row = -16; row <= 16; row += 14) {
              for (let col = -16; col <= 16; col += 14) {
                g.fillRect(col - 2, row - 7, 4, 12);
                g.fillStyle(brightGold, 1);
                // Bông lúa trĩu nặng uốn cong
                g.fillEllipse(col + 3, row - 10, 7, 10);
                g.fillStyle(gold, 1);
                g.fillCircle(col - 3, row - 8, 3);
              }
            }
          }
        }
      }

      // Marker chữ / biểu tượng trạng thái
      if (pData.pest) {
        pv.mark.setText('🐛');
        pv.mark.y = -22 + Math.sin(now / 150 + i) * 3;
      } else if (pData.state === 'planted' && progress >= 1.0) {
        pv.mark.setText('✨🌾');
        pv.mark.y = -24 + Math.sin(now / 200 + i) * 2;
      } else if (pData.state === 'plowed') {
        pv.mark.setText('🌱');
        pv.mark.y = -20;
      } else {
        pv.mark.setText('');
      }
    }

    // Ổ trứng gà ở góc chuồng
    const totalEggs = (farm.eggs ?? 0) + (farm.goldenEggs ?? 0);
    if (totalEggs > 0) {
      if (!this.nestGfx) {
        this.nestGfx = this.add.graphics().setDepth(22 * TILE);
      }
      this.nestGfx.clear();
      const nx = 23 * TILE, ny = 22 * TILE;
      // Ổ rơm
      this.nestGfx.fillStyle(0xca8a04, 1);
      this.nestGfx.fillEllipse(nx, ny, 24, 14);
      this.nestGfx.fillStyle(0xeab308, 1);
      this.nestGfx.fillEllipse(nx, ny - 1, 20, 10);
      // Trứng gà trắng / hoàng kim
      const eggCount = Math.min(5, totalEggs);
      for (let e = 0; e < eggCount; e++) {
        const isGolden = e < (farm.goldenEggs ?? 0);
        this.nestGfx.fillStyle(isGolden ? 0xfacc15 : 0xffffff, 1);
        this.nestGfx.fillCircle(nx - 6 + e * 4, ny - 3 + (e % 2) * 2, 3);
      }
    } else if (this.nestGfx) {
      this.nestGfx.clear();
    }

    // Cập nhật đàn gà trong sân chuồng gà (x: 21.5..26.5 * TILE, y: 22.5..25 * TILE)
    const chickens = farm.chickens ?? [];
    while (this.chickenViews.length < chickens.length) {
      const idx = this.chickenViews.length;
      const root = this.add.container(22 * TILE + (idx % 3) * 24, 23 * TILE + Math.floor(idx / 3) * 16);
      const body = this.add.graphics();
      root.add(body);
      root.setInteractive(new Phaser.Geom.Rectangle(-16, -16, 32, 32), Phaser.Geom.Rectangle.Contains);
      root.on('pointerdown', () => { store.set({ farmOpen: true }); });
      this.chickenViews.push({
        root, body,
        tx: root.x, ty: root.y,
        nextWalk: now + Phaser.Math.Between(1000, 3000),
      });
    }
    while (this.chickenViews.length > chickens.length) {
      this.chickenViews.pop()?.root.destroy();
    }

    for (let c = 0; c < chickens.length; c++) {
      const ch = chickens[c];
      const cv = this.chickenViews[c];
      if (!ch || !cv) continue;

      // Di chuyển ngẫu nhiên trong sân chuồng
      if (now >= cv.nextWalk) {
        cv.nextWalk = now + Phaser.Math.Between(2500, 6000);
        cv.tx = Phaser.Math.Clamp(cv.root.x + Phaser.Math.Between(-30, 30), 22 * TILE, 26.5 * TILE);
        cv.ty = Phaser.Math.Clamp(cv.root.y + Phaser.Math.Between(-20, 20), 22.8 * TILE, 25.2 * TILE);
      }
      cv.root.x = lerp(cv.root.x, cv.tx, 0.05);
      cv.root.y = lerp(cv.root.y, cv.ty, 0.05);
      cv.root.setDepth(cv.root.y);

      // Hoạt ảnh mổ thóc nhấp nhô
      const peck = Math.sin(now / 180 + c * 2) > 0.4 ? 2 : 0;

      // Vẽ hình chú gà
      const g = cv.body;
      g.clear();
      if (!ch.adult) {
        // Gà con (chick): vàng óng đáng yêu
        g.fillStyle(0x000000, 0.2); g.fillEllipse(0, 5, 12, 5); // bóng
        g.fillStyle(0xfacc15, 1); g.fillCircle(0, -1 + peck, 6); // thân
        g.fillStyle(0xfde047, 1); g.fillCircle(3, -5 + peck, 4.5); // đầu
        g.fillStyle(0xf97316, 1); g.fillTriangle(6, -6 + peck, 10, -4 + peck, 6, -3 + peck); // mỏ
        g.fillStyle(0x000000, 1); g.fillCircle(5, -6 + peck, 1); // mắt
      } else {
        // Gà ta trưởng thành (adult hen/rooster): nâu vàng, mào đỏ tươi
        g.fillStyle(0x000000, 0.2); g.fillEllipse(0, 7, 20, 7); // bóng
        g.fillStyle(0xb45309, 1); g.fillEllipse(0, 0 + peck, 11, 8); // thân
        g.fillStyle(0xd97706, 1); g.fillCircle(6, -6 + peck, 6); // đầu
        g.fillStyle(0xef4444, 1); // mào đỏ
        g.fillCircle(5, -13 + peck, 2.5); g.fillCircle(8, -13 + peck, 2.5);
        g.fillStyle(0xfacc15, 1); g.fillTriangle(10, -7 + peck, 16, -5 + peck, 10, -4 + peck); // mỏ
        g.fillStyle(0x000000, 1); g.fillCircle(8, -7 + peck, 1.2); // mắt
        g.fillStyle(0x92400e, 1); g.fillTriangle(-8, -1 + peck, -14, -8 + peck, -6, -4 + peck); // đuôi
      }
    }
  }

  private renderMobs(a: Buffered, b: Buffered, t: number) {
    for (const [id, mb] of b.m) {
      let v = this.mobs.get(id);
      const def = MONSTERS[mb.k];
      const isBig = mb.k === 'boss' || mb.k === 'serpent';
      if (!v) {
        const s = isBig ? 2.2 : 1;
        v = this.makeUnit(`mob_${mb.k}`, isBig ? def.name : null, s);
        this.mobs.set(id, v);
        v.root.setAlpha(0);
        this.tweens.add({ targets: v.root, alpha: 1, duration: 300 });
      }
      const ma = a.m.get(id) ?? mb;
      const x = lerp(ma.x, mb.x, t), y = lerp(ma.y, mb.y, t);
      const f = lerpAngle(ma.f, mb.f, t);
      const mv = Math.hypot(x - v.x, y - v.y);
      v.x = x; v.y = y;
      v.root.setPosition(x, y).setDepth(y);
      if (mb.k === 'wolf') v.body.setRotation(f);
      else v.body.setFlipX(Math.cos(f) < 0);
      if (mb.k === 'slime') v.body.setScale(1 + Math.sin(this.time.now / 160 + id) * 0.06, 1 - Math.sin(this.time.now / 160 + id) * 0.06);
      else if (mb.k === 'frog') v.body.setScale(1 + Math.sin(this.time.now / 200 + id) * 0.05, 1 - Math.sin(this.time.now / 200 + id) * 0.03);
      else v.body.setScale(isBig ? 2.2 : 1);
      // thú rừng: đang chạy thì nhảy tưng tưng (thỏ nhảy cao, gà/le le lạch bạch)
      if (def.critter) {
        const hop = mv > 0.4 ? Math.abs(Math.sin(this.time.now / (mb.k === 'rabbit' ? 70 : 55) + id)) * (mb.k === 'rabbit' ? 5 : 2) : 0;
        v.body.y = -hop;
      }

      // Cua Đá khép càng: phát sáng vỏ cứng
      if (mb.sh) v.body.setTint(Math.floor(this.time.now / 150) % 2 === 0 ? 0x93c5fd : 0xffffff);
      else v.body.clearTint();

      // Ma Da lặn: bóng ma lượn mờ dưới nước
      v.root.setAlpha(mb.sub ? 0.18 : 1);

      const w = isBig ? 60 : 26;
      const yOff = isBig ? -44 : -20;
      if (mb.hp < mb.mh || isBig) this.drawBar(v, mb.hp, mb.mh, w, yOff, 0xef4444);
      else if (v.lastHp !== -2) { v.bar.clear(); v.lastHp = -2; }
    }
    for (const [id, v] of this.mobs) {
      if (!b.m.has(id)) { v.root.destroy(); this.mobs.delete(id); }
    }
  }

  private renderProjs(a: Buffered, b: Buffered, t: number) {
    for (const [id, pb] of b.pr) {
      const pa = a.pr.get(id);
      let v = this.projs.get(id);
      if (!pa) { if (v) { v.img.setVisible(false); } continue; } // chưa đủ 2 mẫu để nội suy
      if (!v) {
        v = { img: this.add.image(pa.x, pa.y, pb.k).setDepth(5000), x: pa.x, y: pa.y };
        this.projs.set(id, v);
      }
      const x = lerp(pa.x, pb.x, t), y = lerp(pa.y, pb.y, t);
      if ((pb.k === 'arrow' || pb.k === 'fireball') && (x !== v.x || y !== v.y)) {
        v.img.setRotation(Math.atan2(y - v.y, x - v.x));
      }
      v.x = x; v.y = y;
      v.img.setVisible(true).setPosition(x, y);
    }
    for (const [id, v] of this.projs) {
      if (!b.pr.has(id)) { v.img.destroy(); this.projs.delete(id); }
    }
  }

  private syncDrops(list: DropSnap[]) {
    const seen = new Set<number>();
    for (const d of list) {
      seen.add(d.id);
      if (this.drops.has(d.id)) continue;
      const wpnTex = `wpn_${d.k}`;
      const key = d.k === 'gold' ? 'drop_gold' : d.k === 'potion' ? 'drop_potion' : d.k === 'leaf' ? 'drop_leaf'
        : d.k === 'lotus_seed' ? 'drop_lotus_seed' : d.k === 'shoe' ? 'drop_shoe'
        : this.textures.exists(wpnTex) ? wpnTex : 'drop_weapon';
      const img = this.add.image(d.x, d.y, key).setDepth(d.y - 20);
      if (d.r && key === 'drop_weapon') img.setTint(RARITY_COLOR[d.r]);
      this.tweens.add({ targets: img, y: d.y - 4, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      if (d.r === 'epic' || d.r === 'rare') {
        const glow = this.add.circle(d.x, d.y, 14, RARITY_COLOR[d.r], 0.25).setDepth(d.y - 21);
        this.tweens.add({ targets: glow, scale: 1.4, alpha: 0, duration: 900, repeat: -1 });
        img.setData('glow', glow);
      }
      this.drops.set(d.id, img);
    }
    for (const [id, img] of this.drops) {
      if (!seen.has(id)) {
        (img.getData('glow') as Phaser.GameObjects.GameObject | undefined)?.destroy();
        this.tweens.killTweensOf(img);
        img.destroy();
        this.drops.delete(id);
      }
    }
  }

  // ---------------------------------------------------------------- hiệu ứng

  private unitPos(id: number, mob?: boolean): { x: number; y: number } | null {
    const v = mob ? this.mobs.get(id) : this.players.get(id) ?? this.mobs.get(id);
    return v ? { x: v.x, y: v.y } : null;
  }

  private floatText(x: number, y: number, text: string, color: string, size = 13) {
    const t = this.add.text(x + Phaser.Math.Between(-8, 8), y - 18, text, {
      fontFamily: 'system-ui, sans-serif', fontSize: `${size}px`, fontStyle: 'bold',
      color, stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9000);
    this.tweens.add({ targets: t, y: t.y - 26, alpha: 0, duration: 800, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private ring(x: number, y: number, r: number, color: number, ms = 300, fill = 0.25) {
    const c = this.add.circle(x, y, r, color, fill).setStrokeStyle(2, color, 0.9).setDepth(y + 1);
    c.setScale(0.3);
    this.tweens.add({ targets: c, scale: 1, alpha: 0, duration: ms, ease: 'Cubic.easeOut', onComplete: () => c.destroy() });
  }

  private telegraph(x: number, y: number, r: number, ms: number, outerColor = 0xff3030, strokeColor = 0xff5050, innerColor = 0xff3030) {
    const outer = this.add.circle(x, y, r, outerColor, 0.12).setStrokeStyle(2, strokeColor, 0.9).setDepth(y - 30);
    const inner = this.add.circle(x, y, r, innerColor, 0.3).setDepth(y - 29).setScale(0);
    this.tweens.add({ targets: inner, scale: 1, duration: ms, ease: 'Linear', onComplete: () => { inner.destroy(); outer.destroy(); } });
  }

  private fireEvent(e: GameEvent, s: Buffered) {
    const myId = store.get().myId;
    switch (e.e) {
      case 'dmg': {
        const pos = this.unitPos(e.id, !!e.mob);
        if (!pos) return;
        const color = e.mob ? (e.crit ? '#ffd34d' : '#ffffff') : e.id === myId ? '#ff5a5a' : '#ffb0b0';
        this.floatText(pos.x, pos.y, e.crit ? `${e.v}!` : `${e.v}`, color, e.crit ? 17 : 13);
        const v = e.mob ? this.mobs.get(e.id) : this.players.get(e.id);
        if (v) { v.body.setTintFill(0xffffff); this.time.delayedCall(70, () => { if (v.body.active) v.body.clearTint(); }); }
        if (e.id === myId) this.cameras.main.shake(90, 0.004);
        break;
      }
      case 'atk': {
        const pl = s.p.get(e.id);
        const pos = this.unitPos(e.id);
        if (!pos) return;
        const hv = pl ? this.players.get(e.id)?.hero : undefined;
        if (hv) { // vung vũ khí về phía mục tiêu
          hv.attackUntil = this.time.now + 260;
          hv.atkAng = Math.atan2(e.ty - pos.y, e.tx - pos.x);
          hv.animKey = '';
        }
        if (pl && pl.c === 'warrior') {
          const ang = Math.atan2(e.ty - pos.y, e.tx - pos.x);
          const g = this.add.graphics().setDepth(pos.y + 2);
          g.lineStyle(4, 0xffffff, 0.85);
          g.beginPath(); g.arc(pos.x, pos.y - 4, 30, ang - 0.8, ang + 0.8, false); g.strokePath();
          this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
        } else if (!pl) {
          const v = this.mobs.get(e.id);
          if (v) this.tweens.add({ targets: v.body, x: Math.cos(Math.atan2(e.ty - pos.y, e.tx - pos.x)) * 6, y: Math.sin(Math.atan2(e.ty - pos.y, e.tx - pos.x)) * 6, duration: 80, yoyo: true });
        }
        break;
      }
      case 'fx': {
        if (e.k === 'whirl') { this.ring(e.x, e.y, e.r, 0xffffff, 350, 0.15); this.cameras.main.shake(80, 0.003); }
        else if (e.k === 'splash') this.ring(e.x, e.y, e.r, 0x7dd3fc, 400, 0.3); // tõm! (thả câu / cá cắn / kéo cá lên)
        else if (e.k === 'meteor') this.telegraph(e.x, e.y, e.r, e.ms ?? 600, 0xf97316, 0xfacc15, 0xfb923c); // Lôi Phù: cam viền vàng
        else if (e.k === 'slam') this.telegraph(e.x, e.y, e.r, e.ms ?? 1200, 0xff3030, 0xff5050, 0xff3030); // Rễ Đâm của chúa Mộc Tinh: vòng đỏ
        else if (e.k === 'boom') { this.ring(e.x, e.y, Math.max(e.r, 20), 0xffa040, 350, 0.4); if (e.r > 60) this.cameras.main.shake(120, 0.006); }
        else if (e.k === 'ult_warrior') {
          this.telegraph(e.x, e.y, e.r, e.ms ?? 300, 0xf97316, 0xfacc15, 0xe11d48);
          this.cameras.main.shake(160, 0.008);
        }
        else if (e.k === 'ult_archer') {
          this.telegraph(e.x, e.y, e.r, e.ms ?? 3000, 0xfacc15, 0xfffbeb, 0xf59e0b);
        }
        else if (e.k === 'ult_mage') {
          this.ring(e.x, e.y, e.r, 0x38bdf8, 800, 0.35);
        }
        else if (e.k === 'ripple') {
          this.ring(e.x, e.y, e.r, 0x38bdf8, e.ms ?? 800, 0.45);
        }
        else if (e.k === 'shell') {
          this.ring(e.x, e.y, e.r, 0x93c5fd, e.ms ?? 1500, 0.6);
        }
        else if (e.k === 'sweep') {
          this.telegraph(e.x, e.y, e.r, e.ms ?? 900, 0x06b6d4, 0x22d3ee, 0x0891b2);
        }
        else if (e.k === 'wave') {
          this.ring(e.x, e.y, e.r, 0x0284c7, 1000, 0.6);
          this.cameras.main.shake(140, 0.007);
        }
        break;
      }
      case 'lvl': {
        const pos = this.unitPos(e.id);
        if (!pos) return;
        this.ring(pos.x, pos.y, 50, 0xffd34d, 700, 0.2);
        this.floatText(pos.x, pos.y - 14, `LÊN CẤP ${e.lv}`, '#ffd34d', 16);
        break;
      }
      case 'die': {
        const pos = this.unitPos(e.id, !!e.mob);
        if (pos && e.mob) this.ring(pos.x, pos.y, 22, 0xffffff, 400, 0.5);
        break;
      }
      case 'heal': {
        const pos = this.unitPos(e.id);
        if (pos) { this.floatText(pos.x, pos.y, `+${e.v}`, '#4ade80', 14); this.ring(pos.x, pos.y, 26, 0x4ade80, 400, 0.15); }
        break;
      }
    }
  }
}
