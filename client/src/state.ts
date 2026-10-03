// Store nhỏ dùng chung giữa Phaser (game) và Preact (UI).
import { useEffect, useState } from 'preact/hooks';
import type { SelfState } from '../../shared/protocol.ts';
import type { ClassId } from '../../shared/data.ts';

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
  nearNpc: string | null;
  readyAt: { skill: number; dash: number; potion: number };
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

export const store = createStore<UiState>({
  phase: 'lobby', error: '', myId: 0, name: '', cls: 'warrior',
  me: null, hp: 1, maxHp: 1, dead: false, respawnAt: 0, ping: 0, online: 0,
  chat: [], invOpen: false, chatOpen: false, dialogue: null, shopOpen: false, nearNpc: null,
  readyAt: { skill: 0, dash: 0, potion: 0 },
});

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

// Lưu nhân vật trên máy
const KEY = 'happy-land-save';
const OLD_KEY = 'rpg-mvp-save';
export interface LocalSave { token: string; name: string; cls: ClassId; lv: number }
export function loadSave(): LocalSave | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY) ?? 'null'); } catch { return null; }
}
export function writeSave(s: LocalSave) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* chế độ ẩn danh */ }
}
