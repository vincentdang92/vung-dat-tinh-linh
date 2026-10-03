// Giao thức mạng (JSON qua WebSocket). Bản MVP dùng JSON cho dễ debug;
// khi đông người có thể đổi sang nhị phân mà không đổi logic game.

import type { ClassId, Rarity } from './data.ts';
import type { GameMap } from './map.ts';
import { moveWithCollision } from './map.ts';
import { INPUT_DT, DASH_DIST, PLAYER_RADIUS } from './constants.ts';

// ---------- Client -> Server ----------
export interface InputMsg { t: 'in'; seq: number; x: number; y: number; dash?: 1 }
export type ClientMsg =
  | { t: 'join'; token?: string; name?: string; cls?: ClassId; fresh?: boolean }
  | InputMsg
  | { t: 'skill' }
  | { t: 'ult' } // Dùng bí kíp trấn phái (cần 100 Khí)
  | { t: 'potion' }
  | { t: 'equip'; uid: number }
  | { t: 'talk'; npcId: string } // Tương tác với NPC
  | { t: 'buy'; item: string } // Mua vật phẩm (bình máu)
  | { t: 'sell'; uid: number } // Bán vũ khí trong túi
  | { t: 'chat'; text: string }
  | { t: 'ping'; c: number };

// ---------- Server -> Client ----------
export interface PlayerSnap {
  id: number; n: string; c: ClassId; x: number; y: number; f: number;
  hp: number; mh: number; lv: number; dead: 0 | 1; w: string;
}
export interface MobSnap {
  id: number; k: 'slime' | 'wolf' | 'boss'; x: number; y: number;
  hp: number; mh: number; f: number; stun?: 1; slow?: 1;
}
export interface ProjSnap { id: number; k: 'arrow' | 'bolt'; x: number; y: number }
export interface DropSnap { id: number; k: string; x: number; y: number; r?: Rarity }

export type GameEvent =
  | { e: 'dmg'; id: number; v: number; crit?: 1; mob?: 1 }
  | { e: 'atk'; id: number; tx: number; ty: number }
  | { e: 'fx'; k: 'whirl' | 'volley' | 'meteor' | 'slam' | 'boom' | 'ult_warrior' | 'ult_archer' | 'ult_mage'; x: number; y: number; r: number; ms?: number }
  | { e: 'lvl'; id: number; lv: number }
  | { e: 'die'; id: number; mob?: 1 }
  | { e: 'heal'; id: number; v: number }
  | { e: 'sys'; text: string }
  | { e: 'quest'; id: string; step: number; text: string };

export interface InvItem { uid: number; key: string; qty: number }

export interface SelfState {
  lv: number; xp: number; next: number; gold: number;
  inv: InvItem[]; weapon: string;
  stats: { maxHp: number; atk: number; def: number; range: number };
  cd: { skill: number; dash: number; potion: number }; // ms còn lại
  skillCd: number;
  khi: number; // 0..100
  drumPieces: number[]; // Các mảnh Trống Đồng (1..4)
  quests: Record<string, number>; // id nhiệm vụ -> bước hiện tại
  questProg: Record<string, number>; // tiến độ bước hiện tại
  title?: string;
}

export type ServerMsg =
  | { t: 'welcome'; id: number; token: string; st: number }
  | { t: 'snap'; st: number; ack: number; p: PlayerSnap[]; m: MobSnap[]; pr: ProjSnap[]; d: DropSnap[]; ev: GameEvent[] }
  | ({ t: 'me' } & SelfState)
  | { t: 'chat'; from: string; text: string }
  | { t: 'npc_dialogue'; npcId: string; title: string; lines: string[]; step: number; canAdvance?: boolean }
  | { t: 'pong'; c: number; st: number }
  | { t: 'err'; msg: string };

// ---------- Di chuyển dùng chung (server tính thật, client dự đoán) ----------
export interface MoveState { x: number; y: number; f: number }

/**
 * Áp một gói input (50ms) lên vị trí. Dùng cho cả server lẫn client prediction,
 * nên phải hoàn toàn xác định (không random, không phụ thuộc thời gian thực).
 */
export function applyInput(map: GameMap, s: MoveState, inp: InputMsg, speed: number, canDash: boolean): boolean {
  let x = Number.isFinite(inp.x) ? inp.x : 0;
  let y = Number.isFinite(inp.y) ? inp.y : 0;
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  if (len > 0.05) s.f = Math.atan2(y, x);

  let dashed = false;
  if (inp.dash && canDash) {
    const dx = Math.cos(s.f) * DASH_DIST, dy = Math.sin(s.f) * DASH_DIST;
    const p = moveWithCollision(map, s.x, s.y, dx, dy, PLAYER_RADIUS);
    s.x = p.x; s.y = p.y;
    dashed = true;
  }
  if (len > 0.05) {
    const p = moveWithCollision(map, s.x, s.y, x * speed * INPUT_DT, y * speed * INPUT_DT, PLAYER_RADIUS);
    s.x = p.x; s.y = p.y;
  }
  return dashed;
}
