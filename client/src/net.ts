// Kết nối WebSocket tới game server (cùng domain, đường dẫn /ws).
import type { ClientMsg, ServerMsg } from '../../shared/protocol.ts';
import type { ClassId } from '../../shared/data.ts';
import { store, pushChat, writeSave, loadSave } from './state.ts';

type SnapMsg = Extract<ServerMsg, { t: 'snap' }>;

export class Net {
  ws: WebSocket;
  onSnap: (s: SnapMsg) => void = () => {};
  private pingTimer = 0;

  constructor(join: { token?: string; name?: string; cls?: ClassId; fresh?: boolean }) {
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
        store.set({ phase: 'playing', myId: msg.id });
        const s = store.get();
        writeSave({ token: msg.token, name: s.name, cls: s.cls, lv: loadSave()?.lv ?? 1 });
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
        store.set({
          me,
          readyAt: { skill: now + me.cd.skill, dash: now + me.cd.dash, potion: now + me.cd.potion },
        });
        const save = loadSave();
        if (save) writeSave({ ...save, lv: me.lv, name: store.get().name || save.name });
        break;
      }
      case 'npc_dialogue': {
        store.set({ dialogue: msg, shopOpen: msg.npcId === 'nuoc' });
        break;
      }
      case 'chat': pushChat({ from: msg.from, text: msg.text }); break;
      case 'pong': store.set({ ping: Math.round(performance.now() - msg.c) }); break;
      case 'err': store.set({ phase: 'error', error: msg.msg }); break;
    }
  }
}
