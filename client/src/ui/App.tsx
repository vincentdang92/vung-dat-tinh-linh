import { useEffect, useRef, useState } from 'preact/hooks';
import { store, useStore, controls, loadSave } from '../state.ts';
import {
  join, leave, castSkill, castUltimate, drinkPotion, dash, equip, sendChat,
  talkToNpc, buyItem, sellItem,
} from '../actions.ts';
import { CLASSES, WEAPONS, RARITY_COLOR, ULTIMATES } from '../../../shared/data.ts';
import type { ClassId } from '../../../shared/data.ts';
import { DASH_CD, POTION_CD, INVENTORY_SIZE } from '../../../shared/constants.ts';
import { NPCS, QUESTS, SHOP_PRICES } from '../../../shared/story.ts';

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
  const save = loadSave();
  const [name, setName] = useState(save?.name ?? '');
  const [cls, setCls] = useState<ClassId>(save?.cls ?? 'warrior');
  const [creating, setCreating] = useState(!save);

  return (
    <div class="lobby">
      <h1>Happy Land</h1>
      <p class="sub">Vùng đất Vui Vẻ · nhập vai online màn hình dọc</p>

      {save && !creating && (
        <div class="card">
          <div class="row">
            <span class="dot" style={{ background: hex(CLASSES[save.cls].color) }} />
            <b>{save.name}</b>
            <span class="muted">{CLASSES[save.cls].name} · Lv {save.lv}</span>
          </div>
          <button class="btn primary" onClick={() => join({ token: save.token, name: save.name, cls: save.cls })}>
            Tiếp tục chơi
          </button>
          <button class="btn ghost" onClick={() => setCreating(true)}>Tạo nhân vật mới</button>
        </div>
      )}

      {creating && (
        <div class="card">
          <label class="lbl">Tên nhân vật</label>
          <input
            class="input" maxLength={14} value={name} placeholder="Tối đa 14 ký tự"
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          <label class="lbl">Chọn môn phái</label>
          <div class="classes">
            {(Object.keys(CLASSES) as ClassId[]).map((id) => {
              const c = CLASSES[id];
              return (
                <button key={id} class={`cls ${cls === id ? 'on' : ''}`} onClick={() => setCls(id)} style={{ '--c': hex(c.color) }}>
                  <span class="dot big" style={{ background: hex(c.color) }} />
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
          <button class="btn primary" disabled={!name.trim()} onClick={() => join({ name: name.trim(), cls, fresh: true })}>
            Vào game
          </button>
          {save && <button class="btn ghost" onClick={() => setCreating(false)}>Quay lại</button>}
        </div>
      )}
      <p class="hint">Điện thoại: cần gạt trái để đi, nút phải để dùng chiêu. Máy tính: WASD, Space khinh công, Q chiêu, R bí kíp, E bình máu.</p>
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
          <div class="muted tiny">{online} online · {ping}ms</div>
        </div>
      </div>

      <QuestTracker />

      <div class="top-buttons">
        <button class="icon-btn" onClick={() => store.set({ invOpen: !invOpen })}>🎒</button>
        <button class="icon-btn" onClick={() => store.set({ chatOpen: !store.get().chatOpen })}>💬</button>
      </div>

      <ChatLog />
      <Joystick />
      <ActionButtons />

      {nearNpc && !dialogue && !shopOpen && (
        <button class="btn-talk" onClick={() => talkToNpc(nearNpc)}>
          💬 Nói chuyện ({NPCS[nearNpc]?.name})
        </button>
      )}

      {dialogue && <DialogueBox dialogue={dialogue} />}
      {shopOpen && <ShopModal />}
      {invOpen && <Inventory />}
      {dead && <DeathOverlay />}
    </>
  );
}

// ------------------------------------------------------------------ Quest Tracker

function QuestTracker() {
  const me = useStore((s) => s.me);
  if (!me) return null;

  const qStep = me.quests?.main1 ?? 1;
  const prog = me.questProg ?? {};

  let text = 'Nói chuyện với Ông Táo ở đình làng';
  if (qStep === 1) text = `Diệt Bánh Trôi Tinh (${prog.main1 ?? 0}/8)`;
  else if (qStep === 2) text = 'Báo công với Ông Táo ở đình làng';
  else if (qStep === 3) text = `Tìm Lá Đa Cổ từ Cáo Tinh (${prog.main1_leaf ?? 0}/3)`;
  else if (qStep === 4) {
    const hasDrum = me.drumPieces?.includes(1);
    text = hasDrum ? 'Đem Mảnh Trống Đồng về cho Ông Táo' : 'Hạ Chúa Mộc Tinh ở Gốc Đa Cổ';
  } else if (qStep >= 5) {
    text = 'Đã hoàn thành Vùng 1 (Người Giữ Trống)';
  }

  return (
    <div class="quest-tracker">
      <div class="q-title">📜 Bếp Lửa Đình Làng</div>
      <div class="q-desc">{text}</div>
    </div>
  );
}

// ------------------------------------------------------------------ Nút Kỹ Năng & Bí Kíp

function CdButton(props: {
  label: string; sub?: string; readyAt: number; total: number; onPress: () => void;
  big?: boolean; disabled?: boolean; isUlt?: boolean; ready?: boolean; extraClass?: string;
}) {
  const cooling = props.readyAt > performance.now();
  const now = useNow(cooling);
  const left = Math.max(0, props.readyAt - now);
  const pct = props.total > 0 ? (left / props.total) * 100 : 0;

  const classes = [
    'act',
    props.big ? 'big' : '',
    props.isUlt ? 'ult' : '',
    props.ready ? 'ult-ready' : '',
    props.extraClass ?? '',
    left > 0 || props.disabled ? 'cool' : '',
  ].filter(Boolean).join(' ');

  return (
    <button class={classes} onPointerDown={(e) => { e.preventDefault(); props.onPress(); }}>
      {left > 0 && <span class="cd" style={{ background: `conic-gradient(rgba(0,0,0,.6) ${pct}%, transparent 0)` }} />}
      <span class="act-label">{props.label}</span>
      {left > 0 ? <span class="act-sub">{(left / 1000).toFixed(1)}</span> : props.sub && <span class="act-sub">{props.sub}</span>}
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

  return (
    <div class="actions">
      {/* Nút Bí kíp trấn phái: nằm phía trên nút chiêu */}
      <CdButton
        label={cls === 'warrior' ? 'Phù Đổng' : cls === 'archer' ? 'Nỏ Thần' : 'Thủy Long'}
        sub={ultReady ? 'SẴN SÀNG' : `${khi}%`}
        readyAt={0}
        total={100}
        onPress={castUltimate}
        isUlt
        ready={ultReady}
        disabled={!ultReady}
      />
      <CdButton label={CLASSES[cls].skill.name} readyAt={ready.skill} total={me?.skillCd ?? 1} onPress={castSkill} big />
      <CdButton label="Khinh công" readyAt={ready.dash} total={DASH_CD} onPress={dash} extraClass="dash" />
      <CdButton label="Máu" sub={`x${potions}`} readyAt={ready.potion} total={POTION_CD} onPress={drinkPotion} disabled={!potions} extraClass="potion" />
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
            <button class="btn primary" onClick={() => { store.set({ dialogue: null, shopOpen: true }); }}>
              Mở Cửa Hàng
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
  if (!me) return null;

  const weaponsToSell = me.inv.filter((it) => {
    const w = WEAPONS[it.key];
    return w && it.key !== me.weapon;
  });

  return (
    <div class="modal-overlay" onClick={() => store.set({ shopOpen: false })}>
      <div class="shop-card" onClick={(e) => e.stopPropagation()}>
        <div class="dlg-header">
          <b>Quán Nước Giếng Làng</b>
          <button class="icon-btn small" onClick={() => store.set({ shopOpen: false })}>✕</button>
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
        </div>
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
                    <div>
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
        <div class="slot" style={{ borderColor: hex(RARITY_COLOR[cur.rarity]) }}>⚔</div>
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
                <span>⚔</span>
                <small>{w.name}</small>
                <small class="plus">+{w.atk}</small>
              </button>
            );
          }
          if (it.key === 'leaf') {
            return (
              <div key={it.uid} class="slot"><span>🍃</span><small>Lá Đa</small><small class="plus">x{it.qty}</small></div>
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
