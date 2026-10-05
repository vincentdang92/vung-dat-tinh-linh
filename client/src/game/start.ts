import Phaser from 'phaser';
import { WorldScene } from './WorldScene.ts';
import type { Net } from '../net.ts';
import type { MapId } from '../../../shared/map.ts';

let game: Phaser.Game | null = null;

/** Khung hình dọc: rộng cố định 360, cao theo tỉ lệ màn hình (giới hạn 560–820). */
function viewSize() {
  const w = 360;
  const ratio = window.innerHeight / Math.max(1, window.innerWidth);
  const h = Math.round(Math.min(820, Math.max(560, w * ratio)));
  return { w, h };
}

export function startGame(net: Net) {
  game?.destroy(true);
  const { w, h } = viewSize();
  const g = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: w,
    height: h,
    backgroundColor: '#1d2b1a',
    antialias: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 3 },
    fps: { target: 60 },
    banner: false,
  });
  game = g;
  // Cảnh thế giới chỉ dựng khi server báo bản đồ (welcome), và dựng lại mỗi lần qua cổng
  net.onMap = (mapId) => { if (game === g) mountWorld(g, net, mapId); };
  return g;
}

/** Bỏ cảnh cũ, dựng cảnh mới cho bản đồ `mapId` (instance mới nên mọi trạng thái được làm sạch). */
function mountWorld(g: Phaser.Game, net: Net, mapId: MapId) {
  net.onSnap = () => {}; // snapshot đến giữa lúc đổi cảnh: bỏ qua, cảnh mới sẽ nhận các gói sau
  if (g.scene.getScene('world')) g.scene.remove('world');
  g.scene.add('world', WorldScene, true, { net, mapId });
}

export function stopGame() {
  game?.destroy(true);
  game = null;
}
