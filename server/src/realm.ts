// Realm: gom các bản đồ (mỗi bản đồ một World) chạy chung một vòng lặp.
// Định tuyến tin nhắn tới đúng World của người chơi, và chuyển người chơi qua cổng.
// Không phụ thuộc mạng: index.ts nối WebSocket vào, còn test gọi trực tiếp.

import { MAP_IDS, isMapId } from '../../shared/map.ts';
import type { MapId } from '../../shared/map.ts';
import type { ClientMsg } from '../../shared/protocol.ts';
import { World } from './world.ts';
import type { Outgoing, Profile, Player } from './world.ts';
import { defaultFarm, normalizeLife, lifeLevel } from '../../shared/life.ts';
import { MarketManager } from './market.ts';
import { TriviaBoardManager } from './trivia.ts';

export class Realm {
  readonly worlds = new Map<MapId, World>();
  private where = new Map<number, MapId>(); // id người chơi -> bản đồ đang đứng
  private outbox: Outgoing[] = [];
  private nextId = 1;
  readonly market: MarketManager;
  readonly triviaBoard: TriviaBoardManager;
  onSave: (p: Profile) => void = () => {};

  constructor(opts: { rnd?: () => number; dataDir?: string } = {}) {
    this.market = new MarketManager(opts.dataDir);
    this.triviaBoard = new TriviaBoardManager(opts.dataDir);
    const ids = () => this.nextId++;
    for (const mapId of MAP_IDS) {
      const w = new World({
        rnd: opts.rnd,
        mapId,
        ids,
        market: this.market,
        triviaBoard: this.triviaBoard,
        onBroadcastRealm: (from, text) => this.broadcastChat(from, text),
        onFindPlayerByToken: (token) => this.findPlayerByToken(token),
        onFindTargetFarm: (name) => {
          const target = this.findPlayerByName(name);
          if (!target) return null;
          const farm = target.prof.life?.farm ?? defaultFarm();
          target.prof.life = target.prof.life ?? normalizeLife(undefined);
          target.prof.life.farm = farm;
          return {
            player: target,
            farm,
            farmLv: lifeLevel(target.prof.life.xp?.farm ?? 0),
            markDirty: () => { target.meDirty = true; target.saveDirty = true; },
          };
        },
        onGetOnlineFarmers: () => this.getOnlineFarmers(),
      });
      w.onSave = (p) => this.onSave(p);
      this.worlds.set(mapId, w);
    }
  }

  broadcastChat(from: string, text: string) {
    for (const w of this.worlds.values()) {
      w.broadcastChat(from, text);
    }
  }

  findPlayerByToken(token: string): Player | undefined {
    for (const w of this.worlds.values()) {
      for (const p of w.players.values()) {
        if (p.prof.token === token) return p;
      }
    }
    return undefined;
  }

  findPlayerByName(name: string): Player | undefined {
    const lower = name.toLowerCase();
    for (const w of this.worlds.values()) {
      for (const p of w.players.values()) {
        if (p.prof.name.toLowerCase() === lower) return p;
      }
    }
    return undefined;
  }

  getOnlineFarmers(): { name: string; farmLv: number; likes: number }[] {
    const list: { name: string; farmLv: number; likes: number }[] = [];
    for (const w of this.worlds.values()) {
      for (const p of w.players.values()) {
        const farm = p.prof.life?.farm;
        const farmLv = lifeLevel(p.prof.life?.xp?.farm ?? 0);
        list.push({ name: p.prof.name, farmLv, likes: farm?.likes ?? 0 });
      }
    }
    return list;
  }

  world(mapId: MapId): World { return this.worlds.get(mapId)!; }

  /** Bản đồ người chơi đang đứng (undefined nếu không online). */
  mapOf(id: number): MapId | undefined { return this.where.get(id); }

  get playerCount(): number {
    let n = 0;
    for (const w of this.worlds.values()) n += w.players.size;
    return n;
  }

  isOnline(token: string): boolean {
    for (const w of this.worlds.values()) for (const p of w.players.values()) if (p.prof.token === token) return true;
    return false;
  }

  /** Vào game ở vùng an toàn của bản đồ đã lưu (mặc định Làng Tre). */
  addPlayer(prof: Profile): { id: number; map: MapId; st: number } {
    const map = isMapId(prof.mapId) ? prof.mapId : 'lang_tre';
    const w = this.world(map);
    const id = w.addPlayer(prof);
    this.where.set(id, map);
    return { id, map, st: w.t };
  }

  removePlayer(id: number) {
    const map = this.where.get(id);
    if (!map) return;
    this.world(map).removePlayer(id);
    this.where.delete(id);
  }

  handle(id: number, msg: ClientMsg) {
    const map = this.where.get(id);
    if (map) this.world(map).handle(id, msg);
  }

  tick() {
    for (const w of this.worlds.values()) w.tick();
    // Qua cổng: tách khỏi bản đồ cũ, gắn vào bản đồ mới, báo client dựng lại cảnh
    for (const w of this.worlds.values()) {
      for (const tr of w.takeTransfers()) {
        const p = w.detachPlayer(tr.id);
        if (!p) continue;
        const dest = this.world(tr.to);
        dest.attachPlayer(p, tr.x, tr.y, w.t);
        this.where.set(p.id, tr.to);
        this.outbox.push({ to: p.id, msg: { t: 'map', map: tr.to, x: tr.x, y: tr.y } });
      }
    }
  }

  buildSnapshots(): Outgoing[] {
    const out: Outgoing[] = [];
    for (const w of this.worlds.values()) out.push(...w.buildSnapshots());
    return out;
  }

  /** Tin nhắn chờ gửi (hội thoại, chat, chuyển bản đồ) của mọi bản đồ. */
  drainOutbox(): Outgoing[] {
    const out = this.outbox;
    this.outbox = [];
    for (const w of this.worlds.values()) {
      if (w.outbox.length) { out.push(...w.outbox); w.outbox = []; }
    }
    return out;
  }

  flushSaves() {
    for (const w of this.worlds.values()) w.flushSaves();
  }

  /** Mọi người chơi đang online (để lưu khi tắt server). */
  *allPlayers() {
    for (const w of this.worlds.values()) yield* w.players.values();
  }
}
