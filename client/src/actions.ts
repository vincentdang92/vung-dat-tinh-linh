import { Net } from './net.ts';
import { store, controls } from './state.ts';
import { POTION_CD } from '../../shared/constants.ts';
import type { ClassId } from '../../shared/data.ts';
import { startGame, stopGame } from './game/start.ts';

let net: Net | null = null;

/** Vào game bằng phiên đăng nhập; `create` chỉ dùng khi tài khoản chưa có nhân vật. */
export function join(create?: { name: string; cls: ClassId }) {
  const auth = store.get().auth;
  if (!auth) return;
  net?.close();
  if (create) store.set({ name: create.name, cls: create.cls });
  else if (auth.character) store.set({ name: auth.character.name, cls: auth.character.cls as ClassId });
  net = new Net({ session: auth.session, create });
  startGame(net);
}

export function leave() {
  net?.close();
  net = null;
  stopGame();
  store.set({
    phase: 'lobby', me: null, chat: [], invOpen: false, chatOpen: false, dialogue: null, dead: false,
    fishing: null, cooking: null, cookOpen: false, bagOpen: false, catchToast: null, triviaResult: null,
    nearWater: false, cookPlace: null, shopOpen: false, nearTrap: null, canTrap: false, trapReady: {},
  });
}

export function castSkill() {
  const s = store.get();
  const now = performance.now();
  if (!net || s.dead || !s.me || now < s.readyAt.skill) return;
  net.send({ t: 'skill' });
  store.set({ readyAt: { ...s.readyAt, skill: now + s.me.skillCd } });
}

export function castUltimate() {
  const s = store.get();
  if (!net || s.dead || !s.me || (s.me.khi ?? 0) < 100) return;
  net.send({ t: 'ult' });
}

export function drinkPotion() {
  const s = store.get();
  const now = performance.now();
  if (!net || s.dead || now < s.readyAt.potion || s.hp >= s.maxHp) return;
  net.send({ t: 'potion' });
  store.set({ readyAt: { ...s.readyAt, potion: now + POTION_CD } });
}

export function dash() { controls.dash = true; }

export function equip(uid: number) { net?.send({ t: 'equip', uid }); }

export function talkToNpc(npcId: string) { net?.send({ t: 'talk', npcId }); }

export function buyItem(item: string) { net?.send({ t: 'buy', item }); }

export function sellItem(uid: number) { net?.send({ t: 'sell', uid }); }

export function sendTrivia(qId: number, choice: number) {
  net?.send({ t: 'trivia', qId, choice });
}

export function sendChat(text: string) {
  const v = text.trim();
  if (v) net?.send({ t: 'chat', text: v.slice(0, 120) });
}

// ---- Nghề Sống ----
/** Phím F / nút câu: chưa câu thì thả câu (nếu đứng sát mép nước), đang câu thì giật cần. */
export function fishAction() {
  const s = store.get();
  if (!net || s.dead) return;
  if (s.fishing) net.send({ t: 'fish_reel' });
  else if (s.nearWater && !s.cooking) net.send({ t: 'fish_cast' });
}
export function cookRecipe(recipe: string) { net?.send({ t: 'cook', recipe }); }
export function eatFood(key: string) { net?.send({ t: 'eat', key }); }
export function sellBag(key: string, qty: number) { net?.send({ t: 'sell_bag', key, qty }); }
export function bagDrop(key: string) { net?.send({ t: 'bag_drop', key }); }
export function lightFire() { net?.send({ t: 'campfire' }); }
export function trapSet() { net?.send({ t: 'trap_set' }); }
export function trapTake(id: number, force = false) { net?.send(force ? { t: 'trap_take', id, force: 1 } : { t: 'trap_take', id }); }

// ---- Canh Nông & Thăm Vườn ----
export function farmPlow(plot: number) { net?.send({ t: 'farm_plow', plot }); }
export function farmPlant(plot: number, crop: 'giong_te' | 'giong_nep') { net?.send({ t: 'farm_plant', plot, crop }); }
export function farmWater(plot: number, target?: string) { net?.send({ t: 'farm_water', plot, target }); }
export function farmWeed(plot: number, target?: string) { net?.send({ t: 'farm_weed', plot, target }); }
export function farmFertilize(plot: number) { net?.send({ t: 'farm_fertilize', plot }); }
export function farmHarvest(plot: number) { net?.send({ t: 'farm_harvest', plot }); }
export function farmMill(crop: 'giong_te' | 'giong_nep') { net?.send({ t: 'farm_mill', crop }); }
export function coopAdd() { net?.send({ t: 'coop_add' }); }
export function coopFeed(item: 'thoc' | 'cam_gao') { net?.send({ t: 'coop_feed', item }); }
export function coopCollect() { net?.send({ t: 'coop_collect' }); }
export function coopClean() { net?.send({ t: 'coop_clean' }); }
export function farmVisit(name: string) { net?.send({ t: 'farm_visit', name }); }
export function farmCheer(target: string, text: string) { net?.send({ t: 'farm_cheer', target, text }); }

window.addEventListener('rpg:skill', castSkill);
window.addEventListener('rpg:ult', castUltimate);
window.addEventListener('rpg:potion', drinkPotion);
window.addEventListener('rpg:fish', fishAction);
