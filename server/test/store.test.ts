// Đọc nhân vật từ Supabase: cột jsonb bị Postgres gấp về chữ thường (drumpieces, questprog).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProfileStore } from '../src/store.ts';

const base = { token: 'a4db4977-4762-40d4-b0ca-3edb6cd95882', name: 'Test', cls: 'mage', level: 3, xp: 1, gold: 2, inv: [], weapon: 'staff' };

test('normalize đọc được cột chữ thường từ Supabase', () => {
  const p = ProfileStore.normalize({ ...base, quests: { main1: 5, cuoi1: 3 }, questprog: { main1: 8 }, drumpieces: [1] });
  assert.deepEqual(p.quests, { main1: 5, cuoi1: 3 });
  assert.deepEqual(p.questProg, { main1: 8 });
  assert.deepEqual(p.drumPieces, [1]);
});

test('normalize vẫn đọc file JSON cục bộ (camelCase) và điền mặc định', () => {
  const p = ProfileStore.normalize({ ...base, quests: { main1: 2 }, questProg: { main1: 4 }, drumPieces: [] });
  assert.deepEqual(p.quests, { main1: 2 });
  assert.deepEqual(p.questProg, { main1: 4 });
  const d = ProfileStore.normalize(base);
  assert.deepEqual(d.quests, { main1: 1 });
  assert.deepEqual(d.questProg, {});
  assert.deepEqual(d.drumPieces, []);
});
