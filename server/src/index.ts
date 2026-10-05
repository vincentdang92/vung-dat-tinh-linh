// Game server: HTTP (health) + WebSocket /ws, vòng lặp 20 tick/giây.
// Chạy: node --experimental-strip-types src/index.ts

// Tải biến môi trường từ .env nếu có (Node 20.12+ / 22+)
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch {}
  try { process.loadEnvFile('../.env'); } catch {}
}

import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { Realm } from './realm.ts';
import type { Outgoing } from './world.ts';
import { ProfileStore } from './store.ts';
import { AccountStore, AuthService, loadAuthSecret } from './auth.ts';
import type { AuthReply } from './auth.ts';
import { TICK_MS, SNAP_EVERY, MAX_PLAYERS } from '../../shared/constants.ts';
import type { ClientMsg, ServerMsg } from '../../shared/protocol.ts';

const PORT = Number(process.env.PORT ?? 2567);
const DATA_DIR = process.env.DATA_DIR ?? './data';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
// Domain client được gọi API (khi client deploy riêng, ví dụ Vercel). Phiên gửi qua header nên dùng '*' vẫn an toàn.
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const store = new ProfileStore(DATA_DIR, SUPABASE_URL, SUPABASE_KEY);
const auth = new AuthService(loadAuthSecret(DATA_DIR, process.env.AUTH_SECRET), new AccountStore(DATA_DIR, store.db), store);
const realm = new Realm({ dataDir: DATA_DIR });
realm.onSave = (p) => {
  store.save(p).catch((e) => console.error('[Store] Ghi dữ liệu thất bại:', e));
};

// ---------------------------------------------------------------- HTTP: health + API đăng nhập nhanh

const CORS_HEADERS = {
  'access-control-allow-origin': CORS_ORIGIN,
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-max-age': '86400',
};

function sendJson(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage, limit = 2048): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => { raw += c; if (raw.length > limit) { raw = ''; req.destroy(); } });
    req.on('end', () => { try { const v = JSON.parse(raw); resolve(v && typeof v === 'object' ? v : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function bearer(req: IncomingMessage): string {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

function reply(res: ServerResponse, r: AuthReply) {
  if (r.ok) sendJson(res, 200, r.res);
  else sendJson(res, r.code === 'auth' ? 401 : 400, { error: r.msg, code: r.code });
}

async function handleApi(req: IncomingMessage, res: ServerResponse, path: string) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS_HEADERS); res.end(); return; }
  try {
    if (path === '/api/auth/quick-login' && req.method === 'POST') {
      const body = await readJson(req);
      reply(res, await auth.quickLogin(body.email, body.password));
    } else if (path === '/api/auth/me' && req.method === 'GET') {
      reply(res, await auth.me(bearer(req)));
    } else if (path === '/api/auth/claim' && req.method === 'POST') {
      const body = await readJson(req);
      reply(res, await auth.claim(bearer(req), body.legacyToken));
    } else {
      sendJson(res, 404, { error: 'Không có API này' });
    }
  } catch (e) {
    console.error('[Auth] Lỗi xử lý API:', e);
    sendJson(res, 500, { error: 'Server đang lỗi, hãy thử lại sau' });
  }
}

const http = createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0];
  if (path.startsWith('/api/')) { void handleApi(req, res, path); return; }
  if (path === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, players: realm.playerCount }));
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 4096 });
const sockets = new Map<number, WebSocket>();

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

wss.on('connection', (ws) => {
  let id: number | null = null;
  let joining = false;

  ws.on('message', async (data) => {
    let msg: ClientMsg;
    try { msg = JSON.parse(String(data)); } catch { return; }

    if (id == null) {
      if (msg.t !== 'join' || joining) return;
      joining = true;
      if (realm.playerCount >= MAX_PLAYERS) { send(ws, { t: 'err', msg: 'Server đầy' }); ws.close(); return; }

      // Phiên đăng nhập -> nhân vật duy nhất của tài khoản (tạo nếu chưa có và có gửi `create`)
      const r = await auth.resolveJoin(msg.session, msg.create);
      if (ws.readyState !== WebSocket.OPEN) return;
      if (!r.ok) { send(ws, { t: 'err', msg: r.msg, code: r.code }); ws.close(); return; }
      const prof = r.prof;

      if (realm.isOnline(prof.token)) {
        send(ws, { t: 'err', msg: 'Nhân vật này đang online ở thiết bị khác' });
        ws.close();
        return;
      }

      const joined = realm.addPlayer(prof);
      id = joined.id;
      sockets.set(id, ws);
      send(ws, { t: 'welcome', id, st: joined.st, name: prof.name, cls: prof.cls, lv: prof.level, map: joined.map });
      console.log(`+ ${prof.name} (${prof.cls} lv${prof.level})${r.created ? ' [mới]' : ''} id=${id} map=${joined.map} online=${realm.playerCount}`);
      return;
    }
    realm.handle(id, msg);
  });

  ws.on('close', () => {
    if (id != null) {
      realm.removePlayer(id);
      sockets.delete(id);
      console.log(`- id=${id} online=${realm.playerCount}`);
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
      // client mạng chậm: bỏ snapshot nếu buffer vượt 12KB (~2 snapshot) thay vì dồn 256KB
      if (o.msg.t === 'snap' && ws.bufferedAmount > 12 * 1024) continue;
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
  let didSnap = false;
  while (acc >= TICK_MS && n < 5) {
    realm.tick();
    ticks++;
    flush(realm.drainOutbox());
    if (ticks % SNAP_EVERY === 0) didSnap = true;
    acc -= TICK_MS;
    n++;
  }
  // Chỉ gửi 1 snapshot mới nhất sau khi hoàn tất các tick bù trôi, tránh dồn 2-3 gói trong cùng 1 mili-giây
  if (didSnap) flush(realm.buildSnapshots());
  if (acc > TICK_MS * 5) acc = 0; // server bị treo lâu: bỏ qua, không đuổi theo
  flush(realm.drainOutbox());
  setTimeout(loop, Math.max(1, TICK_MS - acc));
}
loop();

// Lưu người chơi có thay đổi mỗi 10 giây. Trên Windows, `node --watch` khởi động lại bằng cách
// giết tiến trình (không chạy shutdown), nên khoảng này càng ngắn càng ít mất tiến độ.
setInterval(() => realm.flushSaves(), 10_000);

async function shutdown() {
  console.log('Đang lưu dữ liệu và tắt server…');
  for (const p of realm.allPlayers()) {
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
