// Tên nhân vật: chỉ chữ cái tiếng Việt (có dấu hoặc không dấu), chữ số và dấu cách đơn, 2–15 ký tự.
// Kèm bộ sinh tên ngẫu nhiên (nút xúc xắc) đậm chất cổ tích, kiếm hiệp.

export const NAME_MIN = 2;
export const NAME_MAX = 15;

const LOWER = 'aàáảãạăằắẳẵặâầấẩẫậbcdđeèéẻẽẹêềếểễệfghiìíỉĩịjklmnoòóỏõọôồốổỗộơờớởỡợpqrstuùúủũụưừứửữựvwxyỳýỷỹỵz';
const LETTERS = new Set([...LOWER, ...LOWER.toUpperCase()]);
const DIGITS = new Set([...'0123456789']);

/** Chuẩn hoá: Unicode NFC (gộp dấu tổ hợp), bỏ khoảng trắng hai đầu, gộp dấu cách liên tiếp. */
export function normalizeName(raw: unknown): string {
  return String(raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Trả câu báo lỗi, hoặc null nếu hợp lệ (kiểm tra trên tên đã chuẩn hoá). */
export function nameError(raw: unknown): string | null {
  const s = normalizeName(raw);
  const chars = [...s];
  if (chars.length < NAME_MIN) return `Tên cần ít nhất ${NAME_MIN} ký tự`;
  if (chars.length > NAME_MAX) return `Tên tối đa ${NAME_MAX} ký tự`;
  let letters = 0;
  for (const c of chars) {
    if (LETTERS.has(c)) letters++;
    else if (!DIGITS.has(c) && c !== ' ') return 'Tên chỉ gồm chữ tiếng Việt, số và dấu cách';
  }
  if (letters === 0) return 'Tên cần có ít nhất 1 chữ cái';
  return null;
}

/** Bỏ dấu tiếng Việt: "Bạch Vân" -> "Bach Van". */
export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC');
}

// ------------------------------------------------------------------ sinh tên ngẫu nhiên

const FIRST = [
  'Tiểu', 'Bạch', 'Hắc', 'Lạc', 'Thiết', 'Phong', 'Vân', 'Nguyệt', 'Kim', 'Hỏa', 'Thủy', 'Mộc',
  'Thạch', 'Ngọc', 'Hoàng', 'Thanh', 'Lam', 'Hồng', 'Tử', 'Bích', 'Thiên', 'Huyền', 'Linh', 'Kiếm',
];
const SECOND = [
  'Long', 'Hổ', 'Phong', 'Vân', 'Sơn', 'Hà', 'Lan', 'Mai', 'Tùng', 'Trúc', 'Kiếm', 'Tiễn', 'Phù',
  'Hùng', 'Dũng', 'Anh', 'Minh', 'Nguyệt', 'Tinh', 'Vũ', 'Lâm', 'Hải', 'Điệp', 'Yến', 'Hạc', 'Ưng',
  'Khôi', 'Quân', 'Lăng', 'Thư',
];
/** Tên nhân vật cổ tích quen thuộc. */
const FOLK = ['Thạch Sanh', 'Lạc Long', 'Âu Cơ', 'Sơn Tinh', 'Thủy Tinh', 'Mỵ Châu', 'An Tiêm', 'Thánh Gióng', 'Chử Đồng Tử', 'Tấm Cám'];

const pick = <T,>(arr: T[], rnd: () => number) => arr[Math.floor(rnd() * arr.length)];

/**
 * Sinh tên ngẫu nhiên hợp lệ, tối đa 15 ký tự.
 * Khoảng 60% giữ dấu ("Bạch Vân 27"), 40% không dấu ("Bach Van" hoặc viết liền "BachVan27").
 */
export function randomName(rnd: () => number = Math.random): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    let parts: string[];
    if (rnd() < 0.15) parts = pick(FOLK, rnd).split(' ');
    else {
      const a = pick(FIRST, rnd);
      let b = pick(SECOND, rnd);
      while (b === a) b = pick(SECOND, rnd);
      parts = [a, b];
    }
    const num = rnd() < 0.4 ? String(1 + Math.floor(rnd() * 99)) : '';
    let name: string;
    if (rnd() < 0.4) {
      const plain = parts.map(stripDiacritics);
      name = rnd() < 0.5 ? plain.join('') + num : [...plain, num].filter(Boolean).join(' ');
    } else {
      name = [...parts, num].filter(Boolean).join(' ');
    }
    if (!nameError(name)) return name;
  }
  return 'Lữ Khách';
}
