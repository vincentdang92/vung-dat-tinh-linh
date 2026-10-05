// Lưới điểm ảnh để dựng pixel art bằng code: mọi hình đều tô theo ô nguyên,
// không khử răng cưa, rồi tự thêm viền quanh hình bóng.
// Không phụ thuộc Phaser để dùng được cả trong giao diện HTML (ảnh xem trước, icon).

export const CLEAR = -1;

export class PixelGrid {
  readonly w: number;
  readonly h: number;
  readonly px: Int32Array;

  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.px = new Int32Array(w * h).fill(CLEAR);
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return CLEAR;
    return this.px[y * this.w + x];
  }

  set(x: number, y: number, c: number) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }

  /** Chỉ tô lên ô đã có màu (dùng để vẽ hoa văn, bóng đổ trong hình). */
  paint(x: number, y: number, c: number) {
    if (this.get(Math.round(x), Math.round(y)) !== CLEAR) this.set(x, y, c);
  }

  rect(x: number, y: number, w: number, h: number, c: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  /** Hình chữ nhật bo góc 1 ô. */
  rrect(x: number, y: number, w: number, h: number, c: number) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const corner = (i === 0 || i === w - 1) && (j === 0 || j === h - 1);
        if (!corner) this.set(x + i, y + j, c);
      }
    }
  }

  /** Elip đặc, tâm và bán kính theo toạ độ liên tục (tâm ô = x + 0.5). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number, test?: (x: number, y: number) => boolean) {
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && (!test || test(x, y))) this.set(x, y, c);
      }
    }
  }

  /** Đường thẳng Bresenham, độ dày tính bằng ô. */
  line(x0: number, y0: number, x1: number, y1: number, c: number, thick = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const half = Math.floor((thick - 1) / 2);
    for (;;) {
      if (thick <= 1) this.set(x0, y0, c);
      else this.rect(x0 - half, y0 - half, thick, thick, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Tam giác đặc (kiểm tra tâm ô nằm trong tam giác). */
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: number) {
    const x0 = Math.floor(Math.min(ax, bx, cx)), x1 = Math.ceil(Math.max(ax, bx, cx));
    const y0 = Math.floor(Math.min(ay, by, cy)), y1 = Math.ceil(Math.max(ay, by, cy));
    const sign = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
      (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const d1 = sign(px, py, ax, ay, bx, by);
        const d2 = sign(px, py, bx, by, cx, cy);
        const d3 = sign(px, py, cx, cy, ax, ay);
        const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(neg && pos)) this.set(x, y, c);
      }
    }
  }

  /**
   * Hình quạt (dùng cho quạt phép, cánh nỏ...). `color(dist, angleOffset)` trả màu
   * cho từng ô, hoặc CLEAR để bỏ qua; angleOffset tính theo radian so với `ang`.
   */
  sector(cx: number, cy: number, r: number, ang: number, spread: number,
    color: (d: number, da: number) => number) {
    const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
    const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        let da = Math.atan2(dy, dx) - ang;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) > spread / 2) continue;
        const c = color(d, da);
        if (c !== CLEAR) this.set(x, y, c);
      }
    }
  }

  /** Thêm viền 1 ô quanh mọi vùng có màu (chỉ tô vào ô trống, 4 hướng). */
  outline(c: number) {
    const src = this.px.slice();
    const at = (x: number, y: number) =>
      x < 0 || y < 0 || x >= this.w || y >= this.h ? CLEAR : src[y * this.w + x];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x] !== CLEAR) continue;
        if (at(x - 1, y) !== CLEAR || at(x + 1, y) !== CLEAR || at(x, y - 1) !== CLEAR || at(x, y + 1) !== CLEAR) {
          this.px[y * this.w + x] = c;
        }
      }
    }
  }

  /** Dán một lưới khác lên (bỏ ô trống), có thể lật ngang. */
  blit(src: PixelGrid, dx: number, dy: number, flipX = false) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const c = src.px[y * src.w + x];
        if (c === CLEAR) continue;
        this.set(dx + (flipX ? src.w - 1 - x : x), dy + y, c);
      }
    }
  }

  /** Ghi vào ImageData của canvas tại vị trí (ox, oy). */
  drawTo(img: ImageData, ox: number, oy: number) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.px[y * this.w + x];
        if (c === CLEAR) continue;
        const i = ((oy + y) * img.width + (ox + x)) * 4;
        img.data[i] = (c >> 16) & 0xff;
        img.data[i + 1] = (c >> 8) & 0xff;
        img.data[i + 2] = c & 0xff;
        img.data[i + 3] = 255;
      }
    }
  }
}

/** Gộp nhiều lưới cùng cỡ thành 1 canvas xếp hàng ngang. */
export function gridsToCanvas(grids: PixelGrid[], fw: number, fh: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, grids.length * fw);
  canvas.height = fh;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(canvas.width, canvas.height);
  grids.forEach((g, i) => g.drawTo(img, i * fw, 0));
  ctx.putImageData(img, 0, 0);
  return canvas;
}
