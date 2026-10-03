// Game server: HTTP (health) + WebSocket /ws, vòng lặp 20 tick/giây.
// Chạy: node --experimental-strip-types src/index.ts

// Tải biến môi trường từ .env nếu có (Node 20.12+ / 22+)
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch {}
  try { process.loadEnvFile('../.env'); } catch {}
}

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { World } from './world.ts';
import type { Outgoing } from './world.ts';
import { ProfileStore } from './store.ts';
import { TICK_MS, SNAP_EVERY, MAX_PLAYERS } from '../../shared/constants.ts';
import { CLASSES } from '../../shared/data.ts';
import type { ClassId } from '../../shared/data.ts';
import type { ClientMsg, ServerMsg } from '../../shared/protocol.ts';

const PORT = Number(process.env.PORT ?? 2567);
const DATA_DIR = process.env.DATA_DIR ?? './data';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

const store = new ProfileStore(DATA_DIR, SUPABASE_URL, SUPABASE_KEY);
const world = new World();
world.onSave = (p) => {
  store.save(p).catch((e) => console.error('[Store] Ghi dữ liệu thất bại:', e));
};

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, players: world.players.size, t: world.t }));
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 4096 });
const sockets = new Map<number, WebSocket>();

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function cleanName(raw: unknown): string {
  const s = String(raw ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14);
  return s || 'Lữ khách';
}

wss.on('connection', (ws) => {
  let id: number | null = null;

  ws.on('message', async (data) => {
    let msg: ClientMsg;
    try { msg = JSON.parse(String(data)); } catch { return; }

    if (id == null) {
      if (msg.t !== 'join') return;
      if (world.players.size >= MAX_PLAYERS) { send(ws, { t: 'err', msg: 'Server đầy' }); ws.close(); return; }

      let prof = !msg.fresh && ProfileStore.validToken(msg.token) ? await store.load(msg.token) : null;
      if (ws.readyState !== WebSocket.OPEN) return;

      if (prof && [...world.players.values()].some((p) => p.prof.token === prof!.token)) {
        send(ws, { t: 'err', msg: 'Nhân vật này đang online ở thiết bị khác' });
        ws.close();
        return;
      }
      if (!prof) {
        const cls: ClassId = msg.cls && CLASSES[msg.cls] ? msg.cls : 'warrior';
        prof = World.newProfile(randomUUID(), cleanName(msg.name), cls);
        await store.save(prof);
      }
      if (ws.readyState !== WebSocket.OPEN) return;

      id = world.addPlayer(prof);
      sockets.set(id, ws);
      send(ws, { t: 'welcome', id, token: prof.token, st: world.t });
      console.log(`+ ${prof.name} (${prof.cls} lv${prof.level}) id=${id} online=${world.players.size}`);
      return;
    }
    world.handle(id, msg);
  });

  ws.on('close', () => {
    if (id != null) {
      world.removePlayer(id);
      sockets.delete(id);
      console.log(`- id=${id} online=${world.players.size}`);
    }
  });
  ws.on('error', () => {});
});

function flush(list: Outgoing[]) {
  for (const o of list) {
    if (o.to === 'all') {
      const raw = JSON.stringify(o.msg);
      for (const ws of sockets.values()) if (ws.readyState === WebSocket.OPEN) ws.send(raw);
    } else {
      const ws = sockets.get(o.to);
      if (!ws) continue;
      // client mạng chậm: bỏ snapshot thay vì dồn bộ nhớ
      if (o.msg.t === 'snap' && ws.bufferedAmount > 256 * 1024) continue;
      send(ws, o.msg);
    }
  }
}

// Vòng lặp cố định 20Hz, bù trôi thời gian
let last = performance.now();
let acc = 0;
let ticks = 0;
function loop() {
  const now = performance.now();
  acc += now - last;
  last = now;
  let n = 0;
  while (acc >= TICK_MS && n < 5) {
    world.tick();
    ticks++;
    if (ticks % SNAP_EVERY === 0) flush(world.buildSnapshots());
    acc -= TICK_MS;
    n++;
  }
  if (acc > TICK_MS * 5) acc = 0; // server bị treo lâu: bỏ qua, không đuổi theo
  if (world.outbox.length) { flush(world.outbox); world.outbox = []; }
  setTimeout(loop, Math.max(1, TICK_MS - acc));
}
loop();

setInterval(() => world.flushSaves(), 30_000);

async function shutdown() {
  console.log('Đang lưu dữ liệu và tắt server…');
  for (const p of world.players.values()) {
    try {
      await store.save(p.prof);
    } catch (e) {
      console.error('[Store] Ghi dữ liệu shutdown thất bại:', e);
    }
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

http.listen(PORT, () => console.log(`Game server chạy ở :${PORT} (ws path /ws)`));
