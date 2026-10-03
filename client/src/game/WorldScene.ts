import Phaser from 'phaser';
import { buildMap, WORLD_W, WORLD_H } from '../../../shared/map.ts';
import type { GameMap } from '../../../shared/map.ts';
import { INTERP_DELAY_MS, TICK_MS, DASH_CD } from '../../../shared/constants.ts';
import { CLASSES, MONSTERS, RARITY_COLOR } from '../../../shared/data.ts';
import type { ClassId } from '../../../shared/data.ts';
import { applyInput } from '../../../shared/protocol.ts';
import type { InputMsg, MoveState, ServerMsg, PlayerSnap, MobSnap, ProjSnap, DropSnap, GameEvent } from '../../../shared/protocol.ts';
import { makeMapTexture, makeTextures } from './textures.ts';
import type { Net } from '../net.ts';
import { store, controls } from '../state.ts';
import { NPCS } from '../../../shared/story.ts';

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

interface UnitView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics;
  label?: Phaser.GameObjects.Text;
  lastHp: number;
  lastMh: number;
  x: number;
  y: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class WorldScene extends Phaser.Scene {
  private net!: Net;
  private map!: GameMap;
  private snaps: Buffered[] = [];
  private offset: number | null = null; // serverTime - clientTime

  private players = new Map<number, UnitView>();
  private mobs = new Map<number, UnitView>();
  private projs = new Map<number, { img: Phaser.GameObjects.Image; x: number; y: number }>();
  private drops = new Map<number, Phaser.GameObjects.Image>();

  // dự đoán phía client cho nhân vật của mình
  private pred: MoveState | null = null;
  private prevPred: MoveState | null = null;
  private pending: InputMsg[] = [];
  private seq = 0;
  private inputAcc = 0;
  private visOff = { x: 0, y: 0 };
  private myCls: ClassId = 'warrior';
  private myDead = false;

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() { super('world'); }

  init(data: { net: Net }) { this.net = data.net; }

  create() {
    this.map = buildMap();
    makeTextures(this);
    makeMapTexture(this, this.map);
    this.add.image(0, 0, 'map').setOrigin(0, 0).setDepth(-10);

    // Vẽ các NPC ở Làng Tre
    for (const npc of Object.values(NPCS)) {
      const container = this.add.container(npc.x, npc.y).setDepth(npc.y);
      const shadow = this.add.image(0, 4, 'shadow').setScale(0.8).setAlpha(0.6);
      const circle = this.add.circle(0, -10, 13, npc.color).setStrokeStyle(2, 0xffffff, 0.9);
      const emoji = npc.id === 'tao' ? '🔥' : npc.id === 'nuoc' ? '🍵' : '🌾';
      const icon = this.add.text(0, -10, emoji, { fontSize: '13px' }).setOrigin(0.5);
      const label = this.add.text(0, -28, npc.name, {
        fontFamily: 'system-ui, sans-serif', fontSize: '11px', fontStyle: 'bold',
        color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5);
      const title = this.add.text(0, -40, npc.title, {
        fontFamily: 'system-ui, sans-serif', fontSize: '9px',
        color: '#facc15', stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5);
      container.add([shadow, circle, icon, label, title]);
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
    }

    this.net.onSnap = (s) => this.onSnap(s);
  }

  // ---------------------------------------------------------------- mạng

  private onSnap(s: SnapMsg) {
    const now = performance.now();
    const o = s.st - now;
    // lấy offset nhỏ nhất gần đây (gói đến nhanh nhất ≈ ít trễ nhất), trôi dần lên
    this.offset = this.offset == null ? o : Math.min(o, this.offset + 0.5);

    this.snaps.push({
      st: s.st,
      p: new Map(s.p.map((q) => [q.id, q])),
      m: new Map(s.m.map((q) => [q.id, q])),
      pr: new Map(s.pr.map((q) => [q.id, q])),
      d: s.d,
      ev: s.ev,
      fired: false,
    });
    if (this.snaps.length > 40) this.snaps.shift();

    this.syncDrops(s.d);

    const myId = store.get().myId;
    const mine = s.p.find((p) => p.id === myId);
    if (!mine) return;
    this.myCls = mine.c;
    const wasDead = this.myDead;
    this.myDead = !!mine.dead;

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
    const speed = CLASSES[this.myCls].speed;
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
      const near = Object.values(NPCS).find((n) => Math.hypot(px - n.x, py - n.y) < 65);
      const curNear = store.get().nearNpc;
      if ((near?.id ?? null) !== curNear) {
        store.set({ nearNpc: near ? near.id : null });
      }
    }

    if (!moving && !dash) return;

    const inp: InputMsg = { t: 'in', seq: ++this.seq, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
    if (dash) {
      inp.dash = 1;
      store.set((s) => ({ readyAt: { ...s.readyAt, dash: now + DASH_CD } }));
    }
    this.prevPred = { ...this.pred };
    applyInput(this.map, this.pred, inp, CLASSES[this.myCls].speed, dash);
    this.pending.push(inp);
    if (this.pending.length > 60) this.pending.shift();
    this.net.send(inp);
  }

  // ---------------------------------------------------------------- vẽ

  update(_time: number, delta: number) {
    this.inputAcc += delta;
    let n = 0;
    while (this.inputAcc >= TICK_MS && n < 4) { this.inputAcc -= TICK_MS; this.stepInput(); n++; }
    if (this.inputAcc > TICK_MS * 4) this.inputAcc = 0;

    const decay = Math.exp(-delta / 90);
    this.visOff.x *= decay; this.visOff.y *= decay;

    if (this.offset == null || this.snaps.length === 0) return;
    const renderT = performance.now() + this.offset - INTERP_DELAY_MS;

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
    while (this.snaps.length > 2 && this.snaps[1].st < renderT - 1000) this.snaps.shift();

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

  private renderPlayers(a: Buffered, b: Buffered, t: number) {
    const myId = store.get().myId;
    for (const [id, pb] of b.p) {
      let v = this.players.get(id);
      if (!v) {
        v = this.makeUnit(`hero_${pb.c}`, `${pb.n} · ${pb.lv}`, 1);
        this.players.set(id, v);
        if (id === myId) this.cameras.main.startFollow(v.root, true, 0.25, 0.25);
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
      v.x = x; v.y = y;
      v.root.setPosition(x, y).setDepth(y);
      v.body.setRotation(f);
      v.root.setAlpha(pb.dead ? 0.35 : 1);
      if (v.label && v.label.text !== `${pb.n} · ${pb.lv}`) v.label.setText(`${pb.n} · ${pb.lv}`);
      this.drawBar(v, pb.hp, pb.mh, 28, -24, id === myId ? 0x4ade80 : 0x60a5fa);
    }
    for (const [id, v] of this.players) {
      if (!b.p.has(id)) { v.root.destroy(); this.players.delete(id); }
    }
  }

  private renderMobs(a: Buffered, b: Buffered, t: number) {
    for (const [id, mb] of b.m) {
      let v = this.mobs.get(id);
      const def = MONSTERS[mb.k];
      if (!v) {
        const s = mb.k === 'boss' ? 2.2 : 1;
        v = this.makeUnit(`mob_${mb.k}`, mb.k === 'boss' ? def.name : null, s);
        this.mobs.set(id, v);
        v.root.setAlpha(0);
        this.tweens.add({ targets: v.root, alpha: 1, duration: 300 });
      }
      const ma = a.m.get(id) ?? mb;
      const x = lerp(ma.x, mb.x, t), y = lerp(ma.y, mb.y, t);
      const f = lerpAngle(ma.f, mb.f, t);
      v.x = x; v.y = y;
      v.root.setPosition(x, y).setDepth(y);
      if (mb.k === 'wolf') v.body.setRotation(f);
      else v.body.setFlipX(Math.cos(f) < 0);
      if (mb.k === 'slime') v.body.setScale(1 + Math.sin(this.time.now / 160 + id) * 0.06, 1 - Math.sin(this.time.now / 160 + id) * 0.06);
      const w = mb.k === 'boss' ? 60 : 26;
      const yOff = mb.k === 'boss' ? -44 : -20;
      if (mb.hp < mb.mh || mb.k === 'boss') this.drawBar(v, mb.hp, mb.mh, w, yOff, 0xef4444);
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
      if (pb.k === 'arrow' && (x !== v.x || y !== v.y)) v.img.setRotation(Math.atan2(y - v.y, x - v.x));
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
      const key = d.k === 'gold' ? 'drop_gold' : d.k === 'potion' ? 'drop_potion' : 'drop_weapon';
      const img = this.add.image(d.x, d.y, key).setDepth(d.y - 20);
      if (d.r) img.setTint(RARITY_COLOR[d.r]);
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
        if (pl && pl.c === 'warrior') {
          const ang = Math.atan2(e.ty - pos.y, e.tx - pos.x);
          const g = this.add.graphics().setDepth(pos.y + 2);
          g.lineStyle(4, 0xffffff, 0.85);
          g.beginPath(); g.arc(pos.x, pos.y, 30, ang - 0.8, ang + 0.8, false); g.strokePath();
          this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
        } else if (!pl) {
          const v = this.mobs.get(e.id);
          if (v) this.tweens.add({ targets: v.body, x: Math.cos(Math.atan2(e.ty - pos.y, e.tx - pos.x)) * 6, y: Math.sin(Math.atan2(e.ty - pos.y, e.tx - pos.x)) * 6, duration: 80, yoyo: true });
        }
        break;
      }
      case 'fx': {
        if (e.k === 'whirl') { this.ring(e.x, e.y, e.r, 0xffffff, 350, 0.15); this.cameras.main.shake(80, 0.003); }
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
