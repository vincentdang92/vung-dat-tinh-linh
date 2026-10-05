// Store nhỏ dùng chung giữa Phaser (game) và Preact (UI).
import { useEffect, useState } from 'preact/hooks';
import type { SelfState, FishStage } from '../../shared/protocol.ts';
import type { ClassId } from '../../shared/data.ts';
import type { AuthResult, CharacterSummary } from '../../shared/auth.ts';
import type { MapId } from '../../shared/map.ts';
import type { MarketListing, MarketSale, MarketEvent } from '../../shared/life.ts';

export interface ChatLine { id: number; from?: string; text: string; sys?: boolean; at: number }

export interface NpcDialogueState {
  npcId: string;
  title: string;
  lines: string[];
  step: number;
  canAdvance?: boolean;
}

export interface UiState {
  phase: 'lobby' | 'connecting' | 'playing' | 'error';
  error: string;
  myId: number;
  name: string;
  cls: ClassId;
  me: SelfState | null;
  hp: number;
  maxHp: number;
  dead: boolean;
  respawnAt: number;
  ping: number;
  online: number;
  chat: ChatLine[];
  invOpen: boolean;
  chatOpen: boolean;
  dialogue: NpcDialogueState | null;
  shopOpen: boolean;
  triviaOpen: boolean;
  triviaTab: 'trivia' | 'board';
  codexOpen: boolean;
  skillOpen: boolean;
  noticeOpen: boolean;
  marketOpen: boolean;
  marketData: {
    listings: MarketListing[];
    myEarnings: number;
    mySales: MarketSale[];
    event: MarketEvent;
  } | null;
  marketTab: 'browse' | 'npc' | 'my';
  stallSellerToken: string | null;
  /** Kết quả câu đố vừa trả lời (đáp án server gửi về sau khi trả lời). */
  triviaResult: { qId: number; ok: boolean; ans: number; exp: string; repeat?: boolean } | null;
  /** Bảng Giỏ Tre / Bếp nấu ăn / Nông Trại. */
  bagOpen: boolean;
  cookOpen: boolean;
  farmOpen: boolean;
  farmTab: 'my' | 'visit';
  /** Cửa hàng đang mở của ai: Bà Hàng Nước (đủ món) hay Bác Lái Đò (chỉ thu mua thuỷ sản). */
  shopNpc: 'nuoc' | 'do';
  /** Câu cá: diễn biến do server báo (phao chìm thì bấm "Giật!"). */
  fishing: { s: FishStage; n?: number; social?: boolean; at: number } | null;
  /** Thông báo vừa câu/săn/bẫy được gì (hiện giữa màn hình một lúc). */
  catchToast: { key: string; kg?: number; how?: 'fish' | 'hunt' | 'trap'; qty?: number; extra?: string; at: number } | null;
  cooking: { recipe: string; until: number; ms: number } | null;
  /** Buff ăn uống hết hạn lúc nào (theo performance.now của máy, 0 = không có). */
  buffUntil: number;
  /** Đang đứng sát mép nước (thả câu được) / cạnh bếp hoặc lửa trại (nấu được). */
  nearWater: boolean;
  cookPlace: 'bep' | 'fire' | null;
  /** Bẫy của mình đang đứng cạnh (thu/gỡ được) / chỗ đứng đặt bẫy được. */
  nearTrap: { id: number; ready: boolean } | null;
  canTrap: boolean;
  /** Bẫy sập lúc nào (theo performance.now của máy), theo id bẫy. */
  trapReady: Record<number, number>;
  nearNpc: string | null;
  readyAt: { skill: number; dash: number; potion: number };
  /** Bản đồ đang đứng. */
  mapId: MapId;
  /** Phiên đăng nhập nhanh (null = chưa đăng nhập, phải đăng nhập mới vào được game). */
  auth: AuthSave | null;
}

type Listener = () => void;

function createStore<S extends object>(init: S) {
  let state = init;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch: Partial<S> | ((s: S) => Partial<S>)) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      listeners.forEach((l) => l());
    },
    subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

// Ghi nhớ đăng nhập trên máy 30 ngày (hạn do server ký trong phiên)
const AUTH_KEY = 'vdtl-auth';
export type AuthSave = AuthResult;
function readAuth(): AuthSave | null {
  try {
    const v = JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null') as AuthSave | null;
    if (!v || typeof v.session !== 'string' || !(v.expiresAt > Date.now())) return null;
    return v;
  } catch { return null; }
}

export const store = createStore<UiState>({
  phase: 'lobby', error: '', myId: 0, name: '', cls: 'warrior',
  me: null, hp: 1, maxHp: 1, dead: false, respawnAt: 0, ping: 0, online: 0,
  chat: [], invOpen: false, chatOpen: false, dialogue: null, shopOpen: false,
  triviaOpen: false, triviaTab: 'trivia', codexOpen: false, skillOpen: false, noticeOpen: false, nearNpc: null,
  marketOpen: false, marketData: null, marketTab: 'browse', stallSellerToken: null,
  triviaResult: null, bagOpen: false, cookOpen: false, farmOpen: false, farmTab: 'my', shopNpc: 'nuoc',
  fishing: null, catchToast: null, cooking: null, buffUntil: 0, nearWater: false, cookPlace: null,
  nearTrap: null, canTrap: false, trapReady: {},
  readyAt: { skill: 0, dash: 0, potion: 0 },
  mapId: 'lang_tre',
  auth: readAuth(),
});

/** Cập nhật phiên (hoặc null để đăng xuất), lưu xuống máy. */
export function setAuth(a: AuthSave | null) {
  try {
    if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a));
    else localStorage.removeItem(AUTH_KEY);
  } catch { /* chế độ ẩn danh */ }
  store.set({ auth: a });
}

/** Cập nhật thông tin nhân vật trong phiên (tên, môn phái, cấp) sau khi vào game / lên cấp. */
export function patchCharacter(c: CharacterSummary) {
  const a = store.get().auth;
  if (!a) return;
  const old = a.character;
  if (old && old.name === c.name && old.cls === c.cls && old.lv === c.lv) return;
  setAuth({ ...a, character: c });
}

export function useStore<T>(sel: (s: UiState) => T): T {
  const [v, setV] = useState(() => sel(store.get()));
  useEffect(() => store.subscribe(() => {
    const n = sel(store.get());
    setV((old) => (Object.is(old, n) ? old : n));
  }), []);
  return v;
}

let chatId = 0;
export function pushChat(line: Omit<ChatLine, 'id' | 'at'>) {
  store.set((s) => ({ chat: [...s.chat.slice(-30), { ...line, id: ++chatId, at: performance.now() }] }));
}

/** Điều khiển nhập từ joystick/nút (đọc trong vòng lặp game, không qua store cho nhanh). */
export const controls = {
  x: 0,
  y: 0,
  dash: false,
};

// Nhân vật cũ lưu trên máy từ trước khi có đăng nhập: chỉ còn dùng để "nhận lại" vào tài khoản
const LEGACY_KEYS = ['happy-land-save', 'rpg-mvp-save'];
export interface LegacySave { token: string; name: string; cls: ClassId; lv: number }
export function loadLegacySave(): LegacySave | null {
  for (const k of LEGACY_KEYS) {
    try {
      const v = JSON.parse(localStorage.getItem(k) ?? 'null');
      if (v && typeof v.token === 'string' && typeof v.name === 'string') return v;
    } catch { /* bỏ qua */ }
  }
  return null;
}
export function clearLegacySave() {
  try { for (const k of LEGACY_KEYS) localStorage.removeItem(k); } catch { /* chế độ ẩn danh */ }
}
