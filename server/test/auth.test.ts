// Test đăng nhập nhanh (server giả), luật 1 nhân vật / tài khoản, và quy tắc tên. Không cần mạng hay Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfileStore } from '../src/store.ts';
import { AccountStore, AuthService } from '../src/auth.ts';
import { World } from '../src/world.ts';
import { emailError, passwordError, SESSION_MS } from '../../shared/auth.ts';
import { nameError, normalizeName, randomName, NAME_MAX } from '../../shared/names.ts';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'vdtl-auth-'));
  const profiles = new ProfileStore(dir);
  const auth = new AuthService('test-secret-0123456789', new AccountStore(dir, null), profiles);
  return { dir, profiles, auth, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('định dạng email và mật khẩu (6–20 ký tự)', () => {
  assert.equal(emailError('ban@gmail.com'), null);
  assert.equal(emailError('  Ban.Test+1@Mail.Example.vn '), null);
  for (const bad of ['', 'abc', 'a@b', 'a@b.c', 'a b@c.com', 'a@@b.com', 'a..b@c.com', '@c.com']) {
    assert.ok(emailError(bad), `phải từ chối email "${bad}"`);
  }
  assert.equal(passwordError('123456'), null);
  assert.equal(passwordError('a'.repeat(20)), null);
  assert.ok(passwordError('12345'));
  assert.ok(passwordError('a'.repeat(21)));
  assert.ok(passwordError(undefined));
});

test('quy tắc tên nhân vật: chữ Việt có/không dấu, số, dấu cách, tối đa 15', () => {
  for (const ok of ['Bạch Vân', 'Tieu Long 27', 'ThachSanh', 'Đỗ Quyên', 'Ưng 9']) assert.equal(nameError(ok), null, ok);
  for (const bad of ['A', 'Bạch Vân Kiếm Khách', 'Tên😀', 'abc_def', 'Long!', '小龙', 'Привет', '12345', 'x'.repeat(16)]) {
    assert.ok(nameError(bad), `phải từ chối tên "${bad}"`);
  }
  // gộp dấu cách và chuẩn hoá NFC (chữ có dấu gõ kiểu tổ hợp vẫn đếm đúng)
  assert.equal(normalizeName('  Bạch   Vân '), 'Bạch Vân');
  assert.equal(nameError('Ba\u0323ch Vân'), null);
});

test('xúc xắc: 2000 tên ngẫu nhiên đều hợp lệ, ≤ 15 ký tự, có cả có dấu và không dấu', () => {
  let accented = 0, plain = 0;
  for (let i = 0; i < 2000; i++) {
    const n = randomName();
    assert.equal(nameError(n), null, n);
    assert.ok([...n].length <= NAME_MAX, n);
    if (/[^\x00-\x7f]/.test(n)) accented++; else plain++;
  }
  assert.ok(accented > 200 && plain > 200, `có dấu ${accented}, không dấu ${plain}`);
});

test('đăng nhập nhanh: đúng định dạng là vào, phiên hết hạn sau 30 ngày, phiên giả bị từ chối', async () => {
  const { auth, done } = setup();
  try {
    assert.equal((await auth.quickLogin('sai', '123456')).ok, false);
    assert.equal((await auth.quickLogin('ban@gmail.com', '123')).ok, false);

    const r = await auth.quickLogin('Ban@Gmail.com', '123456');
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.res.email, 'ban@gmail.com');
    assert.equal(r.res.character, null);
    assert.ok(Math.abs(r.res.expiresAt - (Date.now() + SESSION_MS)) < 5000);
    assert.ok((await auth.me(r.res.session)).ok);

    // sửa phiên để đổi email -> chữ ký sai
    const [, sig] = r.res.session.split('.');
    const forged = `${Buffer.from(JSON.stringify({ e: 'khac@gmail.com', x: Date.now() + 1e9 })).toString('base64url')}.${sig}`;
    const f = await auth.me(forged);
    assert.equal(f.ok, false);
    if (!f.ok) assert.equal(f.code, 'auth');

    // sau 30 ngày phải đăng nhập lại
    auth.now = () => Date.now() + SESSION_MS + 1000;
    assert.equal((await auth.me(r.res.session)).ok, false);
  } finally { done(); }
});

test('mỗi tài khoản chỉ tạo 1 nhân vật, đăng nhập lại ra đúng nhân vật đó', async () => {
  const { auth, done } = setup();
  try {
    const r = await auth.quickLogin('mot@gmail.com', 'matkhau1');
    assert.ok(r.ok); if (!r.ok) return;
    const s = r.res.session;

    assert.equal((await auth.resolveJoin(s)).ok, false, 'chưa có nhân vật mà không gửi create');
    assert.equal((await auth.resolveJoin(s, { name: 'Tên😀', cls: 'mage' })).ok, false, 'tên lạ bị từ chối');
    assert.equal((await auth.resolveJoin(s, { name: 'Bạch Vân', cls: 'ninja' })).ok, false, 'môn phái lạ bị từ chối');

    const j1 = await auth.resolveJoin(s, { name: '  Bạch   Vân ', cls: 'mage' });
    assert.ok(j1.ok); if (!j1.ok) return;
    assert.equal(j1.created, true);
    assert.equal(j1.prof.name, 'Bạch Vân');

    // tạo lần 2: bị bỏ qua, vẫn vào đúng nhân vật cũ
    const j2 = await auth.resolveJoin(s, { name: 'Hắc Hổ', cls: 'warrior' });
    assert.ok(j2.ok); if (!j2.ok) return;
    assert.equal(j2.created, false);
    assert.equal(j2.prof.token, j1.prof.token);
    assert.equal(j2.prof.cls, 'mage');

    // đăng nhập lại (mật khẩu bất kỳ đúng định dạng) thấy nhân vật
    const again = await auth.quickLogin('mot@gmail.com', 'khac123');
    assert.ok(again.ok); if (!again.ok) return;
    assert.deepEqual(again.res.character, { name: 'Bạch Vân', cls: 'mage', lv: 1 });
  } finally { done(); }
});

test('2 yêu cầu tạo nhân vật cùng lúc chỉ ra 1 nhân vật', async () => {
  const { auth, done } = setup();
  try {
    const r = await auth.quickLogin('dua@gmail.com', '123456');
    assert.ok(r.ok); if (!r.ok) return;
    const [a, b] = await Promise.all([
      auth.resolveJoin(r.res.session, { name: 'Tiểu Long', cls: 'warrior' }),
      auth.resolveJoin(r.res.session, { name: 'Tiểu Hổ', cls: 'archer' }),
    ]);
    assert.ok(a.ok && b.ok);
    if (a.ok && b.ok) {
      assert.equal(a.prof.token, b.prof.token);
      assert.equal([a.created, b.created].filter(Boolean).length, 1);
    }
  } finally { done(); }
});

test('nhận lại nhân vật cũ trên máy: chỉ khi tài khoản chưa có nhân vật, và không ai nhận trùng', async () => {
  const { auth, profiles, done } = setup();
  try {
    const legacy = World.newProfile('11111111-2222-3333-4444-555555555555', 'boykutetua', 'mage');
    await profiles.save(legacy);

    const r1 = await auth.quickLogin('cu@gmail.com', '123456');
    assert.ok(r1.ok); if (!r1.ok) return;
    assert.equal((await auth.claim(r1.res.session, 'khong-hop-le')).ok, false);
    const c = await auth.claim(r1.res.session, legacy.token);
    assert.ok(c.ok); if (!c.ok) return;
    assert.equal(c.res.character?.name, 'boykutetua');

    const j = await auth.resolveJoin(r1.res.session, { name: 'Hắc Hổ', cls: 'warrior' });
    assert.ok(j.ok && j.prof.token === legacy.token, 'vào bằng nhân vật cũ, không tạo mới');

    // tài khoản khác không nhận được nhân vật đã có chủ
    const r2 = await auth.quickLogin('khac@gmail.com', '123456');
    assert.ok(r2.ok); if (!r2.ok) return;
    assert.equal((await auth.claim(r2.res.session, legacy.token)).ok, false);
  } finally { done(); }
});
