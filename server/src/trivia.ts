// Đáp án + lời giải Đố Vui Dân Gian: CHỈ nằm ở server.
// Client chỉ có câu hỏi (shared/story.ts) và chỉ nhận đáp án sau khi đã trả lời.
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TriviaRankEntry } from '../../shared/story.ts';

export const TRIVIA_ANSWERS: Record<number, { ans: number; exp: string }> = {
  0: { ans: 2, exp: '"Nhất nước, nhì phân, tam cần, tứ giống" — bốn yếu tố làm nên vụ lúa tốt của nền văn minh lúa nước.' },
  1: { ans: 1, exp: 'Bài thơ "Bánh trôi nước" của Hồ Xuân Hương. Bánh trôi gắn với Tết Hàn thực mùng 3 tháng 3 âm lịch.' },
  2: { ans: 2, exp: 'Cuối xuân đom đóm bay ra, hoa gạo rụng là lúc trời ấm, đất ẩm — đúng thời vụ tra hạt vừng.' },
  3: { ans: 0, exp: 'Miếng trầu (trầu, cau, vôi) mở đầu mọi cuộc gặp gỡ, cưới hỏi, tượng trưng cho tình nghĩa và lòng hiếu khách.' },
  4: { ans: 1, exp: 'Tranh "Chăn trâu thổi sáo" vẽ mục đồng thảnh thơi thổi sáo trên lưng trâu, biểu tượng thái bình.' },
  5: { ans: 2, exp: 'Theo truyền thuyết, Thánh Gióng (Phù Đổng Thiên Vương) phá giặc Ân vào đời Hùng Vương thứ 6.' },
  6: { ans: 0, exp: '"Con trâu là đầu cơ nghiệp" — bạn đồng hành thủy chung, biểu tượng siêng năng của người nông dân Việt.' },
  7: { ans: 1, exp: 'Câu đố miêu tả quả mít: vỏ ngoài gai sần sùi như da cóc, múi vàng thơm như bột lọc bọc lấy hạt mít nâu như hòn than.' },
  8: { ans: 0, exp: 'Hoàng tử Lang Liêu được thần báo mộng, dùng hạt gạo quý báu làm nên Bánh Chưng (tượng Đất) và Bánh Giầy (tượng Trời).' },
  9: { ans: 1, exp: 'Mai An Tiêm với đức tính tự lập "Của biếu là lo, của cho là nợ" đã thuần hóa giống dưa hấu lòng đỏ thơm ngọt.' },
  10: { ans: 0, exp: 'Nón lá chóp nhọn đan từ lá cọ/lá gồi, mang vẻ đẹp duyên dáng, mộc mạc và thanh thoát của phụ nữ Việt.' },
  11: { ans: 1, exp: 'Hồ Tả Vọng xưa được đổi tên thành Hồ Hoàn Kiếm khi Rùa Vàng ngoi lên nhận lại gươm thần giúp giữ yên bờ cõi.' },
  12: { ans: 1, exp: 'Độ ẩm không khí trước cơn mưa làm cánh chuồn chuồn trĩu sương nên bay thấp, báo hiệu thời tiết rất chuẩn xác.' },
  13: { ans: 0, exp: 'Cầu khỉ là nét văn hóa mộc mạc của vùng sông nước Cửu Long, đòi hỏi sự khéo léo giữ thăng bằng khi qua cầu.' },
  14: { ans: 1, exp: 'Theo sự tích dân gian, ngọn cây nêu treo chuông gió đất nung và cung tên răn đe lũ quỷ dữ không dám vào làng quấy nhiễu.' },
  15: { ans: 1, exp: 'Ngô Quyền đã chớp thời cơ thủy triều rút trên sông Bạch Đằng năm 938 để đập tan quân xâm lược, chấm dứt 1000 năm Bắc thuộc.' },
  16: { ans: 1, exp: 'Cua đồng tám cẳng hai càng bò ngang, là nguyên liệu của món canh cua đồng rau đay mồng tơi ngọt mát chốn đồng quê.' },
  17: { ans: 0, exp: 'Cây chuối cả đời chỉ trổ một buồng quả thơm ngọt, lá chuối dùng gói bánh chưng bánh giầy, hoa chuối làm nộm dân dã.' },
  18: { ans: 1, exp: 'Mùng 10 tháng 3 âm lịch là ngày Giỗ Tổ Hùng Vương, ngày hội cội nguồn thiêng liêng của toàn thể dân tộc Việt Nam.' },
  19: { ans: 0, exp: 'Ngôi sao mặt trời ở tâm trống đồng thể hiện tín ngưỡng sùng kính mặt trời của cư dân nông nghiệp lúa nước thời Văn Lang.' },
  20: { ans: 0, exp: '"Ước gì anh lấy được nàng / Để anh mua gạch Bát Tràng về xây" — làng gốm Bát Tràng nổi tiếng với men lam, men rạn độc đáo.' },
  21: { ans: 1, exp: 'Cối xay lúa đan bằng tre nhồi đất sét nung, răng cối bằng gỗ nghiến chà xát tách vỏ trấu để lộ hạt gạo hạt ngọc tinh khôi.' },
  22: { ans: 0, exp: 'Tre giữ làng, giữ nước, giữ mái nhà tranh; tre là biểu tượng tâm hồn, sự đoàn kết và ý chí kiên trung của con người Việt Nam.' },
  23: { ans: 1, exp: 'Cột cờ Lũng Cú nằm trên đỉnh núi Rồng (Hà Giang), lá cờ 54m² tượng trưng cho 54 dân tộc anh em bền chặt keo sơn.' },
  24: { ans: 1, exp: 'Phở là biểu tượng đỉnh cao của ẩm thực Việt, nổi danh khắp năm châu bởi hương vị nước dùng tinh tế từ thảo mộc thiên nhiên.' },
  25: { ans: 1, exp: 'Hai Bà Trưng cưỡi voi xuất trận ở Hát Môn, lập nên kỳ tích đánh đuổi Tô Định, rửa sạch nợ nước trả thù nhà.' },
  26: { ans: 0, exp: 'Truyền thống văn hóa làng xã Việt Nam coi trọng tình láng giềng, gắn kết đùm bọc lẫn nhau trong sinh hoạt hằng ngày.' },
  27: { ans: 2, exp: 'Áo dài là quốc phục tôn vinh vẻ đẹp kín đáo, thanh lịch và trang nhã của người con gái Việt Nam qua bao thế hệ.' },
  28: { ans: 0, exp: 'Bắt đầu từ thời vua Lê Đại Hành năm 987, Lễ Tịch Điền thể hiện sự quý trọng nông nghiệp và tinh thần gần dân của bậc minh quân.' },
  29: { ans: 0, exp: 'Sính lễ thách cưới của Vua Hùng gồm: "Voi chín ngà, gà chín cựa, ngựa chín hồng mao", những sản vật quý hiếm chốn núi non.' },
};

/** Thưởng mỗi câu trả lời đúng (mỗi câu chỉ được trả lời 1 lần mỗi ngày). */
export const TRIVIA_REWARD = { xp: 50, gold: 25 };

// ------------------------------------------------------------ Quản lý Bảng Vàng Trạng Nguyên

export interface TriviaRankRecord {
  token: string;
  name: string;
  cls: string;
  score: number;
  title: string;
  updatedAt: number;
}

export class TriviaBoardManager {
  private filePath?: string;
  private records = new Map<string, TriviaRankRecord>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(dataDir?: string) {
    if (dataDir) {
      try {
        mkdirSync(dataDir, { recursive: true });
        this.filePath = join(dataDir, 'trivia_board.json');
        this.loadLocal();
      } catch (err) {
        console.error('[TriviaBoard] Không thể mở thư mục lưu trữ:', err);
      }
    }
  }

  private loadLocal() {
    if (!this.filePath || !existsSync(this.filePath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8'));
      if (Array.isArray(raw)) {
        for (const item of raw) {
          if (item && item.token && typeof item.score === 'number') {
            this.records.set(item.token, {
              token: item.token,
              name: String(item.name || 'Vô Danh'),
              cls: String(item.cls || 'warrior'),
              score: Math.max(0, Math.floor(Number(item.score)) || 0),
              title: String(item.title || 'Đồng Sinh'),
              updatedAt: Number(item.updatedAt) || Date.now(),
            });
          }
        }
      }
    } catch (err) {
      console.error('[TriviaBoard] Lỗi khi nạp trivia_board.json:', err);
    }
  }

  private scheduleSave() {
    if (!this.filePath) return;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      try {
        const list = Array.from(this.records.values());
        const tmp = `${this.filePath}.tmp`;
        await writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
        const { rename } = await import('node:fs/promises');
        await rename(tmp, this.filePath!);
      } catch (err) {
        console.error('[TriviaBoard] Ghi trivia_board.json thất bại:', err);
      }
    }, 1000);
  }

  recordCorrect(token: string, name: string, cls: string, score: number, title: string) {
    const existing = this.records.get(token);
    const newScore = Math.max(existing?.score ?? 0, score);
    this.records.set(token, {
      token,
      name,
      cls,
      score: newScore,
      title,
      updatedAt: Date.now(),
    });
    this.scheduleSave();
  }

  getTopBoard(limit = 15): TriviaRankEntry[] {
    const list = Array.from(this.records.values());
    list.sort((a, b) => b.score - a.score || a.updatedAt - b.updatedAt);
    return list.slice(0, limit).map((r) => ({
      name: r.name,
      cls: r.cls,
      score: r.score,
      title: r.title,
      updatedAt: r.updatedAt,
    }));
  }
}
