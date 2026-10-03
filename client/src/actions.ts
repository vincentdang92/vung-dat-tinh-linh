import { Net } from './net.ts';
import { store, controls } from './state.ts';
import { POTION_CD } from '../../shared/constants.ts';
import type { ClassId } from '../../shared/data.ts';
import { startGame, stopGame } from './game/start.ts';

let net: Net | null = null;

export function join(opts: { token?: string; name?: string; cls?: ClassId; fresh?: boolean }) {
  net?.close();
  if (opts.name) store.set({ name: opts.name });
  if (opts.cls) store.set({ cls: opts.cls });
  net = new Net(opts);
  startGame(net);
}

export function leave() {
  net?.close();
  net = null;
  stopGame();
  store.set({ phase: 'lobby', me: null, chat: [], invOpen: false, chatOpen: false, dialogue: null, dead: false });
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

export function sendChat(text: string) {
  const v = text.trim();
  if (v) net?.send({ t: 'chat', text: v.slice(0, 120) });
}

window.addEventListener('rpg:skill', castSkill);
window.addEventListener('rpg:ult', castUltimate);
window.addEventListener('rpg:potion', drinkPotion);
