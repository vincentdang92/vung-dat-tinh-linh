import { useEffect, useRef, useState } from 'preact/hooks';
import { store, useStore, controls, loadLegacySave, clearLegacySave } from '../state.ts';
import type { LegacySave } from '../state.ts';
import {
  join, leave, castSkill, castUltimate, drinkPotion, dash, equip, sendChat,
  talkToNpc, buyItem, sellItem, sendTrivia,
  fishAction, cookRecipe, eatFood, sellBag, bagDrop, lightFire, trapSet, trapTake,
  farmPlow, farmPlant, farmWater, farmWeed, farmFertilize, farmHarvest, farmMill,
  coopAdd, coopFeed, coopCollect, coopClean, farmVisit, farmCheer,
  marketGet, marketSell, marketBuy, marketCancel, marketClaim, npcMarketBuy, stallSet,
  skillUpgrade, skillReset,
} from '../actions.ts';
import { quickLogin, refreshMe, claimLegacy, logout } from '../auth.ts';
import { CLASSES, WEAPONS, RARITY_COLOR, ULTIMATES, CLASS_SKILL_TREES, PASSIVE_SKILLS } from '../../../shared/data.ts';
import type { ClassId } from '../../../shared/data.ts';
import { DASH_CD, POTION_CD, INVENTORY_SIZE } from '../../../shared/constants.ts';
import { NPCS, QUESTS, SHOP_PRICES, TRIVIA_QUESTIONS, FOLK_ART_ENTRIES, VILLAGE_NOTICES } from '../../../shared/story.ts';
import { emailError, passwordError, PASSWORD_MIN, PASSWORD_MAX, SESSION_DAYS } from '../../../shared/auth.ts';
import type { CharacterSummary } from '../../../shared/auth.ts';
import { nameError, normalizeName, randomName, NAME_MIN, NAME_MAX } from '../../../shared/names.ts';
import { MAP_NAMES } from '../../../shared/map.ts';
import {
  LIFE_ITEMS, FOODS, RECIPES, LIFE_SKILLS, LIFE_SKILL_NAMES, BAG_KINDS, SELL_DAILY_CAP, CUI_PRICE, BAY_PRICE, HUNT, CATCH_NAME,
  FARM, FOLK_CHEERS, defaultFarm,
  lifeLevel, lifeNext, pickIngredients, unitSellPrice,
  CO_MO_SHOP, getTodayMarketEvent, getMarketSellPrice,
} from '../../../shared/life.ts';
import type { LifeSkill, FishTier, MarketListing } from '../../../shared/life.ts';
import { heroPreviewUrl, weaponIconUrl, leafIconUrl } from '../game/sprites/sheet.ts';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export function App() {
  const phase = useStore((s) => s.phase);
  if (phase === 'lobby') return <Lobby />;
  if (phase === 'connecting') return <div class="center-msg">Đang kết nối…</div>;
  if (phase === 'error') return <ErrorScreen />;
  return <Hud />;
}

// ------------------------------------------------------------------ Lobby

function Lobby() {
  const auth = useStore((s) => s.auth);
  // mở lại game: lấy cấp nhân vật mới nhất, phiên hết hạn thì tự về màn đăng nhập
  useEffect(() => { if (auth) void refreshMe(auth.session); }, [auth?.session]);

  return (
    <div class="lobby">
      <h1>Vùng đất Tinh linh</h1>
      <p class="sub">Nhập vai online màn hình dọc</p>

      {!auth ? <LoginCard /> : (
        <>
          <div class="account-bar">
            <span class="muted">👤 {auth.email}</span>
            <button class="link-btn" onClick={logout}>Đăng xuất</button>
          </div>
          {auth.character ? <ContinueCard c={auth.character} /> : <NewCharacter email={auth.email} session={auth.session} />}
        </>
      )}
      <p class="hint">Điện thoại: cần gạt trái để đi, nút phải để dùng chiêu. Máy tính: WASD, Space khinh công, Q chiêu, R bí kíp, E bình máu.</p>
    </div>
  );
}

const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Có lỗi xảy ra, hãy thử lại');
const clsOf = (c: string): ClassId => (CLASSES[c as ClassId] ? (c as ClassId) : 'warrior');

/** Đăng nhập nhanh: chỉ cần email và mật khẩu (6–20 ký tự) đúng định dạng. */
function LoginCard() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState({ email: false, pw: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const eErr = emailError(email);
  const pErr = passwordError(pw);
  const valid = !eErr && !pErr;

  const submit = async (ev: Event) => {
    ev.preventDefault();
    setTouched({ email: true, pw: true });
    if (!valid || busy) return;
    setBusy(true);
    setErr('');
    try {
      await quickLogin(email, pw); // thành công: store có phiên -> màn chính tự chuyển
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  };

  return (
    <form class="card" onSubmit={submit} noValidate>
      <b class="card-title">Đăng nhập nhanh</b>
      <label class="lbl" for="login-email">Email</label>
      <input
        id="login-email" class={`input ${touched.email && eErr ? 'bad' : ''}`} type="email" inputMode="email"
        autoComplete="email" maxLength={254} placeholder="ban@gmail.com" value={email}
        onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
        onBlur={() => setTouched((t) => ({ ...t, email: true }))}
      />
      {touched.email && eErr && <p class="field-err">{eErr}</p>}

      <label class="lbl" for="login-pw">Mật khẩu</label>
      <div class="input-wrap">
        <input
          id="login-pw" class={`input ${touched.pw && pErr ? 'bad' : ''}`} type={show ? 'text' : 'password'}
          autoComplete="current-password" maxLength={PASSWORD_MAX} placeholder={`${PASSWORD_MIN}–${PASSWORD_MAX} ký tự`} value={pw}
          onInput={(e) => setPw((e.target as HTMLInputElement).value)}
          onBlur={() => setTouched((t) => ({ ...t, pw: true }))}
        />
        <button type="button" class="input-icon" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShow(!show)}>
          {show ? '🙈' : '👁'}
        </button>
      </div>
      {touched.pw && pErr && <p class="field-err">{pErr}</p>}

      {err && <p class="form-err">{err}</p>}
      <button class="btn primary" type="submit" disabled={!valid || busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập nhanh'}</button>
      <p class="muted tiny note">Bản thử nghiệm: chỉ cần đúng định dạng. Ghi nhớ đăng nhập {SESSION_DAYS} ngày trên máy này.</p>
    </form>
  );
}

function CharRow({ name, cls, lv }: { name: string; cls: ClassId; lv?: number }) {
  return (
    <div class="row char-row">
      <img class="px char-avatar" src={heroPreviewUrl(cls)} alt="" width={48} height={48} />
      <div>
        <b>{name}</b>
        <div class="muted">{CLASSES[cls].name}{lv != null ? ` · Lv ${lv}` : ''}</div>
      </div>
    </div>
  );
}

/** Tài khoản đã có nhân vật: chỉ còn nút Tiếp tục chơi (không tạo thêm được). */
function ContinueCard({ c }: { c: CharacterSummary }) {
  return (
    <div class="card">
      <CharRow name={c.name} cls={clsOf(c.cls)} lv={c.lv} />
      <button class="btn primary" onClick={() => join()}>Tiếp tục chơi</button>
    </div>
  );
}

/** Tài khoản chưa có nhân vật: hỏi nhận lại nhân vật cũ trên máy (nếu có), nếu không thì tạo mới. */
function NewCharacter({ email, session }: { email: string; session: string }) {
  const [legacy] = useState(() => loadLegacySave());
  const [skip, setSkip] = useState(false);
  if (legacy && !skip) return <ClaimCard legacy={legacy} email={email} session={session} onSkip={() => setSkip(true)} />;
  return <CreateCard />;
}

function ClaimCard({ legacy, email, session, onSkip }: { legacy: LegacySave; email: string; session: string; onSkip: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const claim = async () => {
    setBusy(true);
    setErr('');
    try {
      await claimLegacy(session, legacy.token);
      clearLegacySave();
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  };
  return (
    <div class="card">
      <b class="card-title">Nhận lại nhân vật cũ?</b>
      <p class="muted tiny">Trên máy này có nhân vật chơi từ trước khi có đăng nhập:</p>
      <CharRow name={legacy.name} cls={clsOf(legacy.cls)} lv={legacy.lv} />
      <p class="muted tiny">Nhận nhân vật này làm nhân vật duy nhất của tài khoản <b>{email}</b>.</p>
      {err && <p class="form-err">{err}</p>}
      <button class="btn primary" disabled={busy} onClick={claim}>{busy ? 'Đang nhận…' : 'Nhận lại nhân vật cũ'}</button>
      <button class="btn ghost" disabled={busy} onClick={onSkip}>Không, tạo nhân vật mới</button>
    </div>
  );
}

/** Tạo nhân vật (1 lần duy nhất mỗi tài khoản): tên có nút xúc xắc, chọn môn phái, xác nhận trước khi tạo. */
function CreateCard() {
  const [name, setName] = useState(() => randomName());
  const [cls, setCls] = useState<ClassId>('warrior');
  const [touched, setTouched] = useState(false);
  const [rolls, setRolls] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const clean = normalizeName(name);
  const nErr = nameError(clean);
  const count = [...name].length;

  const roll = () => { setName(randomName()); setTouched(false); setRolls((r) => r + 1); };

  return (
    <div class="card">
      <label class="lbl" for="char-name">Tên nhân vật</label>
      <div class="input-wrap">
        <input
          id="char-name" class={`input name-input ${touched && nErr ? 'bad' : ''}`} maxLength={NAME_MAX} value={name}
          placeholder={`${NAME_MIN}–${NAME_MAX} ký tự`} autoComplete="off" spellcheck={false}
          onInput={(e) => { setName((e.target as HTMLInputElement).value.normalize('NFC')); setTouched(true); }}
          onBlur={() => setTouched(true)}
        />
        <span class="name-count">{count}/{NAME_MAX}</span>
        <button type="button" key={rolls} class={`input-icon dice ${rolls ? 'spin' : ''}`} aria-label="Tên ngẫu nhiên" title="Tên ngẫu nhiên" onClick={roll}>🎲</button>
      </div>
      {touched && nErr
        ? <p class="field-err">{nErr}</p>
        : <p class="muted tiny">Chữ tiếng Việt có dấu hoặc không dấu, số và dấu cách. Bấm 🎲 để lấy tên ngẫu nhiên.</p>}

      <label class="lbl">Chọn môn phái</label>
      <div class="classes">
        {(Object.keys(CLASSES) as ClassId[]).map((id) => {
          const c = CLASSES[id];
          return (
            <button key={id} class={`cls ${cls === id ? 'on' : ''}`} onClick={() => setCls(id)} style={{ '--c': hex(c.color) }}>
              <img class="px hero-preview" src={heroPreviewUrl(id)} alt={c.name} width={96} height={96} />
              <b>{c.name}</b>
              <small>{c.desc}</small>
            </button>
          );
        })}
      </div>
      <div class="cls-detail">
        <div><span>Máu</span><b>{CLASSES[cls].hp}</b></div>
        <div><span>Công</span><b>{CLASSES[cls].atk}</b></div>
        <div><span>Thủ</span><b>{CLASSES[cls].def}</b></div>
        <div><span>Tầm</span><b>{CLASSES[cls].range}</b></div>
      </div>
      <p class="skill-desc"><b>{CLASSES[cls].skill.name}:</b> {CLASSES[cls].skill.desc}</p>
      <p class="skill-desc" style={{ color: '#facc15' }}><b>Bí kíp {ULTIMATES[cls].name}:</b> {ULTIMATES[cls].desc}</p>
      <p class="warn-note">⚠ Mỗi tài khoản chỉ tạo được 1 nhân vật. Sau khi tạo không đổi được tên và môn phái.</p>
      <button class="btn primary" disabled={!!nErr} onClick={() => { setTouched(true); if (!nErr) setConfirm(true); }}>
        Vào game
      </button>

      {confirm && (
        <div class="modal-overlay" onClick={() => setConfirm(false)}>
          <div class="dialogue-card" onClick={(e) => e.stopPropagation()}>
            <b class="card-title">Tạo nhân vật này?</b>
            <CharRow name={clean} cls={cls} />
            <p class="muted tiny">Mỗi tài khoản chỉ tạo 1 lần. Sau khi tạo không đổi được tên và môn phái.</p>
            <button class="btn primary" onClick={() => join({ name: clean, cls })}>Xác nhận tạo</button>
            <button class="btn ghost" onClick={() => setConfirm(false)}>Sửa lại</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ErrorScreen() {
  const err = useStore((s) => s.error);
  return (
    <div class="center-msg">
      <p>{err || 'Có lỗi xảy ra'}</p>
      <button class="btn primary" onClick={leave}>Về màn hình chính</button>
    </div>
  );
}

// ------------------------------------------------------------------ HUD

function useNow(active: boolean) {
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = () => { setNow(performance.now()); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return now;
}

function Hud() {
  const hp = useStore((s) => s.hp);
  const maxHp = useStore((s) => s.maxHp);
  const me = useStore((s) => s.me);
  const name = useStore((s) => s.name);
  const cls = useStore((s) => s.cls);
  const ping = useStore((s) => s.ping);
  const online = useStore((s) => s.online);
  const invOpen = useStore((s) => s.invOpen);
  const dead = useStore((s) => s.dead);
  const nearNpc = useStore((s) => s.nearNpc);
  const dialogue = useStore((s) => s.dialogue);
  const shopOpen = useStore((s) => s.shopOpen);
  const triviaOpen = useStore((s) => s.triviaOpen);
  const codexOpen = useStore((s) => s.codexOpen);
  const noticeOpen = useStore((s) => s.noticeOpen);
  const mapId = useStore((s) => s.mapId);
  const bagOpen = useStore((s) => s.bagOpen);
  const cookOpen = useStore((s) => s.cookOpen);
  const farmOpen = useStore((s) => s.farmOpen);
  const marketOpen = useStore((s) => s.marketOpen);
  const skillOpen = useStore((s) => s.skillOpen);
  const modalOpen = !!dialogue || shopOpen || triviaOpen || codexOpen || noticeOpen || cookOpen || farmOpen || marketOpen || skillOpen;

  return (
    <>
      <div class="top">
        <div class="avatar" style={{ background: hex(CLASSES[cls].color) }}>{me?.lv ?? 1}</div>
        <div class="bars">
          <div class="nm">
            {name}
            {me?.title ? <span class="badge-title">[{me.title}]</span> : null}
            <span class="muted">· {CLASSES[cls].name}</span>
          </div>
          <div class="bar hp"><i style={{ width: `${(hp / maxHp) * 100}%` }} /><span>{hp}/{maxHp}</span></div>
          <div class="bar xp"><i style={{ width: `${me ? (me.xp / me.next) * 100 : 0}%` }} /></div>
          <div class="bar khi"><i style={{ width: `${me ? me.khi : 0}%` }} /><span class="khi-text">Khí {me?.khi ?? 0}/100</span></div>
        </div>
        <div class="top-right">
          <div class="gold">● {me?.gold ?? 0}</div>
          <div class="muted tiny">📍 {MAP_NAMES[mapId] ?? mapId}</div>
          <div class="muted tiny">{online} online · {ping}ms</div>
        </div>
      </div>

      <QuestTracker />

      {me?.visitFarm && <VisitingBanner farm={me.visitFarm} />}

      <div class="top-buttons">
        <button class="icon-btn skill-btn-wrap" title="Võ Học & Bí Kíp" onClick={() => store.set({ skillOpen: !skillOpen, invOpen: false, bagOpen: false, farmOpen: false, marketOpen: false })}>
          ⚔️
          {(me?.skills?.sp ?? 0) > 0 && <span class="badge-sp">{me?.skills?.sp}</span>}
        </button>
        <button class="icon-btn" title="Túi đồ" onClick={() => store.set({ invOpen: !invOpen, bagOpen: false, farmOpen: false, marketOpen: false, skillOpen: false })}>🎒</button>
        <button class="icon-btn" title="Giỏ Tre (Nghề Sống)" onClick={() => store.set({ bagOpen: !bagOpen, invOpen: false, farmOpen: false, marketOpen: false, skillOpen: false })}>🧺</button>
        <button class="icon-btn" title="Nông Trại & Canh Nông" onClick={() => store.set({ farmOpen: !farmOpen, invOpen: false, bagOpen: false, marketOpen: false, skillOpen: false })}>🌾</button>
        <button class="icon-btn" title="Chợ Phiên Làng Tre" onClick={() => {
          if (!marketOpen) { marketGet(); }
          store.set({ marketOpen: !marketOpen, invOpen: false, bagOpen: false, farmOpen: false, skillOpen: false });
        }}>🏮</button>
        <button class="icon-btn" title="Sổ tay Tranh Đông Hồ" onClick={() => store.set({ codexOpen: !codexOpen })}>🖼️</button>
        <button class="icon-btn" title="Cáo Thị Làng" onClick={() => store.set({ noticeOpen: !noticeOpen })}>📜</button>
        <button class="icon-btn" title="Kênh chat" onClick={() => store.set({ chatOpen: !store.get().chatOpen })}>💬</button>
      </div>

      <ChatLog />
      <Joystick />
      <ActionButtons />

      {!dead && !modalOpen && <LifeActions />}
      <CatchToast />

      {nearNpc && !modalOpen && (
        <button class="btn-talk" onClick={() => talkToNpc(nearNpc)}>
          💬 Nói chuyện ({NPCS[nearNpc]?.name})
        </button>
      )}

      {dialogue && <DialogueBox dialogue={dialogue} />}
      {shopOpen && <ShopModal />}
      {triviaOpen && <TriviaModal />}
      {codexOpen && <CodexModal />}
      {noticeOpen && <NoticeModal />}
      {cookOpen && <CookModal />}
      {farmOpen && <FarmModal />}
      {marketOpen && <MarketModal />}
      {skillOpen && <SkillModal />}
      {invOpen && <Inventory />}
      {bagOpen && <BagPanel />}
      {dead && <DeathOverlay />}
    </>
  );
}

// ------------------------------------------------------------------ Quest Tracker

function QuestTracker() {
  const me = useStore((s) => s.me);
  if (!me) return null;

  const q1 = me.quests?.main1 ?? 1;
  const q2 = me.quests?.main2 ?? 1;
  const prog = me.questProg ?? {};

  let mainTitle = '📜 Bếp Lửa Đình Làng (Vùng 1)';
  let mainText = 'Trò chuyện với Ông Táo ở đình làng';

  if (q1 < 5) {
    if (q1 === 1) mainText = `Diệt Bánh Trôi Tinh (${prog.main1 ?? 0}/8)`;
    else if (q1 === 2) mainText = 'Báo công với Ông Táo ở đình làng';
    else if (q1 === 3) mainText = `Tìm Lá Đa Cổ từ Cáo Tinh (${prog.main1_leaf ?? 0}/3)`;
    else if (q1 === 4) {
      const hasDrum = me.drumPieces?.includes(1);
      mainText = hasDrum ? 'Đem Mảnh Trống Đồng về cho Ông Táo' : 'Hạ Chúa Mộc Tinh ở Gốc Đa Cổ';
    }
  } else {
    mainTitle = '🌊 Sương Mù Bến Đò (Vùng 2)';
    if (q2 === 1) mainText = 'Trò chuyện với Bác Lái Đò ở Đầm Sen';
    else if (q2 === 2) mainText = `Hạ Cua Đá ven bờ sen (${prog.main2_crab ?? 0}/10)`;
    else if (q2 === 3) mainText = `Tìm Hạt Sen Đêm từ Ếch Lửa (${prog.main2_seed ?? 0}/4)`;
    else if (q2 === 4) mainText = `Trừ Ma Da dưới dòng Sông Ma (${prog.main2_mada ?? 0}/5)`;
    else if (q2 === 5) {
      const hasDrum = me.drumPieces?.includes(2);
      mainText = hasDrum ? 'Đem Mảnh Trống Đồng 2 về cho Ông Táo' : 'Hạ Chúa Thuồng Luồng ở Vực Sông';
    } else if (q2 === 6) {
      mainText = 'Đem Mảnh Trống Đồng 2 về cho Ông Táo ở Làng Tre';
    } else {
      mainTitle = '🦊 Rừng Sương Mù (Vùng 3)';
      mainText = 'Sắp ra mắt: Truy tìm Hồ Tinh Chín Đuôi!';
    }
  }

  // Nhiệm vụ phụ Cô Tấm
  const qTam = me.quests?.tam1;
  let tamText: string | null = null;
  if (qTam === 1) {
    const hasShoe = (prog.tam1_shoe ?? 0) >= 1;
    tamText = hasShoe ? 'Đem Chiếc Hài Thêu về cho Cô Tấm' : `Tìm Chiếc Hài Thêu (${prog.tam1_shoe ?? 0}/1)`;
  } else if (qTam === 2) {
    tamText = 'Đem Chiếc Hài Thêu về cho Cô Tấm';
  }

  // Nhiệm vụ phụ Chú Cuội
  const qCuoi = me.quests?.cuoi1;
  let cuoiText: string | null = null;
  if (qCuoi === 1) {
    cuoiText = `Tìm trâu cho Cuội: Diệt quái bìa rừng (${prog.cuoi1 ?? 0}/1)`;
  } else if (qCuoi === 2) {
    cuoiText = 'Quay lại nói chuyện với Chú Cuội';
  }

  return (
    <div class="quest-tracker">
      <div class="q-title">{mainTitle}</div>
      <div class="q-desc">{mainText}</div>
      {tamText && (
        <div class="side-quest">
          <div class="q-title side">🌸 Chiếc Hài Thêu</div>
          <div class="q-desc">{tamText}</div>
        </div>
      )}
      {cuoiText && (
        <div class="side-quest">
          <div class="q-title side" style={{ color: '#60a5fa' }}>🐃 Trâu Cho Cuội</div>
          <div class="q-desc">{cuoiText}</div>
        </div>
      )}
      <BuffChip />
    </div>
  );
}

// ------------------------------------------------------------------ Nút Kỹ Năng & Bí Kíp

function CdButton(props: {
  icon?: string; label: string; sub?: string; levelTag?: string; readyAt: number; total: number; onPress: () => void;
  big?: boolean; disabled?: boolean; isUlt?: boolean; ready?: boolean; extraClass?: string;
}) {
  const cooling = props.readyAt > performance.now();
  const now = useNow(cooling);
  const left = Math.max(0, props.readyAt - now);
  const pct = props.total > 0 ? (left / props.total) * 100 : 0;
  const wasCooling = useRef(cooling);
  const [justReady, setJustReady] = useState(false);

  useEffect(() => {
    if (wasCooling.current && !cooling) {
      setJustReady(true);
      const timer = setTimeout(() => setJustReady(false), 600);
      return () => clearTimeout(timer);
    }
    wasCooling.current = cooling;
  }, [cooling]);

  const classes = [
    'act',
    props.big ? 'big' : '',
    props.isUlt ? 'ult' : '',
    props.ready ? 'ult-ready' : '',
    justReady ? 'just-ready' : '',
    props.extraClass ?? '',
    left > 0 || props.disabled ? 'cool' : '',
  ].filter(Boolean).join(' ');

  return (
    <button class={classes} onPointerDown={(e) => { e.preventDefault(); props.onPress(); }}>
      {props.levelTag && <span class="act-level-tag">{props.levelTag}</span>}
      {left > 0 && <span class="cd" style={{ background: `conic-gradient(rgba(0,0,0,.65) ${pct}%, transparent 0)` }} />}
      {props.icon && <span class="act-icon">{props.icon}</span>}
      <span class="act-label">{props.label}</span>
      {left > 0 ? <span class="act-sub">{(left / 1000).toFixed(1)}s</span> : props.sub && <span class="act-sub">{props.sub}</span>}
    </button>
  );
}

function ActionButtons() {
  const ready = useStore((s) => s.readyAt);
  const me = useStore((s) => s.me);
  const cls = useStore((s) => s.cls);
  const potions = me?.inv.find((i) => i.key === 'potion')?.qty ?? 0;
  const khi = me?.khi ?? 0;
  const ultReady = khi >= 100;
  const tree = CLASS_SKILL_TREES[cls];
  const mainLv = me?.skills?.mainLv ?? 1;
  const ultLv = me?.skills?.ultLv ?? 1;

  return (
    <div class="actions">
      {/* Nút Bí kíp trấn phái: nằm phía trên nút chiêu */}
      <CdButton
        icon={tree.ult.icon}
        label={tree.ult.name.split(' ')[0]}
        levelTag={`T.${ultLv}`}
        sub={ultReady ? 'BÍ KÍP!' : `${khi}%`}
        readyAt={0}
        total={100}
        onPress={castUltimate}
        isUlt
        ready={ultReady}
        disabled={!ultReady}
      />
      <CdButton
        icon={tree.main.icon}
        label={tree.main.name}
        levelTag={`C.${mainLv}`}
        readyAt={ready.skill}
        total={me?.skillCd ?? 1}
        onPress={castSkill}
        big
      />
      <CdButton
        icon="💨"
        label="Khinh công"
        readyAt={ready.dash}
        total={DASH_CD}
        onPress={dash}
        extraClass="dash"
      />
      <CdButton
        icon="🍶"
        label="Bình máu"
        sub={`x${potions}`}
        readyAt={ready.potion}
        total={POTION_CD}
        onPress={drinkPotion}
        disabled={!potions}
        extraClass="potion"
      />
    </div>
  );
}

function Joystick() {
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pid = useRef<number | null>(null);
  const R = 48;

  const move = (cx: number, cy: number, b: { x: number; y: number }) => {
    let dx = cx - b.x, dy = cy - b.y;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    setKnob({ x: dx, y: dy });
    const m = Math.min(1, d / R);
    if (m < 0.15) { controls.x = 0; controls.y = 0; return; }
    controls.x = (dx / (d || 1)) * m;
    controls.y = (dy / (d || 1)) * m;
  };
  const end = () => {
    pid.current = null; setBase(null); setKnob({ x: 0, y: 0 });
    controls.x = 0; controls.y = 0;
  };

  return (
    <div
      class="joy-zone"
      onPointerDown={(e) => {
        if (pid.current != null) return;
        pid.current = e.pointerId;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const b = { x: e.clientX, y: e.clientY };
        setBase(b); move(e.clientX, e.clientY, b);
      }}
      onPointerMove={(e) => { if (e.pointerId === pid.current && base) move(e.clientX, e.clientY, base); }}
      onPointerUp={(e) => { if (e.pointerId === pid.current) end(); }}
      onPointerCancel={(e) => { if (e.pointerId === pid.current) end(); }}
    >
      {base ? (
        <div class="joy" style={{ left: `${base.x}px`, top: `${base.y}px` }}>
          <div class="knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
      ) : (
        <div class="joy ghost-joy"><div class="knob" /></div>
      )}
    </div>
  );
}

function DeathOverlay() {
  const at = useStore((s) => s.respawnAt);
  const now = useNow(true);
  return (
    <div class="death">
      <b>Bạn đã gục ngã</b>
      <span>Hồi sinh ở Làng Tre sau {Math.max(0, Math.ceil((at - now) / 1000))}s</span>
    </div>
  );
}

// ------------------------------------------------------------------ Nghề Sống: câu cá, nấu nướng, Giỏ Tre

const TIER_NAME: Record<FishTier, string> = { common: 'Thường', uncommon: 'Khá', rare: 'Hiếm', legend: 'Huyền thoại' };
const UNIT: Record<string, string> = { fish: 'con', meat: 'phần', food: 'phần', mat: 'cành', junk: 'cái' };
const unitOf = (key: string) => LIFE_ITEMS[key]?.unit ?? UNIT[LIFE_ITEMS[key]?.kind ?? 'junk'];

/** Đồng hồ thô (mỗi `ms`), dùng cho đếm ngược phút:giây đỡ tốn hơn requestAnimationFrame. */
function useClock(ms: number, active: boolean) {
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(performance.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return now;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Nút nổi khi đứng sát mép nước / cạnh bếp / chỗ đặt bẫy; đang câu thì hiện phao + nút GIẬT, đang nấu thì thanh tiến độ. */
function LifeActions() {
  const fishing = useStore((s) => s.fishing);
  const cooking = useStore((s) => s.cooking);
  const nearWater = useStore((s) => s.nearWater);
  const cookPlace = useStore((s) => s.cookPlace);
  const nearTrap = useStore((s) => s.nearTrap);
  const canTrap = useStore((s) => s.canTrap);
  const mapId = useStore((s) => s.mapId);
  if (fishing) return <FishingHud f={fishing} />;
  if (cooking) return <CookBar c={cooking} />;
  if (!nearWater && !cookPlace && !nearTrap && !canTrap && mapId !== 'vuon_nha') return null;
  return (
    <div class="life-actions">
      {mapId === 'vuon_nha' && (
        <button class="life-btn farm" onClick={() => store.set({ farmOpen: true })}>🌾 Nông Trại</button>
      )}
      {nearWater && (
        <button class="life-btn fish" onPointerDown={(e) => { e.preventDefault(); fishAction(); }}>🎣 Thả câu</button>
      )}
      {cookPlace && (
        <button class="life-btn cook" onClick={() => store.set({ cookOpen: true })}>
          {cookPlace === 'bep' ? (mapId === 'vuon_nha' ? '🍳 Bếp Nhà' : '🍳 Bếp Ông Táo') : '🔥 Nướng bên lửa'}
        </button>
      )}
      {nearTrap && <TrapButton id={nearTrap.id} ready={nearTrap.ready} />}
      {canTrap && <button class="life-btn trap" onClick={trapSet}>🪢 Đặt bẫy</button>}
    </div>
  );
}

/** Bẫy sập rồi thì "Thu bẫy"; chưa sập thì đếm ngược, bấm là gỡ bẫy về (không được gì). */
function TrapButton({ id, ready }: { id: number; ready: boolean }) {
  const at = useStore((s) => s.trapReady[id] ?? 0);
  const now = useClock(1000, !ready);
  const [arm, setArm] = useState(false);
  useEffect(() => setArm(false), [id, ready]);
  if (ready) return <button class="life-btn trap ready" onClick={() => trapTake(id)}>🪤 Thu bẫy</button>;
  return (
    <button class="life-btn trap wait" onClick={() => { if (!arm) { setArm(true); return; } trapTake(id, true); }}>
      {arm ? 'Gỡ bẫy về? (chưa bắt được gì)' : `⏳ Bẫy chưa sập · ${mmss(at - now)}`}
    </button>
  );
}

function FishingHud({ f }: { f: NonNullable<ReturnType<typeof store.get>['fishing']> }) {
  const bite = f.s === 'bite';
  let text = 'Đang chờ cá cắn câu…';
  if (bite) text = f.n && f.n > 1 ? `Phao chìm! Cá to, giật ${f.n} lần!` : 'Phao chìm! GIẬT NGAY!';
  else if (f.n) text = `Cá to đang vùng vẫy… chờ phao chìm rồi giật tiếp (còn ${f.n})`;
  return (
    <div class="fish-hud">
      <div class={`fish-status ${bite ? 'bite' : ''}`}>
        <b>{bite ? '‼ ' : '🎣 '}{text}</b>
        {f.social && <div class="tiny">🤝 Ngồi câu cùng bạn: cá cắn nhanh hơn</div>}
        {!bite && <div class="tiny muted">Giật sớm là cá chạy · Đi chỗ khác để thu cần</div>}
      </div>
      <button class={`reel-btn ${bite ? 'bite' : ''}`} onPointerDown={(e) => { e.preventDefault(); fishAction(); }}>
        GIẬT!
        <small>phím F</small>
      </button>
    </div>
  );
}

function CookBar({ c }: { c: NonNullable<ReturnType<typeof store.get>['cooking']> }) {
  const now = useNow(true);
  const pct = Math.min(100, Math.max(0, (1 - (c.until - now) / c.ms) * 100));
  return (
    <div class="cook-bar">
      <span>🍳 Đang nấu {RECIPES[c.recipe]?.name ?? 'món ăn'}…</span>
      <div class="bar"><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function CatchToast() {
  const t = useStore((s) => s.catchToast);
  useEffect(() => {
    if (!t) return;
    const id = window.setTimeout(() => { if (store.get().catchToast === t) store.set({ catchToast: null }); }, 2600);
    return () => clearTimeout(id);
  }, [t]);
  if (!t) return null;
  const it = LIFE_ITEMS[t.key];
  const tier = it?.tier ?? (it?.kind === 'junk' ? 'junk' : it?.kind === 'meat' ? 'meat' : 'common');
  const verb = t.how === 'hunt' ? 'Săn được' : t.how === 'trap' ? `Bẫy sập! Được ${CATCH_NAME[t.key] ?? ''}` : 'Câu được';
  const ex = t.extra ? LIFE_ITEMS[t.extra] : null;
  return (
    <div key={t.at} class={`catch-toast tier-${tier}`}>
      <span class="ct-icon">{it?.icon ?? '❓'}</span>
      <div>
        <div class="tiny muted">{verb}</div>
        <b>{it?.name ?? t.key}{t.qty && t.qty > 1 ? ` ×${t.qty}` : ''}</b>
        <div class="tiny">
          {t.kg != null ? `${t.kg} kg` : ''}
          {it?.tier ? `${t.kg != null ? ' · ' : ''}${TIER_NAME[it.tier]}` : ''}
          {ex ? `+ ${ex.icon} ${ex.name}` : ''}
        </div>
      </div>
    </div>
  );
}

/** Buff ăn uống đang có (chỉ 1 món một lúc), đếm ngược theo giờ thật. */
function BuffChip() {
  const key = useStore((s) => s.me?.life?.buff?.key);
  const until = useStore((s) => s.buffUntil);
  const now = useClock(1000, !!key);
  if (!key || !until) return null;
  const left = until - now;
  if (left <= 0) return null;
  const food = FOODS[key];
  return (
    <div class="buff-chip" title={food?.desc}>
      {LIFE_ITEMS[key]?.icon} {food?.buff?.label ?? LIFE_ITEMS[key]?.name} · {mmss(left)}
    </div>
  );
}

function BagPanel() {
  const me = useStore((s) => s.me);
  const trapReady = useStore((s) => s.trapReady);
  const [sel, setSel] = useState<string | null>(null);
  const [dropArm, setDropArm] = useState<string | null>(null);
  const traps = me?.life.traps ?? [];
  const now = useClock(1000, traps.length > 0);
  if (!me) return null;
  const life = me.life;
  const order: Record<string, number> = { food: 0, meat: 1, fish: 2, farm: 3, mat: 4, junk: 5 };
  const items = Object.entries(life.bag)
    .filter(([k, q]) => q > 0 && LIFE_ITEMS[k])
    .sort(([a], [b]) => (order[LIFE_ITEMS[a].kind] - order[LIFE_ITEMS[b].kind]) || LIFE_ITEMS[a].name.localeCompare(LIFE_ITEMS[b].name, 'vi'));
  const selItem = sel && life.bag[sel] ? LIFE_ITEMS[sel] : null;
  const pick = (k: string) => { setSel(sel === k ? null : k); setDropArm(null); };
  const skillIcon: Record<LifeSkill, string> = { fish: '🎣', hunt: '🏹', cook: '🍳', farm: '🌾' };

  return (
    <div class="panel bag-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div class="panel-head">
        <b>🧺 Giỏ Tre</b>
        <button class="icon-btn small" onClick={() => store.set({ bagOpen: false })}>✕</button>
      </div>

      <div class="life-skills">
        {LIFE_SKILLS.map((k) => {
          const xp = life.xp[k] ?? 0;
          const next = lifeNext(xp);
          return (
            <div key={k} class="life-skill">
              <div class="ls-head"><b>{skillIcon[k]} {LIFE_SKILL_NAMES[k]}</b><span>Cấp {lifeLevel(xp)}</span></div>
              <div class="bar ls-bar"><i style={{ width: next ? `${Math.min(100, (xp / next) * 100)}%` : '100%' }} /><span>{next ? `${xp}/${next}` : 'Tối đa'}</span></div>
            </div>
          );
        })}
      </div>
      {life.best && <div class="muted tiny">🏆 Cá to nhất: {LIFE_ITEMS[life.best.key]?.name} nặng {life.best.kg} kg</div>}

      {traps.length > 0 && (
        <>
          <div class="lbl">Bẫy đã đặt ({traps.length}/{HUNT.trapCount(lifeLevel(life.xp.hunt ?? 0))})</div>
          <div class="trap-list">
            {traps.map((tr) => {
              const left = (trapReady[tr.id] ?? 0) - now;
              return (
                <div key={tr.id} class={`trap-row ${left <= 0 ? 'ready' : ''}`}>
                  <span>🪢 {MAP_NAMES[tr.map]}</span>
                  <span>{left <= 0 ? '✅ Đã sập, ra thu thôi!' : `⏳ ${mmss(left)}`}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div class="lbl">Đồ trong giỏ ({items.length}/{BAG_KINDS} loại)</div>
      {items.length === 0 ? (
        <p class="muted tiny">Giỏ còn trống. Ra bờ ao, bờ sông hay bến đò thả câu thử xem!</p>
      ) : (
        <div class="grid bag-grid">
          {items.map(([k, q]) => {
            const it = LIFE_ITEMS[k];
            return (
              <button key={k} class={`slot bag-slot tier-${it.tier ?? it.kind} ${sel === k ? 'on' : ''}`} onClick={() => pick(k)} title={it.name}>
                <span>{it.icon}</span>
                <small>{it.name}</small>
                <small class="plus">x{q}</small>
              </button>
            );
          })}
        </div>
      )}

      {selItem && sel && (
        <div class="bag-detail">
          <b>{selItem.icon} {selItem.name}</b>
          <div class="muted tiny">
            {FOODS[sel]?.desc ?? selItem.desc ?? (selItem.tier ? `Cá loại ${TIER_NAME[selItem.tier].toLowerCase()}` : '')}
            {selItem.sell > 0 ? ` · Bán ${selItem.sell} vàng/${unitOf(sel)}` : ''}
          </div>
          <div class="row-btns">
            {FOODS[sel] && <button class="btn primary small" onClick={() => eatFood(sel)}>😋 Ăn</button>}
            {sel === 'cui' && <button class="btn primary small" onClick={lightFire}>🔥 Nhóm lửa</button>}
            <button class="btn ghost small" onClick={() => {
              if (dropArm !== sel) { setDropArm(sel); return; }
              bagDrop(sel); setSel(null); setDropArm(null);
            }}>{dropArm === sel ? 'Chắc chắn bỏ?' : 'Bỏ hết'}</button>
          </div>
        </div>
      )}

      <button class="btn ghost" disabled={!life.bag.cui} onClick={lightFire}>🔥 Nhóm lửa trại (tốn 1 Cành củi · có {life.bag.cui ?? 0})</button>
      <p class="muted tiny">
        Đứng sát mép nước rồi bấm 🎣 (phím F) để thả câu, phao chìm thì GIẬT! Thỏ, gà rừng ở bìa rừng Làng Tre, le le ở Đầm Sen:
        đuổi theo hạ là có thịt. Mua 🪢 bẫy ở Bà Hàng Nước, đặt trên bãi cỏ ngoài làng, 5–15 phút sau quay lại thu.
        Nướng bên lửa trại, nấu canh/kho/om ở Bếp Ông Táo. Mỗi lúc chỉ có tác dụng của 1 món ăn.
      </p>
    </div>
  );
}

function CookModal() {
  const me = useStore((s) => s.me);
  const place = useStore((s) => s.cookPlace);
  const close = () => store.set({ cookOpen: false });
  if (!me) return null;
  const bag = me.life.bag;
  const lv = lifeLevel(me.life.xp.cook ?? 0);
  return (
    <div class="modal-overlay" onClick={close}>
      <div class="shop-card cook-card" onClick={(e) => e.stopPropagation()}>
        <div class="dlg-header">
          <b>{place === 'bep' ? '🍳 Bếp Ông Táo' : place === 'fire' ? '🔥 Nướng bên lửa trại' : '🍳 Nấu ăn'}</b>
          <button class="icon-btn small" onClick={close}>✕</button>
        </div>
        <div class="muted tiny">
          Nghề Nấu nướng cấp {lv}.{place !== 'bep' ? ' Lửa trại chỉ nướng được; canh và cá kho cần nồi niêu ở Bếp Ông Táo.' : ' Nấu cạnh bạn bè được thêm 50% kinh nghiệm.'}
        </div>
        {!place && <p class="tiny warn">Bạn đã rời xa bếp lửa.</p>}
        <div class="sell-list cook-list">
          {Object.values(RECIPES).map((r) => {
            const have = !!pickIngredients(bag, r);
            const needBep = r.fire === 'bep' && place !== 'bep';
            const lowLv = lv < r.minLv;
            const ok = have && !needBep && !lowLv && !!place;
            return (
              <div key={r.key} class={`shop-row cook-row ${ok ? '' : 'dim'}`}>
                <span class="ct-icon">{LIFE_ITEMS[r.key]?.icon}</span>
                <div class="grow">
                  <b>{r.name}</b>
                  <div class="tiny">
                    {r.needs.map((n) => {
                      const got = n.keys.reduce((s, k) => s + (bag[k] ?? 0), 0);
                      return `${n.qty} ${n.keys.map((k) => LIFE_ITEMS[k]?.name).join(' / ')} (có ${got})`;
                    }).join(' + ')}
                  </div>
                  <div class="muted tiny">{FOODS[r.key]?.desc}</div>
                  {lowLv && <div class="tiny warn">Cần nghề Nấu nướng cấp {r.minLv}</div>}
                  {!lowLv && needBep && <div class="tiny warn">Cần nồi niêu ở Bếp Ông Táo</div>}
                </div>
                <button class="btn primary small" disabled={!ok} onClick={() => cookRecipe(r.key)}>Nấu</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Thu mua nông/thuỷ sản trong Giỏ Tre (Bà Hàng Nước và Bác Lái Đò). */
function SellLifeSection({ me }: { me: NonNullable<ReturnType<typeof store.get>['me']> }) {
  const sold = me.life.soldToday;
  const items = Object.entries(me.life.bag).filter(([k, q]) => q > 0 && (LIFE_ITEMS[k]?.sell ?? 0) > 0);
  return (
    <div class="shop-section">
      <label class="lbl">Bán nông/thuỷ sản <span class="muted tiny">· hôm nay {sold}/{SELL_DAILY_CAP} vàng</span></label>
      {items.length === 0 ? (
        <p class="muted tiny">Giỏ Tre chưa có gì bán được. Ra ao câu cá nhé!</p>
      ) : (
        <div class="sell-list">
          {items.map(([k, q]) => {
            const it = LIFE_ITEMS[k];
            const price = unitSellPrice(k, sold);
            return (
              <div key={k} class="shop-row">
                <span class="ct-icon">{it.icon}</span>
                <div class="grow">
                  <b>{it.name}</b> <span class="muted tiny">x{q}</span>
                  <div class="muted tiny">{price} vàng/{unitOf(k)}{price < it.sell ? ' (quá mức hôm nay)' : ''}</div>
                </div>
                <div class="row-btns">
                  <button class="btn ghost small" onClick={() => sellBag(k, 1)}>Bán 1</button>
                  {q > 1 && <button class="btn primary small" onClick={() => sellBag(k, q)}>Bán hết</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {sold >= SELL_DAILY_CAP && <p class="tiny warn">Hôm nay bán nhiều rồi, thương lái chỉ trả 1/4 giá. Mai quay lại nhé!</p>}
    </div>
  );
}

// ------------------------------------------------------------------ Hộp Thoại & Cửa Hàng

function DialogueBox({ dialogue }: { dialogue: NonNullable<ReturnType<typeof store.get>['dialogue']> }) {
  const [page, setPage] = useState(0);
  const currentLine = dialogue.lines[page] ?? dialogue.lines[0];
  const isLast = page >= dialogue.lines.length - 1;

  const handleNext = () => {
    if (isLast) {
      store.set({ dialogue: null });
    } else {
      setPage(page + 1);
    }
  };

  return (
    <div class="modal-overlay" onClick={() => store.set({ dialogue: null })}>
      <div class="dialogue-card" onClick={(e) => e.stopPropagation()}>
        <div class="dlg-header">
          <b>{dialogue.title}</b>
          <button class="icon-btn small" onClick={() => store.set({ dialogue: null })}>✕</button>
        </div>
        <p class="dlg-text">"{currentLine}"</p>
        <div class="dlg-actions">
          {dialogue.npcId === 'nuoc' && (
            <>
              <button class="btn primary" onClick={() => { store.set({ dialogue: null, shopOpen: true, shopNpc: 'nuoc' }); }}>
                Mở Cửa Hàng
              </button>
              <button class="btn primary" style={{ background: '#0284c7', color: '#fff' }} onClick={() => { store.set({ dialogue: null, triviaOpen: true, triviaResult: null }); }}>
                Đố Vui 🍵
              </button>
            </>
          )}
          {dialogue.npcId === 'do' && (
            <button class="btn primary" style={{ background: '#0e7490', color: '#fff' }} onClick={() => { store.set({ dialogue: null, shopOpen: true, shopNpc: 'do' }); }}>
              Bán cá 🐟
            </button>
          )}
          {dialogue.npcId === 'caothi' && (
            <button class="btn primary" onClick={() => { store.set({ dialogue: null, noticeOpen: true }); }}>
              Xem Cáo Thị 📜
            </button>
          )}
          {dialogue.npcId === 'mo' && (
            <button class="btn primary" style={{ background: '#ec4899', color: '#fff' }} onClick={() => {
              store.set({ dialogue: null, marketOpen: true, marketTab: 'npc' });
              marketGet();
            }}>
              Vào Chợ Phiên 🏮
            </button>
          )}
          <button class="btn ghost" onClick={handleNext}>
            {isLast ? 'Đóng' : 'Tiếp tục ▶'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShopModal() {
  const me = useStore((s) => s.me);
  const npc = useStore((s) => s.shopNpc);
  if (!me) return null;
  const close = () => store.set({ shopOpen: false });

  if (npc === 'do') {
    return (
      <div class="modal-overlay" onClick={close}>
        <div class="shop-card" onClick={(e) => e.stopPropagation()}>
          <div class="dlg-header">
            <b>🛶 Bác Lái Đò thu mua thuỷ sản</b>
            <button class="icon-btn small" onClick={close}>✕</button>
          </div>
          <SellLifeSection me={me} />
        </div>
      </div>
    );
  }

  const weaponsToSell = me.inv.filter((it) => {
    const w = WEAPONS[it.key];
    return w && it.key !== me.weapon;
  });

  return (
    <div class="modal-overlay" onClick={close}>
      <div class="shop-card" onClick={(e) => e.stopPropagation()}>
        <div class="dlg-header">
          <b>Quán Nước Giếng Làng</b>
          <button class="icon-btn small" onClick={close}>✕</button>
        </div>
        <div class="shop-section">
          <label class="lbl">Mua vật phẩm</label>
          <div class="shop-row">
            <div>
              <b>Bình máu hồi phục</b>
              <div class="muted tiny">Hồi 40% máu tối đa</div>
            </div>
            <button class="btn primary" onClick={() => buyItem('potion')} disabled={me.gold < SHOP_PRICES.buyPotion}>
              Mua (10 vàng)
            </button>
          </div>
          <div class="shop-row">
            <div>
              <b>🪵 Cành củi</b>
              <div class="muted tiny">Nhóm lửa trại để nướng cá (có {me.life.bag.cui ?? 0})</div>
            </div>
            <button class="btn primary" onClick={() => buyItem('cui')} disabled={me.gold < CUI_PRICE}>
              Mua ({CUI_PRICE} vàng)
            </button>
          </div>
          <div class="shop-row">
            <div>
              <b>🪢 Bẫy thòng lọng</b>
              <div class="muted tiny">Đặt trên bãi cỏ ngoài làng, 5–15 phút sau quay lại thu thỏ, gà rừng, le le. Thu về dùng lại được (có {me.life.bag.bay ?? 0})</div>
            </div>
            <button class="btn primary" onClick={() => buyItem('bay')} disabled={me.gold < BAY_PRICE}>
              Mua ({BAY_PRICE} vàng)
            </button>
          </div>
          <div class="shop-row">
            <div>
              <b>🌾 Giống lúa tẻ</b>
              <div class="muted tiny">Gieo ruộng nước Vườn Nhà, 3 phút chín (có {me.life.bag.giong_te ?? 0})</div>
            </div>
            <button class="btn primary" onClick={() => buyItem('giong_te')} disabled={me.gold < FARM.crops.giong_te.seedCost}>
              Mua ({FARM.crops.giong_te.seedCost} vàng)
            </button>
          </div>
          <div class="shop-row">
            <div>
              <b>🌾 Giống lúa nếp</b>
              <div class="muted tiny">Nếp cái hoa vàng thơm dẻo, 5 phút chín (có {me.life.bag.giong_nep ?? 0})</div>
            </div>
            <button class="btn primary" onClick={() => buyItem('giong_nep')} disabled={me.gold < FARM.crops.giong_nep.seedCost}>
              Mua ({FARM.crops.giong_nep.seedCost} vàng)
            </button>
          </div>
          <div class="shop-row">
            <div>
              <b>🐥 Gà con giống</b>
              <div class="muted tiny">Thả vào chuồng gà Vườn Nhà, cho ăn lớn đẻ trứng (có {me.life.bag.ga_con ?? 0})</div>
            </div>
            <button class="btn primary" onClick={() => buyItem('ga_con')} disabled={me.gold < FARM.chickCost}>
              Mua ({FARM.chickCost} vàng)
            </button>
          </div>
        </div>
        <SellLifeSection me={me} />
        <div class="shop-section">
          <label class="lbl">Thu mua vũ khí cũ</label>
          {weaponsToSell.length === 0 ? (
            <p class="muted tiny">Không có vũ khí phụ để bán.</p>
          ) : (
            <div class="sell-list">
              {weaponsToSell.map((it) => {
                const w = WEAPONS[it.key];
                const price = SHOP_PRICES.sellWeapon[w.rarity];
                return (
                  <div key={it.uid} class="shop-row">
                    <img class="px wpn-icon" src={weaponIconUrl(it.key)} alt="" width={36} height={36} />
                    <div class="grow">
                      <b style={{ color: hex(RARITY_COLOR[w.rarity]) }}>{w.name}</b>
                      <div class="muted tiny">+{w.atk} Công</div>
                    </div>
                    <button class="btn ghost" onClick={() => sellItem(it.uid)}>
                      Bán (+{price} vàng)
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Túi Đồ & Mảnh Trống Đồng

function Inventory() {
  const me = useStore((s) => s.me);
  const cls = useStore((s) => s.cls);
  if (!me) return null;
  const cur = WEAPONS[me.weapon];
  const slots = Array.from({ length: INVENTORY_SIZE }, (_, i) => me.inv[i]);
  const drumPieces = me.drumPieces ?? [];

  return (
    <div class="panel" onPointerDown={(e) => e.stopPropagation()}>
      <div class="panel-head">
        <b>Túi đồ</b>
        <button class="icon-btn small" onClick={() => store.set({ invOpen: false })}>✕</button>
      </div>

      <div class="drum-box">
        <div class="lbl">Trống Đồng Linh (+5% Máu / Mảnh)</div>
        <div class="drum-grid">
          {[1, 2, 3, 4].map((id) => {
            const has = drumPieces.includes(id);
            return (
              <div key={id} class={`drum-slot ${has ? 'active' : ''}`}>
                <span>{has ? '🥁' : '🔒'}</span>
                <small>Mảnh {id}</small>
              </div>
            );
          })}
        </div>
      </div>

      <div class="equipped">
        <div class="slot" style={{ borderColor: hex(RARITY_COLOR[cur.rarity]) }}>
          <img class="px wpn-icon" src={weaponIconUrl(me.weapon)} alt={cur.name} width={48} height={48} />
        </div>
        <div>
          <b style={{ color: hex(RARITY_COLOR[cur.rarity]) }}>{cur.name}</b>
          <div class="muted tiny">Công {me.stats.atk} · Thủ {me.stats.def} · Tầm {me.stats.range} · Máu {me.stats.maxHp}</div>
        </div>
      </div>

      <div class="grid">
        {slots.map((it, i) => {
          if (!it) return <div key={`e${i}`} class="slot empty" />;
          const w = WEAPONS[it.key];
          if (w) {
            const usable = w.cls === cls;
            return (
              <button key={it.uid} class={`slot ${usable ? '' : 'dim'}`} style={{ borderColor: hex(RARITY_COLOR[w.rarity]) }}
                onClick={() => usable && equip(it.uid)} title={w.name}>
                <img class="px wpn-icon" src={weaponIconUrl(it.key)} alt="" width={36} height={36} />
                <small>{w.name}</small>
                <small class="plus">+{w.atk}</small>
              </button>
            );
          }
          if (it.key === 'leaf') {
            return (
              <div key={it.uid} class="slot"><img class="px wpn-icon" src={leafIconUrl()} alt="" width={32} height={36} /><small>Lá Đa</small><small class="plus">x{it.qty}</small></div>
            );
          }
          return (
            <div key={it.uid} class="slot"><span>🧪</span><small>Bình máu</small><small class="plus">x{it.qty}</small></div>
          );
        })}
      </div>
      <p class="muted tiny">Chạm vũ khí để trang bị. Đồ tốt hơn được tự trang bị khi nhặt.</p>
      <button class="btn ghost" onClick={leave}>Thoát về sảnh</button>
    </div>
  );
}

function ChatLog() {
  const chat = useStore((s) => s.chat);
  const open = useStore((s) => s.chatOpen);
  const [text, setText] = useState('');
  const lines = open ? chat.slice(-12) : chat.slice(-5);
  return (
    <div class={`chat ${open ? 'open' : ''}`}>
      <div class="lines">
        {lines.map((l) => (
          <div key={l.id} class={l.sys ? 'sys' : ''}>{l.from && <b>{l.from}: </b>}{l.text}</div>
        ))}
      </div>
      {open && (
        <form onSubmit={(e) => { e.preventDefault(); sendChat(text); setText(''); }}>
          <input class="input" value={text} maxLength={120} placeholder="Nhắn gì đó…"
            onInput={(e) => setText((e.target as HTMLInputElement).value)} autoFocus />
        </form>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Đố Vui Dân Gian Modal

function TriviaModal() {
  const [qIndex, setQIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const result = useStore((s) => s.triviaResult);
  const doneList = useStore((s) => s.me?.life?.triviaDone);

  const q = TRIVIA_QUESTIONS[qIndex] ?? TRIVIA_QUESTIONS[0];
  // Đáp án chỉ có sau khi server chấm (client không biết trước đáp án)
  const res = result && result.qId === q.id ? result : null;
  const doneToday = !!doneList?.includes(q.id);
  const doneCount = doneList?.length ?? 0;

  const handleChoose = (idx: number) => {
    if (picked !== null) return;
    setPicked(idx);
    store.set({ triviaResult: null });
    sendTrivia(q.id, idx);
  };

  const handleNextQ = (delta: number) => {
    const next = (qIndex + delta + TRIVIA_QUESTIONS.length) % TRIVIA_QUESTIONS.length;
    setQIndex(next);
    setPicked(null);
    store.set({ triviaResult: null });
  };

  const optClass = (idx: number) => {
    if (!res) return picked === idx ? 'pending' : '';
    if (idx === res.ans) return 'correct';
    if (idx === picked && !res.ok) return 'wrong';
    return '';
  };

  return (
    <div class="modal-overlay" onClick={() => store.set({ triviaOpen: false })}>
      <div class="trivia-card" onClick={(e) => e.stopPropagation()}>
        <div class="dlg-header">
          <b>🍵 Đố Vui Dân Gian (Bà Hàng Nước)</b>
          <button class="icon-btn small" onClick={() => store.set({ triviaOpen: false })}>✕</button>
        </div>

        <div class="trivia-nav">
          <button class="btn ghost small" onClick={() => handleNextQ(-1)}>◀ Câu trước</button>
          <span class="muted tiny">Câu {qIndex + 1}/{TRIVIA_QUESTIONS.length} · hôm nay đã đáp {doneCount}</span>
          <button class="btn ghost small" onClick={() => handleNextQ(1)}>Câu sau ▶</button>
        </div>

        <div class="trivia-body">
          <p class="trivia-q">"{q.q}"</p>
          {doneToday && !res && <p class="muted tiny">Hôm nay bạn đã trả lời câu này rồi: trả lời lại để ôn bài, không có thưởng. Mai quay lại nhé!</p>}
          <div class="trivia-options">
            {q.options.map((opt, idx) => (
              <button
                key={idx}
                class={`trivia-btn ${optClass(idx)}`}
                disabled={picked !== null}
                onClick={() => handleChoose(idx)}
              >
                <span class="opt-idx">{String.fromCharCode(65 + idx)}.</span> {opt}
              </button>
            ))}
          </div>

          {picked !== null && !res && <p class="muted tiny">Bà Hàng Nước đang nghĩ…</p>}
          {res && (
            <div class={`trivia-feedback ${res.ok ? 'good' : 'warn'}`}>
              <b>
                {res.ok
                  ? res.repeat ? '✔ Chính xác! (câu này hôm nay đã nhận thưởng)' : '🎉 Tuyệt vời! (+50 XP, +25 Vàng, Hồi đầy Khí)'
                  : `💡 Tiếc quá! Đáp án đúng là: "${q.options[res.ans]}"`}
              </b>
              <p>{res.exp}</p>
            </div>
          )}
        </div>

        <div class="dlg-actions">
          <button class="btn ghost" onClick={() => store.set({ triviaOpen: false })}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Sổ Tay Tranh Đông Hồ Modal

function CodexModal() {
  const me = useStore((s) => s.me);
  const prog = me?.questProg ?? {};
  const entries = Object.values(FOLK_ART_ENTRIES);

  const hpBonus = prog.codex_chan_trau ? 30 : 0;
  const atkBonus = prog.codex_hung_dua ? 3 : 0;
  const defBonus = prog.codex_dam_cuoi_chuot ? 2 : 0;
  const spdBonus = prog.codex_vinh_hoa ? 5 : 0;

  return (
    <div class="modal-overlay" onClick={() => store.set({ codexOpen: false })}>
      <div class="codex-card" onClick={(e) => e.stopPropagation()}>
        <div class="dlg-header">
          <b>🖼️ Sổ Tay Tranh Đông Hồ</b>
          <button class="icon-btn small" onClick={() => store.set({ codexOpen: false })}>✕</button>
        </div>

        <p class="muted tiny" style={{ margin: 0 }}>
          Sưu tầm tranh dân gian lưu giữ tinh hoa văn hóa và nhận vĩnh viễn chỉ số sức mạnh.
        </p>

        <div class="codex-list">
          {entries.map((item) => {
            const unlocked = !!prog[`codex_${item.id}`];
            return (
              <div key={item.id} class={`codex-item ${unlocked ? 'unlocked' : 'locked'}`}>
                <div class="codex-head">
                  <div class="codex-title-wrap">
                    <span class="codex-icon">{unlocked ? '🎨' : '🔒'}</span>
                    <div>
                      <b>{item.title}</b>
                      <div class="muted tiny">{item.subtitle}</div>
                    </div>
                  </div>
                  <span class={`codex-badge ${unlocked ? 'on' : ''}`}>
                    {unlocked ? 'ĐÃ KHAI MỞ' : 'CHƯA MỞ'}
                  </span>
                </div>

                <div class="codex-verse">
                  <i>"{item.verse[0]}"</i>
                  <i>"{item.verse[1]}"</i>
                </div>

                <p class="codex-desc tiny">{item.desc}</p>

                <div class="codex-buff">
                  <span class="buff-label">Hiệu ứng vĩnh viễn:</span>
                  <b class="buff-val">{item.buff}</b>
                </div>
              </div>
            );
          })}
        </div>

        <div class="codex-buff" style={{ padding: '8px 10px', background: 'rgba(242, 193, 78, 0.1)', border: '1px solid rgba(242, 193, 78, 0.3)' }}>
          <span class="buff-label" style={{ color: '#fef08a' }}>Tổng nội lực kích hoạt:</span>
          <b class="buff-val" style={{ color: '#facc15' }}>
            +{hpBonus} Máu · +{atkBonus} Công · +{defBonus} Giáp{spdBonus ? ` · +${spdBonus}% Tốc` : ''}
          </b>
        </div>

        <div class="dlg-actions">
          <button class="btn primary" onClick={() => store.set({ codexOpen: false })}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Võ Học & Bí Kíp Modal

function SkillModal() {
  const me = useStore((s) => s.me);
  const cls = useStore((s) => s.cls);
  const skills = me?.skills;
  const tree = CLASS_SKILL_TREES[cls];
  const [tab, setTab] = useState<'main' | 'ult' | 'passives'>('main');

  const sp = skills?.sp ?? 0;
  const mainLv = skills?.mainLv ?? 1;
  const ultLv = skills?.ultLv ?? 1;
  const passives = skills?.passives ?? { atk: 0, def: 0, spd: 0 };

  const mainDef = tree.main.levels[mainLv - 1] ?? tree.main.levels[0];
  const nextMainDef = tree.main.levels[mainLv];

  const ultDef = tree.ult.levels[ultLv - 1] ?? tree.ult.levels[0];
  const nextUltDef = tree.ult.levels[ultLv];

  const doReset = () => {
    if (window.confirm('Bạn có chắc muốn tẩy toàn bộ điểm Võ Học? Tất cả SP đã dùng sẽ được hoàn trả lại đầy đủ.')) {
      skillReset();
    }
  };

  return (
    <div class="modal-overlay" onClick={() => store.set({ skillOpen: false })}>
      <div class="skill-card" onClick={(e) => e.stopPropagation()}>
        <div class="dlg-header">
          <div class="skill-header-title">
            <b>⚔️ Võ Học & Bí Kíp</b>
            <span class="muted tiny">· {CLASSES[cls].name}</span>
          </div>
          <button class="icon-btn small" onClick={() => store.set({ skillOpen: false })}>✕</button>
        </div>

        {/* Thanh trạng thái SP */}
        <div class="skill-sp-banner">
          <div class="sp-counter">
            <span class="sp-label">Điểm Võ Học khả dụng:</span>
            <b class="sp-val">{sp} SP</b>
          </div>
          <button class="btn tiny outline-warning" onClick={doReset} title="Hồi lại toàn bộ điểm đã cộng">
            🔄 Tẩy Điểm
          </button>
        </div>

        {/* Các nhánh võ học */}
        <div class="skill-tabs">
          <button class={`skill-tab ${tab === 'main' ? 'active' : ''}`} onClick={() => setTab('main')}>
            {tree.main.icon} Chủ Động ({mainLv}/5)
          </button>
          <button class={`skill-tab ${tab === 'ult' ? 'active' : ''}`} onClick={() => setTab('ult')}>
            {tree.ult.icon} Bí Kíp ({ultLv}/3)
          </button>
          <button class={`skill-tab ${tab === 'passives' ? 'active' : ''}`} onClick={() => setTab('passives')}>
            ✨ Tâm Pháp ({passives.atk + passives.def + passives.spd}/15)
          </button>
        </div>

        <div class="skill-content">
          {tab === 'main' && (
            <div class="skill-detail-card">
              <div class="skill-title-row">
                <div class="skill-icon-big">{tree.main.icon}</div>
                <div class="skill-name-col">
                  <div class="skill-name">{tree.main.name}</div>
                  <div class="skill-pips">
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <span key={lvl} class={`pip ${lvl <= mainLv ? 'filled' : ''}`}>★</span>
                    ))}
                    <span class="pip-text">Cấp {mainLv}/5</span>
                  </div>
                </div>
              </div>

              <div class="skill-desc-box">
                <div class="desc-heading">HIỆU QUẢ HIỆN TẠI (CẤP {mainLv})</div>
                <p class="desc-text">{mainDef.desc}</p>
                <div class="skill-stat-tags">
                  <span class="stat-tag">Sát thương: <b>{Math.round(mainDef.mult * 100)}%</b></span>
                  <span class="stat-tag">Hồi chiêu: <b>{(mainDef.cd / 1000).toFixed(1)}s</b></span>
                  {mainDef.special && <span class="stat-tag special">Đột phá: {mainDef.special}</span>}
                </div>
              </div>

              {nextMainDef ? (
                <div class="skill-desc-box next">
                  <div class="desc-heading next-label">CẤP KẾ TIẾP (CẤP {nextMainDef.lv})</div>
                  <p class="desc-text">{nextMainDef.desc}</p>
                  <div class="skill-stat-tags">
                    <span class="stat-tag next">Sát thương: <b>{Math.round(nextMainDef.mult * 100)}%</b></span>
                    <span class="stat-tag next">Hồi chiêu: <b>{(nextMainDef.cd / 1000).toFixed(1)}s</b></span>
                    {nextMainDef.special && <span class="stat-tag special next">Đột phá: {nextMainDef.special}</span>}
                  </div>
                </div>
              ) : (
                <div class="skill-max-badge">✨ Kỹ năng đã đạt cảnh giới tối cao! ✨</div>
              )}

              <div class="skill-action-row">
                <button
                  class="btn primary upgrade-btn"
                  disabled={sp <= 0 || mainLv >= 5}
                  onClick={() => skillUpgrade('main')}
                >
                  {mainLv >= 5 ? 'Đã đạt Cấp tối đa' : '+ Nâng Cấp (Cần 1 SP)'}
                </button>
              </div>
            </div>
          )}

          {tab === 'ult' && (
            <div class="skill-detail-card">
              <div class="skill-title-row">
                <div class="skill-icon-big ult">{tree.ult.icon}</div>
                <div class="skill-name-col">
                  <div class="skill-name ult">{tree.ult.name}</div>
                  <div class="skill-pips">
                    {[1, 2, 3].map((lvl) => (
                      <span key={lvl} class={`pip ult ${lvl <= ultLv ? 'filled' : ''}`}>★</span>
                    ))}
                    <span class="pip-text">Tầng {ultLv}/3</span>
                  </div>
                </div>
              </div>

              <div class="skill-desc-box">
                <div class="desc-heading">HIỆU QUẢ HIỆN TẠI (TẦNG {ultLv})</div>
                <p class="desc-text">{ultDef.desc}</p>
                <div class="skill-stat-tags">
                  <span class="stat-tag">Sát thương: <b>{Math.round(ultDef.mult * 100)}%</b></span>
                  <span class="stat-tag">Phạm vi: <b>{ultDef.radius}px</b></span>
                  {ultDef.duration && <span class="stat-tag">Thời gian: <b>{(ultDef.duration / 1000).toFixed(1)}s</b></span>}
                  {ultDef.special && <span class="stat-tag special">Đột phá: {ultDef.special}</span>}
                </div>
              </div>

              {nextUltDef ? (
                <div class="skill-desc-box next">
                  <div class="desc-heading next-label">TẦNG KẾ TIẾP (TẦNG {nextUltDef.lv})</div>
                  <p class="desc-text">{nextUltDef.desc}</p>
                  <div class="skill-stat-tags">
                    <span class="stat-tag next">Sát thương: <b>{Math.round(nextUltDef.mult * 100)}%</b></span>
                    <span class="stat-tag next">Phạm vi: <b>{nextUltDef.radius}px</b></span>
                    {nextUltDef.duration && <span class="stat-tag next">Thời gian: <b>{(nextUltDef.duration / 1000).toFixed(1)}s</b></span>}
                    {nextUltDef.special && <span class="stat-tag special next">Đột phá: {nextUltDef.special}</span>}
                  </div>
                </div>
              ) : (
                <div class="skill-max-badge">🌟 Bí Kíp đã đạt viên mãn Đệ Tam Tầng! 🌟</div>
              )}

              <div class="skill-action-row">
                <button
                  class="btn primary upgrade-btn"
                  disabled={sp <= 0 || ultLv >= 3}
                  onClick={() => skillUpgrade('ult')}
                >
                  {ultLv >= 3 ? 'Đã đạt Tầng tối đa' : '+ Đột Phá Bí Kíp (Cần 1 SP)'}
                </button>
              </div>
            </div>
          )}

          {tab === 'passives' && (
            <div class="passives-list">
              {(['atk', 'def', 'spd'] as const).map((key) => {
                const def = PASSIVE_SKILLS[key];
                const lv = passives[key] ?? 0;
                const icon = key === 'atk' ? '🗡️' : key === 'def' ? '🛡️' : '💨';
                const curBonus = key === 'atk'
                  ? `+${lv * 3} Sát thương Công`
                  : key === 'def'
                  ? `+${lv * 2} Giáp, +${lv * 20} Sinh lực`
                  : `+${lv * 3}% Tốc độ chạy, -${(lv * 0.1).toFixed(1)}s Hồi khinh công`;

                return (
                  <div key={key} class="passive-card">
                    <div class="passive-head">
                      <span class="passive-icon">{icon}</span>
                      <div class="passive-info">
                        <div class="passive-title-row">
                          <b>{def.name}</b>
                          <span class="passive-level">Cấp {lv}/{def.maxLv}</span>
                        </div>
                        <div class="muted tiny">{def.desc}</div>
                      </div>
                    </div>

                    <div class="passive-bonus-row">
                      <div class="cur-bonus">Hiệu lực: <b class="highlight">{lv > 0 ? curBonus : 'Chưa kích hoạt'}</b></div>
                      <div class="step-bonus tiny muted">{def.perLevelText}</div>
                    </div>

                    <div class="passive-bottom">
                      <div class="passive-pips">
                        {[1, 2, 3, 4, 5].map((idx) => (
                          <span key={idx} class={`pip ${idx <= lv ? 'filled' : ''}`}>★</span>
                        ))}
                      </div>
                      <button
                        class="btn small primary"
                        disabled={sp <= 0 || lv >= def.maxLv}
                        onClick={() => skillUpgrade(key)}
                      >
                        {lv >= def.maxLv ? 'Tối đa' : '+ Nâng (1 SP)'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div class="dlg-actions">
          <button class="btn primary" onClick={() => store.set({ skillOpen: false })}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Cáo Thị Làng Tre Modal

function NoticeModal() {
  return (
    <div class="modal-overlay" onClick={() => store.set({ noticeOpen: false })}>
      <div class="notice-card" onClick={(e) => e.stopPropagation()}>
        <div class="dlg-header">
          <b>📜 Cáo Thị Làng Tre</b>
          <button class="icon-btn small" onClick={() => store.set({ noticeOpen: false })}>✕</button>
        </div>

        <p class="muted tiny" style={{ margin: 0 }}>
          Thông cáo của Lý Trưởng và Trưởng Thôn về phong tục nông nghiệp và an ninh xóm thôn.
        </p>

        <div class="notice-list">
          {VILLAGE_NOTICES.map((n) => (
            <div key={n.id} class="notice-item">
              <div class="notice-head">
                <span class="notice-tag">[{n.tag}]</span>
                <b>{n.title}</b>
              </div>
              <p class="notice-content">{n.content}</p>
              <div class="notice-reward">
                <span class="muted tiny">Khích lệ phong tục:</span>
                <b class="reward-val">{n.rewardText}</b>
              </div>
            </div>
          ))}
        </div>

        <div class="dlg-actions">
          <button class="btn primary" onClick={() => store.set({ noticeOpen: false })}>Đã rõ</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Thăm Vườn Banner
function VisitingBanner({ farm }: { farm: NonNullable<ReturnType<typeof store.get>['me']>['visitFarm'] }) {
  if (!farm) return null;
  return (
    <div class="visiting-banner">
      <div class="vb-info">
        <span class="vb-icon">🏡</span>
        <div>
          <b>Đang thăm nông trại của: {farm.ownerName}</b>
          <div class="tiny muted">Cấp {farm.level} · {farm.likes} ❤️ lượt thích</div>
        </div>
      </div>
      <div class="vb-btns">
        <button class="btn primary small" onClick={() => store.set({ farmOpen: true, farmTab: 'visit' })}>
          Xem chi tiết 🌾
        </button>
        <button class="btn ghost small" onClick={() => farmVisit('')}>
          Về vườn của tôi 🏠
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Nông Trại & Canh Nông Modal
function FarmModal() {
  const me = useStore((s) => s.me);
  const tab = useStore((s) => s.farmTab);
  const mapId = useStore((s) => s.mapId);
  const inGarden = mapId === 'vuon_nha';
  const bag = me?.life.bag ?? {};
  const farm = me?.life.farm ?? defaultFarm();
  const visitFarm = me?.visitFarm;
  const onlineFarmers = me?.onlineFarmers ?? [];
  const farmXp = me?.life.xp.farm ?? 0;
  const farmLv = lifeLevel(farmXp);
  const farmNextXp = lifeNext(farmXp);

  const [searchName, setSearchName] = useState('');
  const [cheerMsg, setCheerMsg] = useState('');

  const close = () => store.set({ farmOpen: false });

  const setTab = (t: 'my' | 'visit') => store.set({ farmTab: t });

  const handleCheer = (target: string, text: string) => {
    if (!text.trim()) return;
    farmCheer(target, text.trim());
    setCheerMsg('');
  };

  return (
    <div class="modal-overlay" onClick={close}>
      <div class="farm-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div class="dlg-header">
          <div class="farm-title-wrap">
            <b>🌾 Nông Trại & Canh Nông</b>
            <span class="farm-level-badge">Cấp {farmLv}</span>
          </div>
          <button class="icon-btn small" onClick={close}>✕</button>
        </div>

        {/* Ca dao tục ngữ đồng quê */}
        <div class="farm-proverb">
          <i>"Ơn trời mưa nắng phải thì · Nơi thì bừa cạn, nơi thì cày sâu"</i>
        </div>

        {/* Banner trạng thái vị trí: Vườn Nhà vs Chế độ theo dõi từ xa */}
        <div class={`farm-mode-banner ${inGarden ? 'in-garden' : 'out-garden'}`}>
          <div class="fmb-left">
            <span class="fmb-icon">{inGarden ? '🏡' : '👁️'}</span>
            <div>
              <b>{inGarden ? 'Đang ở Vườn Nhà — Trực tiếp Canh Tác' : `Chế độ Theo Dõi Từ Xa (${MAP_NAMES[mapId] ?? mapId})`}</b>
              <div class="tiny">
                {inGarden
                  ? 'Bạn có thể trực tiếp cuốc đất, gieo lúa, bắt sâu, tưới nước, thu hoạch và chăm sóc chuồng gà.'
                  : 'Chỉ có thể theo dõi trạng thái vụ mùa. Hãy về Vườn Nhà để trực tiếp chăm sóc & thu hoạch!'}
              </div>
            </div>
          </div>
          <span class={`fmb-badge ${inGarden ? 'on' : 'off'}`}>
            {inGarden ? '🟢 Tại Vườn' : '📡 Từ Xa'}
          </span>
        </div>

        {/* Thanh kinh nghiệm nghề Canh nông */}
        <div class="farm-xp-bar-wrap">
          <div class="bar ls-bar">
            <i style={{ width: farmNextXp ? `${Math.min(100, (farmXp / farmNextXp) * 100)}%` : '100%' }} />
            <span>{farmNextXp ? `Kinh nghiệm: ${farmXp}/${farmNextXp}` : 'Đạt cấp tối đa'}</span>
          </div>
        </div>

        {/* Tabs switcher */}
        <div class="farm-tabs">
          <button class={`farm-tab-btn ${tab === 'my' ? 'active' : ''}`} onClick={() => setTab('my')}>
            🏡 Vườn Của Tôi
          </button>
          <button class={`farm-tab-btn ${tab === 'visit' ? 'active' : ''}`} onClick={() => setTab('visit')}>
            👥 Thăm Bạn Bè (Avatar) {visitFarm ? `· Đang ở nhà ${visitFarm.ownerName}` : ''}
          </button>
        </div>

        <div class="farm-body">
          {tab === 'my' ? (
            <>
              {/* SỔ LƯU BÚT & LƯỢT THÍCH */}
              <div class="farm-section farm-likes-box">
                <div class="likes-header">
                  <span>❤️ Lượt thích: <b>{farm.likes ?? 0}</b></span>
                  <span class="muted tiny">Bạn bè ghé thăm có thể thả tim & chúc tụng</span>
                </div>
                {farm.cheers && farm.cheers.length > 0 && (
                  <div class="cheers-ticker">
                    {farm.cheers.slice(-3).map((c, i) => (
                      <div key={i} class="cheer-bubble">
                        <b>{c.by}:</b> "{c.text}"
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 8 THỬA RUỘNG LÚA */}
              <div class="farm-section">
                <div class="section-title">
                  <b>🌾 8 Thửa Ruộng Nước</b>
                  <span class="muted tiny">Đất ẩm tăng 2x tốc độ chín · Bón phân gà tăng +25% thóc</span>
                </div>
                <div class="plot-grid">
                  {farm.plots.map((plot, i) => {
                    const isWet = (plot.waterUntil ?? 0) > Date.now();
                    const p = Math.min(1, plot.progress ?? 0);
                    const cropDef = plot.crop ? FARM.crops[plot.crop] : null;

                    return (
                      <div key={i} class={`plot-card state-${plot.state} ${isWet ? 'wet' : 'dry'} ${plot.pest ? 'pest' : ''} ${p >= 1 ? 'ready-glow' : ''}`}>
                        <div class="plot-card-head">
                          <span class="plot-idx">Thửa {i + 1}</span>
                          {plot.state === 'empty' && <span class="badge empty">Đất hoang</span>}
                          {plot.state === 'plowed' && <span class="badge plowed">Đã cuốc</span>}
                          {plot.state === 'planted' && p < 1 && (
                            <span class="badge growing">{p < 0.35 ? '🌱 Mạ non' : '🌿 Lúa đơm bông'} ({Math.floor(p * 100)}%)</span>
                          )}
                          {plot.state === 'planted' && p >= 1 && (
                            <span class="badge ready">✨ Chín vàng 100%</span>
                          )}
                        </div>

                        {/* Thông tin độ ẩm & sâu hại */}
                        <div class="plot-meta">
                          {plot.state !== 'empty' && (
                            <span class={`soil-tag ${isWet ? 'soil-wet' : 'soil-dry'}`}>
                              {isWet ? '💧 Đất ẩm' : '🏜️ Đất khô'}
                            </span>
                          )}
                          {plot.fertilized && <span class="soil-tag soil-fert">💩 Phân gà (+25%)</span>}
                          {plot.pest && <span class="soil-tag soil-pest">🐛 Sâu cắn lúa!</span>}
                        </div>

                        {/* Tiến độ lớn của lúa */}
                        {plot.state === 'planted' && (
                          <div class="plot-prog-wrap">
                            <div class="bar plot-bar">
                              <i style={{ width: `${p * 100}%`, background: p >= 1 ? '#facc15' : '#4ade80' }} />
                            </div>
                            <div class="plot-crop-name tiny">
                              <b>{cropDef?.name ?? 'Lúa'}</b>
                              <span>{p >= 1 ? 'Chín rộ!' : isWet ? 'Đang lớn nhanh' : 'Lớn chậm (cần tưới)'}</span>
                            </div>
                          </div>
                        )}

                        {/* Nút hành động cho ô đất */}
                        <div class="plot-actions">
                          {!inGarden ? (
                            <div class="plot-remote-status">
                              {plot.state === 'empty' && (
                                <span class="prs-text empty">🟤 Đất hoang · Về vườn để cuốc</span>
                              )}
                              {plot.state === 'plowed' && (
                                <span class="prs-text plowed">🌱 Đã cuốc đất · Về vườn để gieo</span>
                              )}
                              {plot.state === 'planted' && p >= 1 && (
                                <span class="prs-text ready">✨🌾 Lúa chín vàng! Về vườn để gặt</span>
                              )}
                              {plot.state === 'planted' && p < 1 && (
                                <div class="prs-text growing">
                                  <span>{isWet ? '💧 Đất ẩm đang lớn' : '🏜️ Đất khô (cần tưới)'}</span>
                                  {plot.pest && <span class="prs-pest"> · 🐛 Có sâu!</span>}
                                  <div class="tiny muted">Về Vườn Nhà để chăm sóc</div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              {plot.state === 'empty' && (
                                <button class="btn primary small" onClick={() => farmPlow(i)}>
                                  ⛏️ Cuốc đất
                                </button>
                              )}
                              {plot.state === 'plowed' && (
                                <>
                                  {!plot.fertilized && (bag.phan_ga ?? 0) > 0 && (
                                    <button class="btn ghost small" onClick={() => farmFertilize(i)}>
                                      💩 Bón phân gà ({bag.phan_ga})
                                    </button>
                                  )}
                                  <div class="seed-btns">
                                    <button class="btn primary small" onClick={() => farmPlant(i, 'giong_te')} disabled={(bag.giong_te ?? 0) < 1}>
                                      Gieo Lúa Tẻ ({bag.giong_te ?? 0})
                                    </button>
                                    <button class="btn primary small nep-btn" onClick={() => farmPlant(i, 'giong_nep')} disabled={(bag.giong_nep ?? 0) < 1}>
                                      Gieo Lúa Nếp ({bag.giong_nep ?? 0})
                                    </button>
                                  </div>
                                </>
                              )}
                              {plot.state === 'planted' && (
                                <>
                                  {plot.pest && (
                                    <button class="btn warn small" onClick={() => farmWeed(i)}>
                                      🐛 Bắt sâu cắn lúa
                                    </button>
                                  )}
                                  <button class="btn ghost small" onClick={() => farmWater(i)}>
                                    💧 Tưới nước
                                  </button>
                                  {p >= 1 && (
                                    <button class="btn primary small harvest-btn" onClick={() => farmHarvest(i)}>
                                      🌾 Thu hoạch lúa!
                                    </button>
                                  )}
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CHUỒNG GÀ */}
              <div class="farm-section coop-section">
                <div class="section-title">
                  <b>🐔 Chuồng Gà Nuôi Trứng ({farm.chickens.length}/6 con)</b>
                  <span class="muted tiny">Thả gà con, cho ăn no lớn lên đẻ trứng & sinh phân chuồng</span>
                </div>

                {!inGarden && (
                  <div class="remote-action-notice">
                    👁️ Đang theo dõi chuồng gà từ xa. Hãy về Vườn Nhà để cho gà ăn, nhặt trứng và gom phân chuồng.
                  </div>
                )}

                <div class="coop-status-bar">
                  <div class="coop-trough">
                    <span>🌾 Máng ăn: <b>{farm.troughFood}/10 phần</b></span>
                    <div class="row-btns">
                      <button class="btn ghost small" onClick={() => coopFeed('thoc')} disabled={!inGarden || (bag.thoc ?? 0) < 1 || farm.troughFood >= 10} title={!inGarden ? 'Cần về Vườn Nhà' : undefined}>
                        Đổ thóc (+1) [còn {bag.thoc ?? 0}]
                      </button>
                      <button class="btn ghost small" onClick={() => coopFeed('cam_gao')} disabled={!inGarden || (bag.cam_gao ?? 0) < 1 || farm.troughFood >= 10} title={!inGarden ? 'Cần về Vườn Nhà' : undefined}>
                        Đổ cám (+1) [còn {bag.cam_gao ?? 0}]
                      </button>
                    </div>
                  </div>

                  {farm.chickens.length < 6 && (
                    <button class="btn primary small" onClick={coopAdd} disabled={!inGarden || (bag.ga_con ?? 0) < 1} title={!inGarden ? 'Cần về Vườn Nhà' : undefined}>
                      🐥 Thả gà con vào chuồng ({bag.ga_con ?? 0})
                    </button>
                  )}
                </div>

                {/* Danh sách gà */}
                <div class="chicken-roster">
                  {farm.chickens.length === 0 ? (
                    <p class="muted tiny">Chuồng đang trống. Mua gà con giống ở dưới rồi thả vào nuôi nhé!</p>
                  ) : (
                    farm.chickens.map((ch, idx) => (
                      <div key={idx} class="chicken-card">
                        <span class="chicken-icon">{ch.adult ? '🐔' : '🐥'}</span>
                        <div>
                          <b>{ch.adult ? 'Gà trưởng thành' : 'Gà con'}</b>
                          <div class="muted tiny">{ch.adult ? 'Đã đẻ trứng' : 'Đang lớn dần…'}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Nhặt trứng & dọn chuồng */}
                <div class="coop-harvest-bar">
                  <div class="coop-harvest-item">
                    <span>🥚 Ổ trứng: <b>{farm.eggs ?? 0} trứng gà</b>{farm.goldenEggs ? `, ${farm.goldenEggs} trứng hoàng kim` : ''}</span>
                    <button class="btn primary small" onClick={coopCollect} disabled={!inGarden || ((farm.eggs ?? 0) + (farm.goldenEggs ?? 0)) === 0} title={!inGarden ? 'Cần về Vườn Nhà' : undefined}>
                      Nhặt trứng
                    </button>
                  </div>
                  <div class="coop-harvest-item">
                    <span>🧹 Phân chuồng: <b>{farm.manure ?? 0} phần</b></span>
                    <button class="btn ghost small" onClick={coopClean} disabled={!inGarden || (farm.manure ?? 0) === 0} title={!inGarden ? 'Cần về Vườn Nhà' : undefined}>
                      Dọn chuồng nhận phân gà
                    </button>
                  </div>
                </div>
              </div>

              {/* CỐI XAY LÚA ĐÁ */}
              <div class="farm-section mill-section">
                <div class="section-title">
                  <b>🥣 Cối Xay Lúa / Cối Giã Đá</b>
                  <span class="muted tiny">Xay 2 Thóc ➔ 2 Gạo + 1 Cám gạo (dùng nấu ăn hoặc nuôi gà)</span>
                </div>
                {!inGarden && (
                  <div class="remote-action-notice">
                    👁️ Cối xay đá đặt tại chái hiên Vườn Nhà. Hãy về vườn để xay thóc thành gạo.
                  </div>
                )}
                <div class="mill-grid">
                  <div class="mill-row">
                    <div>
                      <b>Xay Thóc Tẻ</b>
                      <div class="muted tiny">2 Thóc tẻ ➔ 2 Gạo tẻ + 1 Cám gạo (có {bag.thoc ?? 0} thóc)</div>
                    </div>
                    <button class="btn primary small" onClick={() => farmMill('giong_te')} disabled={!inGarden || (bag.thoc ?? 0) < 2}>
                      Xay Thóc Tẻ
                    </button>
                  </div>
                  <div class="mill-row">
                    <div>
                      <b>Xay Thóc Nếp Cái Hoa Vàng</b>
                      <div class="muted tiny">2 Thóc nếp ➔ 2 Gạo nếp + 1 Cám gạo (có {bag.thoc_nep ?? 0} thóc nếp)</div>
                    </div>
                    <button class="btn primary small nep-btn" onClick={() => farmMill('giong_nep')} disabled={!inGarden || (bag.thoc_nep ?? 0) < 2}>
                      Xay Thóc Nếp
                    </button>
                  </div>
                </div>
              </div>

              {/* MUA CÂY GIỐNG VÀ GÀ CON NHANH */}
              <div class="farm-section quick-buy-section">
                <div class="section-title">
                  <b>🛒 Cây Giống & Con Giống {inGarden ? '(Mua trực tiếp tại Vườn)' : '(Đại lý giống Vườn Nhà)'}</b>
                  {!inGarden && <span class="muted tiny">Về Vườn Nhà để mua hạt giống và con giống từ kho nông trại</span>}
                </div>
                <div class="quick-buy-grid">
                  <div class="qb-card">
                    <span>🌾</span>
                    <b>Giống Lúa Tẻ</b>
                    <small>4 vàng (có {bag.giong_te ?? 0})</small>
                    <button class="btn primary small" onClick={() => buyItem('giong_te')} disabled={!inGarden || (me?.gold ?? 0) < 4}>
                      {inGarden ? 'Mua' : 'Tại vườn'}
                    </button>
                  </div>
                  <div class="qb-card">
                    <span>🌾</span>
                    <b>Giống Lúa Nếp</b>
                    <small>6 vàng (có {bag.giong_nep ?? 0})</small>
                    <button class="btn primary small nep-btn" onClick={() => buyItem('giong_nep')} disabled={!inGarden || (me?.gold ?? 0) < 6}>
                      {inGarden ? 'Mua' : 'Tại vườn'}
                    </button>
                  </div>
                  <div class="qb-card">
                    <span>🐥</span>
                    <b>Gà Con Giống</b>
                    <small>12 vàng (có {bag.ga_con ?? 0})</small>
                    <button class="btn primary small" onClick={() => buyItem('ga_con')} disabled={!inGarden || (me?.gold ?? 0) < 12}>
                      {inGarden ? 'Mua' : 'Tại vườn'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* TAB THĂM BẠN BÈ */}
              {visitFarm ? (
                <div class="visiting-full-card">
                  <div class="vf-header">
                    <div>
                      <b>🏡 Nông Trại Của: {visitFarm.ownerName}</b>
                      <div class="muted tiny">Cấp Canh Nông {visitFarm.level} · {visitFarm.likes} ❤️ lượt thích</div>
                    </div>
                    <button class="btn ghost small" onClick={() => farmVisit('')}>
                      🏠 Trở về vườn của tôi
                    </button>
                  </div>

                  {/* THẢ TIM & CHÚC MỪNG */}
                  <div class="cheer-action-box">
                    <div class="lbl">Gửi lời chúc & thả tim cho chủ vườn</div>
                    <div class="cheer-input-row">
                      <input
                        class="input small"
                        value={cheerMsg}
                        maxLength={80}
                        placeholder="Để lại lời chúc bội thu…"
                        onInput={(e) => setCheerMsg((e.target as HTMLInputElement).value)}
                      />
                      <button class="btn primary small" onClick={() => handleCheer(visitFarm.ownerName, cheerMsg || 'Chúc mùa màng bội thu!')}>
                        ❤️ Thả tim
                      </button>
                    </div>
                    <div class="quick-cheers">
                      {FOLK_CHEERS.slice(0, 3).map((f, i) => (
                        <button key={i} class="quick-cheer-tag" onClick={() => handleCheer(visitFarm.ownerName, f)}>
                          "{f}"
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 8 THỬA RUỘNG CỦA BẠN: TƯỚI NƯỚC & BẮT SÂU GIÚP BẠN */}
                  <div class="section-title">
                    <b>🌾 8 Thửa Ruộng Của {visitFarm.ownerName}</b>
                    <span class="muted tiny">Tưới nước giúp bạn (+2 XP, +1 Vàng) · Bắt sâu giúp bạn (+3 XP, +2 Vàng)</span>
                  </div>
                  <div class="plot-grid">
                    {visitFarm.plots.map((plot, i) => {
                      const isWet = (plot.waterUntil ?? 0) > Date.now();
                      const p = Math.min(1, plot.progress ?? 0);
                      const cropDef = plot.crop ? FARM.crops[plot.crop] : null;

                      return (
                        <div key={i} class={`plot-card state-${plot.state} ${isWet ? 'wet' : 'dry'} ${plot.pest ? 'pest' : ''}`}>
                          <div class="plot-card-head">
                            <span class="plot-idx">Thửa {i + 1}</span>
                            {plot.state === 'empty' && <span class="badge empty">Đất hoang</span>}
                            {plot.state === 'plowed' && <span class="badge plowed">Đã cuốc</span>}
                            {plot.state === 'planted' && (
                              <span class="badge growing">{cropDef?.name ?? 'Lúa'} ({Math.floor(p * 100)}%)</span>
                            )}
                          </div>

                          <div class="plot-meta">
                            {plot.state !== 'empty' && (
                              <span class={`soil-tag ${isWet ? 'soil-wet' : 'soil-dry'}`}>
                                {isWet ? '💧 Đất ẩm' : '🏜️ Đất khô'}
                              </span>
                            )}
                            {plot.pest && <span class="soil-tag soil-pest">🐛 Bị sâu cắn!</span>}
                          </div>

                          <div class="plot-actions">
                            {plot.state === 'planted' && !isWet && (
                              <button class="btn primary small" onClick={() => farmWater(i, visitFarm.ownerName)}>
                                💧 Tưới nước giúp (+XP, +Vàng)
                              </button>
                            )}
                            {plot.state === 'planted' && plot.pest && (
                              <button class="btn warn small" onClick={() => farmWeed(i, visitFarm.ownerName)}>
                                🐛 Bắt sâu giúp (+XP, +Vàng)
                              </button>
                            )}
                            {plot.state === 'planted' && isWet && !plot.pest && (
                              <span class="muted tiny">Lúa đang phát triển tốt</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div class="online-farmers-box">
                  <div class="search-farmer-row">
                    <input
                      class="input small"
                      value={searchName}
                      maxLength={20}
                      placeholder="Nhập tên người chơi muốn ghé thăm…"
                      onInput={(e) => setSearchName((e.target as HTMLInputElement).value)}
                    />
                    <button class="btn primary small" onClick={() => searchName.trim() && farmVisit(searchName.trim())}>
                      Ghé thăm 🏡
                    </button>
                  </div>

                  <div class="section-title">
                    <b>Danh Sách Nông Dân Đang Online ({onlineFarmers.length})</b>
                  </div>

                  <div class="farmer-list">
                    {onlineFarmers.length === 0 ? (
                      <p class="muted tiny">Hiện chưa có người chơi nào khác online.</p>
                    ) : (
                      onlineFarmers.map((f, idx) => (
                        <div key={idx} class="farmer-row">
                          <div class="farmer-info">
                            <span class="farmer-avatar">🌾</span>
                            <div>
                              <b>{f.name}</b>
                              <div class="muted tiny">Cấp Canh Nông {f.lv} · {f.likes} ❤️</div>
                            </div>
                          </div>
                          <button class="btn primary small" onClick={() => farmVisit(f.name)}>
                            Thăm Vườn 🏡
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div class="dlg-actions">
          <button class="btn ghost" onClick={close}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Chợ Phiên Làng Tre & Giao Thương
function MarketModal() {
  const me = useStore((s) => s.me);
  const data = useStore((s) => s.marketData);
  const tab = useStore((s) => s.marketTab);
  const filterSellerToken = useStore((s) => s.stallSellerToken);
  const [cat, setCat] = useState<'all' | 'crop' | 'fish' | 'meat' | 'food'>('all');
  const [buyTarget, setBuyTarget] = useState<MarketListing | null>(null);
  const [buyQty, setBuyQty] = useState(1);

  // Form đăng bán
  const [sellKey, setSellKey] = useState<string>('');
  const [sellQty, setSellQty] = useState<number>(1);
  const [sellPrice, setSellPrice] = useState<number>(10);
  const [stallName, setStallName] = useState<string>(() => `Sạp của ${me?.name ?? 'bản quán'}`);

  const close = () => store.set({ marketOpen: false, stallSellerToken: undefined });
  const setTab = (t: 'market' | 'npc' | 'my') => store.set({ marketTab: t });

  const event = getTodayMarketEvent(Date.now());
  const listings = data?.listings ?? [];
  const earnings = me?.marketEarnings ?? data?.myEarnings ?? 0;
  const bag = me?.life.bag ?? {};

  // Vật phẩm trong giỏ có thể đăng bán
  const tradableBagItems = Object.entries(bag)
    .filter(([k, q]) => (q ?? 0) > 0 && LIFE_ITEMS[k] && LIFE_ITEMS[k].kind !== 'junk' && k !== 'cui');

  const myListingItems = listings.filter((l) => l.sellerName === me?.name);

  // Lọc theo category
  const filteredListings = listings.filter((l) => {
    if (filterSellerToken && l.sellerToken !== filterSellerToken) return false;
    if (cat === 'all') return true;
    const kind = LIFE_ITEMS[l.key]?.kind;
    if (cat === 'fish') return kind === 'fish';
    if (cat === 'meat') return kind === 'meat';
    if (cat === 'food') return kind === 'food';
    if (cat === 'crop') return kind === 'mat' || l.key.startsWith('giong_') || l.key.startsWith('thoc_') || l.key.startsWith('gao_');
    return true;
  });

  const handleOpenBuy = (item: MarketListing) => {
    setBuyTarget(item);
    setBuyQty(1);
  };

  const handleConfirmBuy = () => {
    if (!buyTarget) return;
    marketBuy(buyTarget.id, buyQty);
    setBuyTarget(null);
  };

  const handleCreateListing = (e: Event) => {
    e.preventDefault();
    if (!sellKey || sellQty <= 0 || sellPrice <= 0) return;
    marketSell(sellKey, sellQty, sellPrice);
    setSellKey('');
  };

  return (
    <div class="modal-overlay" onClick={close}>
      <div class="market-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div class="dlg-header">
          <div class="market-title-wrap">
            <b>🏮 Chợ Phiên Làng Tre</b>
            <span class="market-gold-tag">💰 {me?.gold ?? 0} Vàng</span>
          </div>
          <button class="icon-btn small" onClick={close}>✕</button>
        </div>

        {/* Tab switch */}
        <div class="market-tabs">
          <button class={`market-tab-btn ${tab === 'market' ? 'active' : ''}`} onClick={() => setTab('market')}>
            🏮 Chợ Ký Gửi ({listings.length})
          </button>
          <button class={`market-tab-btn ${tab === 'npc' ? 'active' : ''}`} onClick={() => setTab('npc')}>
            🌾 Cô Hàng Chợ (NPC)
          </button>
          <button class={`market-tab-btn ${tab === 'my' ? 'active' : ''}`} onClick={() => setTab('my')}>
            🎪 Sạp Của Tôi {earnings > 0 ? `(💰${earnings})` : ''}
          </button>
        </div>

        {/* Tab 1: Chợ Ký Gửi */}
        {tab === 'market' && (
          <div class="market-body">
            {filterSellerToken && (
              <div class="seller-filter-banner">
                <span>🏮 Đang xem sạp hàng của người chơi</span>
                <button class="btn ghost small" onClick={() => store.set({ stallSellerToken: undefined })}>Xem tất cả chợ</button>
              </div>
            )}

            {/* Filter pills */}
            <div class="market-cat-bar">
              <button class={`cat-chip ${cat === 'all' ? 'active' : ''}`} onClick={() => setCat('all')}>Tất cả</button>
              <button class={`cat-chip ${cat === 'crop' ? 'active' : ''}`} onClick={() => setCat('crop')}>🌾 Nông sản</button>
              <button class={`cat-chip ${cat === 'fish' ? 'active' : ''}`} onClick={() => setCat('fish')}>🐟 Cá tôm</button>
              <button class={`cat-chip ${cat === 'meat' ? 'active' : ''}`} onClick={() => setCat('meat')}>🥩 Thịt thú</button>
              <button class={`cat-chip ${cat === 'food' ? 'active' : ''}`} onClick={() => setCat('food')}>🍲 Ẩm thực</button>
            </div>

            {/* Danh sách mặt hàng ký gửi */}
            <div class="market-listing-list">
              {filteredListings.length === 0 ? (
                <div class="empty-market">
                  <span class="empty-icon">🧺</span>
                  <p>Hiện chưa có ai bày bán mặt hàng này.</p>
                  <p class="muted tiny">Bạn có thể sang tab "Sạp Của Tôi" để đăng bán đầu tiên!</p>
                </div>
              ) : (
                filteredListings.map((item) => {
                  const isMine = item.sellerName === me?.name;
                  const it = LIFE_ITEMS[item.key];
                  return (
                    <div key={item.id} class="market-item-row">
                      <span class="market-item-icon">{item.icon || it?.icon || '📦'}</span>
                      <div class="market-item-info">
                        <div class="market-item-name">
                          <b>{item.name}</b>
                          <span class="market-qty-badge">x{item.qty} {unitOf(item.key)}</span>
                        </div>
                        <div class="market-item-meta">
                          <span class="seller-name">Người bán: <b>{item.sellerName}</b></span>
                        </div>
                      </div>
                      <div class="market-price-box">
                        <div class="unit-price"><b>{item.unitPrice}</b> <span class="gold-icon">💰</span>/cái</div>
                        {isMine ? (
                          <button class="btn warn small" onClick={() => marketCancel(item.id)}>Hủy bán</button>
                        ) : (
                          <button
                            class="btn primary small"
                            disabled={(me?.gold ?? 0) < item.unitPrice}
                            onClick={() => handleOpenBuy(item)}
                          >
                            Mua hàng
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal mua hàng */}
            {buyTarget && (
              <div class="buy-dialog-backdrop" onClick={() => setBuyTarget(null)}>
                <div class="buy-dialog" onClick={(e) => e.stopPropagation()}>
                  <div class="dlg-header">
                    <b>Mua {buyTarget.name}</b>
                    <button class="icon-btn small" onClick={() => setBuyTarget(null)}>✕</button>
                  </div>
                  <div class="buy-dialog-body">
                    <p class="muted tiny">Từ người bán: <b>{buyTarget.sellerName}</b></p>
                    <div class="buy-qty-selector">
                      <span class="lbl">Số lượng muốn mua:</span>
                      <div class="counter-box">
                        <button class="btn ghost small" onClick={() => setBuyQty(Math.max(1, buyQty - 1))}>-</button>
                        <input
                          type="number"
                          class="input qty-input"
                          min="1"
                          max={buyTarget.qty}
                          value={buyQty}
                          onInput={(e) => setBuyQty(Math.max(1, Math.min(buyTarget.qty, parseInt((e.target as HTMLInputElement).value) || 1)))}
                        />
                        <button class="btn ghost small" onClick={() => setBuyQty(Math.min(buyTarget.qty, buyQty + 1))}>+</button>
                        <button class="btn ghost small" onClick={() => setBuyQty(buyTarget.qty)}>Tất cả ({buyTarget.qty})</button>
                      </div>
                    </div>
                    <div class="buy-total-calc">
                      <span>Tổng số tiền:</span>
                      <b class="total-gold">{buyQty * buyTarget.unitPrice} 💰 Vàng</b>
                    </div>
                    {(me?.gold ?? 0) < buyQty * buyTarget.unitPrice && (
                      <p class="field-err">Bạn không đủ vàng để mua số lượng này!</p>
                    )}
                  </div>
                  <div class="dlg-actions">
                    <button class="btn ghost" onClick={() => setBuyTarget(null)}>Hủy</button>
                    <button
                      class="btn primary"
                      disabled={(me?.gold ?? 0) < buyQty * buyTarget.unitPrice}
                      onClick={handleConfirmBuy}
                    >
                      Xác nhận mua ({buyQty * buyTarget.unitPrice} vàng)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Cô Hàng Chợ (NPC Cô Mơ) */}
        {tab === 'npc' && (
          <div class="market-body">
            {/* Banner sự kiện giá */}
            <div class="event-banner">
              <div class="event-head">
                <span class="event-tag">📢 CHỢ PHIÊN HÔM NAY</span>
                <b>{event.title}</b>
              </div>
              <p class="event-desc">{event.desc}</p>
              <div class="boost-tags">
                {Object.entries(event.multipliers).map(([k, mult]) => (
                  <span key={k} class="boost-chip">
                    {LIFE_ITEMS[k]?.icon} {LIFE_ITEMS[k]?.name ?? k}: <b>+{Math.round((mult - 1) * 100)}% giá</b>
                  </span>
                ))}
              </div>
            </div>

            {/* Gian hàng nông cụ đặc sản của Cô Mơ */}
            <div class="market-section-title">
              <b>🛍️ Nông Cụ & Con Giống Đặc Sản (Cô Mơ bán)</b>
            </div>
            <div class="co-mo-goods">
              {CO_MO_SHOP.map((it) => {
                const itemDef = LIFE_ITEMS[it.key];
                return (
                  <div key={it.key} class="shop-row">
                    <span class="ct-icon">{itemDef?.icon ?? '✨'}</span>
                    <div class="grow">
                      <b>{it.name}</b>
                      <div class="muted tiny">{it.desc}</div>
                    </div>
                    <button
                      class="btn primary small"
                      disabled={(me?.gold ?? 0) < it.price}
                      onClick={() => npcMarketBuy(it.key, 1)}
                    >
                      Mua ({it.price} vàng)
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Thu mua nông sản sốt giá */}
            <div class="market-section-title" style={{ marginTop: '14px' }}>
              <b>🌾 Thu Mua Nông Sản Sốt Giá (Từ Giỏ Tre Của Bạn)</b>
            </div>
            <div class="sell-list">
              {Object.entries(bag).filter(([k, q]) => (q ?? 0) > 0 && (LIFE_ITEMS[k]?.sell ?? 0) > 0).length === 0 ? (
                <p class="muted tiny">Giỏ Tre của bạn đang trống, hãy canh tác hoặc câu cá rồi đem ra chợ nhé!</p>
              ) : (
                Object.entries(bag)
                  .filter(([k, q]) => (q ?? 0) > 0 && (LIFE_ITEMS[k]?.sell ?? 0) > 0)
                  .map(([k, q]) => {
                    const itemDef = LIFE_ITEMS[k];
                    const price = getMarketSellPrice(k, me?.life.soldToday ?? 0, Date.now());
                    const mult = event.multipliers[k] ?? 1.0;
                    return (
                      <div key={k} class="shop-row">
                        <span class="ct-icon">{itemDef?.icon}</span>
                        <div class="grow">
                          <b>{itemDef?.name}</b> <span class="muted tiny">x{q}</span>
                          {mult > 1 && <span class="badge growing" style={{ marginLeft: '6px' }}>🔥 +{Math.round((mult - 1) * 100)}% sốt giá</span>}
                          <div class="muted tiny">{price} vàng/{unitOf(k)}</div>
                        </div>
                        <div class="row-btns">
                          <button class="btn ghost small" onClick={() => sellBag(k, 1)}>Bán 1</button>
                          {q > 1 && <button class="btn primary small" onClick={() => sellBag(k, q)}>Bán hết ({q * price}v)</button>}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Sạp Của Tôi */}
        {tab === 'my' && (
          <div class="market-body">
            {/* Hòm tiền doanh thu bán hàng */}
            <div class="earnings-box">
              <div class="eb-left">
                <span class="eb-icon">💰</span>
                <div>
                  <div class="tiny muted">Hòm tiền doanh thu bán hàng:</div>
                  <b class="eb-gold">{earnings} Vàng</b>
                </div>
              </div>
              <button
                class="btn primary"
                disabled={earnings <= 0}
                onClick={marketClaim}
              >
                Nhận tiền về túi ✨
              </button>
            </div>

            {/* Bày sạp tại chỗ */}
            <div class="stall-setup-box">
              <div class="stall-title-row">
                <b>🎪 Bày Sạp Tại Chỗ (Chợ Làng Tre)</b>
              </div>
              <p class="muted tiny">
                Trải chiếu cói mở sạp riêng tại vị trí đứng của bạn. Người chơi khác có thể bấm vào sạp của bạn để mua đồ trực tiếp. Di chuyển sẽ tự động gập sạp.
              </p>
              <div class="stall-action-row">
                <input
                  class="input small"
                  value={stallName}
                  maxLength={30}
                  placeholder="Tên biển hiệu sạp hàng…"
                  onInput={(e) => setStallName((e.target as HTMLInputElement).value)}
                />
                <button
                  class="btn primary small"
                  onClick={() => stallSet(true, stallName.trim() || `Sạp của ${me?.name}`)}
                >
                  Trải chiếu mở sạp 🎪
                </button>
                <button
                  class="btn ghost small"
                  onClick={() => stallSet(false)}
                >
                  Gập sạp ✕
                </button>
              </div>
            </div>

            {/* Form đăng bán ký gửi mới */}
            <div class="create-listing-box">
              <div class="section-title">
                <b>📦 Đăng Bán Hàng Lên Chợ Ký Gửi</b>
              </div>
              {tradableBagItems.length === 0 ? (
                <p class="muted tiny">Trong Giỏ Tre không có vật phẩm nào để đăng bán.</p>
              ) : (
                <form class="listing-form" onSubmit={handleCreateListing}>
                  <div class="form-row">
                    <label class="lbl tiny">Chọn vật phẩm:</label>
                    <select
                      class="input small"
                      value={sellKey}
                      onChange={(e) => {
                        const k = (e.target as HTMLSelectElement).value;
                        setSellKey(k);
                        setSellQty(1);
                        setSellPrice(LIFE_ITEMS[k]?.sell ? LIFE_ITEMS[k].sell * 2 : 10);
                      }}
                    >
                      <option value="">-- Chọn món hàng trong giỏ --</option>
                      {tradableBagItems.map(([k, q]) => (
                        <option key={k} value={k}>
                          {LIFE_ITEMS[k]?.icon} {LIFE_ITEMS[k]?.name} (có {q} {unitOf(k)})
                        </option>
                      ))}
                    </select>
                  </div>

                  {sellKey && (
                    <>
                      <div class="form-row-duo">
                        <div>
                          <label class="lbl tiny">Số lượng bán (tối đa {bag[sellKey] ?? 1}):</label>
                          <input
                            type="number"
                            class="input small"
                            min="1"
                            max={bag[sellKey] ?? 1}
                            value={sellQty}
                            onInput={(e) => setSellQty(Math.max(1, Math.min(bag[sellKey] ?? 1, parseInt((e.target as HTMLInputElement).value) || 1)))}
                          />
                        </div>
                        <div>
                          <label class="lbl tiny">Giá bán mỗi đơn vị (vàng):</label>
                          <input
                            type="number"
                            class="input small"
                            min="1"
                            max="9999"
                            value={sellPrice}
                            onInput={(e) => setSellPrice(Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1))}
                          />
                        </div>
                      </div>
                      <div class="listing-preview-row">
                        <span class="muted tiny">Thành tiền dự kiến: <b>{sellQty * sellPrice} vàng</b></span>
                        <button class="btn primary small" type="submit">Đăng bán lên chợ 🚀</button>
                      </div>
                    </>
                  )}
                </form>
              )}
            </div>

            {/* Các mặt hàng bạn đang rao bán */}
            <div class="my-active-listings">
              <div class="section-title">
                <b>📜 Mặt Hàng Bạn Đang Rao Bán ({myListingItems.length})</b>
              </div>
              {myListingItems.length === 0 ? (
                <p class="muted tiny">Bạn chưa đăng bán mặt hàng nào.</p>
              ) : (
                myListingItems.map((item) => (
                  <div key={item.id} class="market-item-row">
                    <span class="market-item-icon">{item.icon}</span>
                    <div class="market-item-info">
                      <b>{item.name}</b>
                      <div class="muted tiny">Còn lại: x{item.qty} {unitOf(item.key)} · Giá: {item.unitPrice} 💰/cái</div>
                    </div>
                    <button class="btn warn small" onClick={() => marketCancel(item.id)}>
                      Thu hồi về giỏ
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div class="dlg-actions">
          <button class="btn ghost" onClick={close}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
