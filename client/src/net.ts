// Kết nối WebSocket tới game server (cùng domain, đường dẫn /ws).
import type { ClientMsg, ServerMsg } from '../../shared/protocol.ts';
import type { ClassId } from '../../shared/data.ts';
import type { MapId } from '../../shared/map.ts';
import { store, pushChat, patchCharacter, setAuth } from './state.ts';

type SnapMsg = Extract<ServerMsg, { t: 'snap' }>;

export interface JoinOpts { session: string; create?: { name: string; cls: ClassId } }

export class Net {
  ws: WebSocket;
  onSnap: (s: SnapMsg) => void = () => {};
  /** Gọi khi vào game (welcome) và mỗi lần qua cổng: game dựng lại cảnh theo bản đồ mới. */
  onMap: (map: MapId) => void = () => {};
  /** Số thứ tự gói input, giữ qua các lần đổi bản đồ vì server xác nhận (ack) theo số tăng dần. */
  seq = 0;
  private pingTimer = 0;

  constructor(join: JoinOpts) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = (import.meta.env.VITE_WS_URL as string | undefined) || `${proto}://${location.host}/ws`;
    this.ws = new WebSocket(url);
    store.set({ phase: 'connecting', error: '' });

    this.ws.onopen = () => this.send({ t: 'join', ...join });
    this.ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this.handle(msg);
    };
    this.ws.onclose = () => {
      clearInterval(this.pingTimer);
      const s = store.get();
      if (s.phase !== 'error') store.set({ phase: 'error', error: 'Mất kết nối tới server' });
    };
    this.pingTimer = window.setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
  }

  send(msg: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() { clearInterval(this.pingTimer); this.ws.close(); }

  private handle(msg: ServerMsg) {
    switch (msg.t) {
      case 'welcome': {
        store.set({ phase: 'playing', myId: msg.id, name: msg.name, cls: msg.cls, mapId: msg.map });
        patchCharacter({ name: msg.name, cls: msg.cls, lv: msg.lv });
        this.onMap(msg.map);
        break;
      }
      case 'map': {
        store.set({
          mapId: msg.map, nearNpc: null, dialogue: null, shopOpen: false,
          fishing: null, cooking: null, cookOpen: false, bagOpen: false, nearWater: false, cookPlace: null,
          nearTrap: null, canTrap: false,
        });
        this.onMap(msg.map);
        break;
      }
      case 'fish': {
        const now = performance.now();
        if (msg.s === 'cast' || msg.s === 'bite') {
          store.set({ fishing: { s: msg.s, n: msg.n, social: !!msg.social, at: now } });
          if (msg.s === 'bite') try { navigator.vibrate?.(120); } catch { /* trình duyệt không hỗ trợ */ }
        } else if (msg.s === 'catch') {
          store.set({ fishing: null, catchToast: { key: msg.key ?? '', kg: msg.kg, at: now } });
        } else {
          const text: Record<string, string> = {
            early: 'Giật sớm quá, cá chạy mất rồi!',
            miss: 'Chậm tay quá, cá sổng mất rồi!',
            full: 'Giỏ Tre đầy rồi, đành thả cá về nước.',
          };
          if (text[msg.s]) pushChat({ text: text[msg.s], sys: true });
          store.set({ fishing: null });
        }
        break;
      }
      case 'cook': {
        if (msg.s === 'start') {
          const ms = msg.ms ?? 2000;
          store.set({ cooking: { recipe: msg.recipe, until: performance.now() + ms, ms }, cookOpen: false });
        } else store.set({ cooking: null });
        break;
      }
      case 'gain': {
        store.set({ catchToast: { key: msg.key, how: msg.how, qty: msg.qty, extra: msg.extra, at: performance.now() } });
        break;
      }
      case 'trivia_result': {
        store.set({ triviaResult: { qId: msg.qId, ok: msg.ok, ans: msg.ans, exp: msg.exp, repeat: !!msg.repeat } });
        break;
      }
      case 'farm_visit': {
        store.set((s) => ({
          me: s.me ? { ...s.me, visitFarm: msg.farm } : null,
          farmOpen: true,
          farmTab: 'visit',
        }));
        break;
      }
      case 'snap': {
        const mine = msg.p.find((p) => p.id === store.get().myId);
        if (mine) {
          const s = store.get();
          if (mine.hp !== s.hp || mine.mh !== s.maxHp || !!mine.dead !== s.dead || msg.p.length !== s.online) {
            store.set({
              hp: mine.hp, maxHp: mine.mh, dead: !!mine.dead, online: msg.p.length,
              respawnAt: mine.dead && !s.dead ? performance.now() + 4000 : s.respawnAt,
              name: mine.n, cls: mine.c,
            });
          }
        }
        for (const e of msg.ev) if (e.e === 'sys') pushChat({ text: e.text, sys: true });
        this.onSnap(msg);
        break;
      }
      case 'me': {
        const now = performance.now();
        const { t: _t, ...me } = msg;
        const trapReady: Record<number, number> = {};
        for (const tr of me.life?.traps ?? []) trapReady[tr.id] = now + tr.left;
        store.set({
          me,
          readyAt: { skill: now + me.cd.skill, dash: now + me.cd.dash, potion: now + me.cd.potion },
          buffUntil: me.life?.buff ? now + me.life.buff.left : 0,
          trapReady,
        });
        const s = store.get();
        if (s.auth?.character) patchCharacter({ ...s.auth.character, lv: me.lv });
        break;
      }
      case 'npc_dialogue': {
        store.set({ dialogue: msg, shopOpen: false });
        break;
      }
      case 'chat': pushChat({ from: msg.from, text: msg.text }); break;
      case 'pong': store.set({ ping: Math.round(performance.now() - msg.c) }); break;
      case 'err':
        if (msg.code === 'auth') setAuth(null); // phiên hết hạn -> về màn đăng nhập
        store.set({ phase: 'error', error: msg.msg });
        break;
    }
  }
}
