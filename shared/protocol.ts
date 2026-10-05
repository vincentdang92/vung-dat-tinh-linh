// Giao thức mạng (JSON qua WebSocket). Bản MVP dùng JSON cho dễ debug;
// khi đông người có thể đổi sang nhị phân mà không đổi logic game.

import type { ClassId, Rarity, SkillData } from './data.ts';
import type { GameMap, MapId, MonsterKind } from './map.ts';
import { moveWithCollision } from './map.ts';
import { INPUT_DT, DASH_DIST, PLAYER_RADIUS } from './constants.ts';
import type { LifeSelf, FarmVisitSelf, CropKind, MarketListing, MarketSale, MarketEvent } from './life.ts';
import type { TriviaRankEntry } from './story.ts';

// ---------- Client -> Server ----------
export interface InputMsg { t: 'in'; seq: number; x: number; y: number; dash?: 1 }
export type ClientMsg =
  // Vào game bằng phiên đăng nhập nhanh. `create` chỉ dùng được khi tài khoản chưa có nhân vật (1 lần duy nhất).
  | { t: 'join'; session: string; create?: { name: string; cls: ClassId } }
  | InputMsg
  | { t: 'skill' }
  | { t: 'ult' } // Dùng bí kíp trấn phái (cần 100 Khí)
  | { t: 'potion' }
  | { t: 'equip'; uid: number }
  | { t: 'talk'; npcId: string } // Tương tác với NPC
  | { t: 'buy'; item: string } // Mua vật phẩm (bình máu)
  | { t: 'sell'; uid: number } // Bán vũ khí trong túi
  | { t: 'trivia'; qId: number; choice: number } // Trả lời câu đố dân gian
  // ---- Võ Học & Nâng Cấp Kỹ Năng ----
  | { t: 'skill_upgrade'; skill: 'main' | 'ult' | 'atk' | 'def' | 'spd' }
  | { t: 'skill_reset' }
  // ---- Nghề Sống ----
  | { t: 'fish_cast' } // thả câu ở chỗ nước gần nhất
  | { t: 'fish_reel' } // giật cần khi phao chìm
  | { t: 'cook'; recipe: string } // nấu ở Bếp Ông Táo hoặc cạnh lửa trại
  | { t: 'eat'; key: string } // ăn món trong Giỏ Tre
  | { t: 'sell_bag'; key: string; qty: number } // bán nông/thuỷ sản cho Bà Hàng Nước / Bác Lái Đò
  | { t: 'bag_drop'; key: string } // bỏ hết một loại trong Giỏ Tre
  | { t: 'campfire' } // đốt lửa trại (tốn 1 củi)
  | { t: 'trap_set' } // đặt bẫy thòng lọng ngay chỗ đứng
  | { t: 'trap_take'; id: number; force?: 1 } // thu bẫy (force: gỡ bẫy chưa sập)
  // ---- Canh Nông & Thăm Vườn ----
  | { t: 'farm_plow'; plot: number }
  | { t: 'farm_plant'; plot: number; crop: CropKind }
  | { t: 'farm_water'; plot: number; target?: string }
  | { t: 'farm_weed'; plot: number; target?: string }
  | { t: 'farm_fertilize'; plot: number }
  | { t: 'farm_harvest'; plot: number }
  | { t: 'farm_mill'; crop: CropKind }
  | { t: 'coop_add' }
  | { t: 'coop_feed'; item: 'thoc' | 'cam_gao' }
  | { t: 'coop_collect' }
  | { t: 'coop_clean' }
  | { t: 'farm_visit'; name: string }
  | { t: 'farm_cheer'; target: string; text: string }
  // ---- Chợ Phiên & Giao Thương ----
  | { t: 'market_get' }
  | { t: 'market_sell'; key: string; qty: number; unitPrice: number }
  | { t: 'market_buy'; id: string; qty: number }
  | { t: 'market_cancel'; id: string }
  | { t: 'market_claim' }
  | { t: 'npc_market_buy'; key: string; qty?: number }
  | { t: 'stall_set'; open: boolean; name?: string }
  | { t: 'chat'; text: string }
  | { t: 'ping'; c: number };

// ---------- Server -> Client ----------
export interface PlayerSnap {
  id: number; n: string; c: ClassId; x: number; y: number; f: number;
  hp: number; mh: number; lv: number; dead: 0 | 1; w: string;
  slow?: 1;
  /** Đang câu: vị trí phao và cá đã cắn chưa (1 = phao chìm). */
  fb?: [number, number, 0 | 1];
  /** Đang nấu ăn. */
  ck?: 1;
  /** Đang bày sạp hàng tại chỗ ở chợ làng (tên biển sạp). */
  stall?: string;
}
export interface MobSnap {
  id: number; k: MonsterKind; x: number; y: number;
  hp: number; mh: number; f: number; stun?: 1; slow?: 1;
  sh?: 1;  // vỏ cứng khép càng (Cua Đá)
  sub?: 1; // đang lặn/ẩn mình dưới nước (Ma Da)
}
export interface ProjSnap { id: number; k: 'arrow' | 'bolt' | 'fireball'; x: number; y: number }
export interface DropSnap { id: number; k: string; x: number; y: number; r?: Rarity }
export interface FireSnap { id: number; x: number; y: number }

export type GameEvent =
  | { e: 'dmg'; id: number; v: number; crit?: 1; mob?: 1 }
  | { e: 'atk'; id: number; tx: number; ty: number }
  | { e: 'fx'; k: 'whirl' | 'volley' | 'meteor' | 'slam' | 'boom' | 'ult_warrior' | 'ult_archer' | 'ult_mage' | 'ripple' | 'shell' | 'sweep' | 'wave' | 'splash'; x: number; y: number; r: number; ms?: number }
  | { e: 'lvl'; id: number; lv: number }
  | { e: 'die'; id: number; mob?: 1 }
  | { e: 'heal'; id: number; v: number }
  | { e: 'sys'; text: string }
  | { e: 'quest'; id: string; step: number; text: string };

export interface InvItem { uid: number; key: string; qty: number }

export interface SelfState {
  lv: number; xp: number; next: number; gold: number;
  inv: InvItem[]; weapon: string;
  stats: { maxHp: number; atk: number; def: number; range: number; speed: number };
  cd: { skill: number; dash: number; potion: number }; // ms còn lại
  skillCd: number;
  khi: number; // 0..100
  drumPieces: number[]; // Các mảnh Trống Đồng (1..4)
  quests: Record<string, number>; // id nhiệm vụ -> bước hiện tại
  questProg: Record<string, number>; // tiến độ bước hiện tại
  title?: string;
  life: LifeSelf; // Nghề Sống: cấp nghề, Giỏ Tre, buff ăn uống, nông trại
  visitFarm?: FarmVisitSelf | null;
  onlineFarmers?: { name: string; farmLv: number; likes: number }[];
  marketEarnings?: number; // Tiền vàng bán hàng chợ phiên chờ nhận
  skills?: SkillData; // Hệ thống Võ Học & Điểm Kỹ Năng
  triviaBoard?: TriviaRankEntry[]; // Bảng Vàng Trạng Nguyên (Top bảng vàng danh vọng)
}

/** Diễn biến câu cá gửi riêng cho người câu (để bấm "Giật!" đúng lúc). */
export type FishStage = 'cast' | 'bite' | 'catch' | 'miss' | 'early' | 'cancel' | 'full';

export type ServerMsg =
  | { t: 'welcome'; id: number; st: number; name: string; cls: ClassId; lv: number; map: MapId }
  // Đã qua cổng sang bản đồ khác: client dựng lại cảnh theo `map`, nhân vật đứng ở (x, y)
  | { t: 'map'; map: MapId; x: number; y: number }
  | { t: 'snap'; st: number; ack: number; p: PlayerSnap[]; m: MobSnap[]; pr: ProjSnap[]; d: DropSnap[]; cf?: FireSnap[]; ev: GameEvent[] }
  | ({ t: 'me' } & SelfState)
  | { t: 'chat'; from: string; text: string }
  | { t: 'npc_dialogue'; npcId: string; title: string; lines: string[]; step: number; canAdvance?: boolean }
  // n: số lần còn phải giật (cá to); key/kg: cá câu được; social: đang ngồi câu cùng bạn
  | { t: 'fish'; s: FishStage; n?: number; key?: string; kg?: number; social?: 1 }
  | { t: 'cook'; s: 'start' | 'done' | 'cancel'; recipe: string; ms?: number }
  // Săn/bẫy được gì (vào thẳng Giỏ Tre). `extra`: đồ kèm theo (lông gà, nanh lợn)
  | { t: 'gain'; how: 'hunt' | 'trap'; key: string; qty: number; extra?: string }
  // Nông trại: thăm vườn người chơi khác
  | { t: 'farm_visit'; farm: FarmVisitSelf | null }
  // Chợ phiên: dữ liệu chợ ký gửi & sự kiện giá
  | { t: 'market_data'; listings: MarketListing[]; myEarnings: number; mySales: MarketSale[]; event: MarketEvent }
  // Đáp án chỉ gửi SAU khi đã trả lời (client không biết trước đáp án)
  | { t: 'trivia_result'; qId: number; ok: boolean; ans: number; exp: string; repeat?: 1 }
  | { t: 'pong'; c: number; st: number }
  | { t: 'err'; msg: string; code?: 'auth' }; // code 'auth': phiên hết hạn -> đăng nhập lại

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
