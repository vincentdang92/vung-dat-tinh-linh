// Đáp án + lời giải Đố Vui Dân Gian: CHỈ nằm ở server.
// Client chỉ có câu hỏi (shared/story.ts) và chỉ nhận đáp án sau khi đã trả lời.
export const TRIVIA_ANSWERS: Record<number, { ans: number; exp: string }> = {
  0: { ans: 2, exp: '"Nhất nước, nhì phân, tam cần, tứ giống" — bốn yếu tố làm nên vụ lúa tốt của nền văn minh lúa nước.' },
  1: { ans: 1, exp: 'Bài thơ "Bánh trôi nước" của Hồ Xuân Hương. Bánh trôi gắn với Tết Hàn thực mùng 3 tháng 3 âm lịch.' },
  2: { ans: 2, exp: 'Cuối xuân đom đóm bay ra, hoa gạo rụng là lúc trời ấm, đất ẩm — đúng thời vụ tra hạt vừng.' },
  3: { ans: 0, exp: 'Miếng trầu (trầu, cau, vôi) mở đầu mọi cuộc gặp gỡ, cưới hỏi, tượng trưng cho tình nghĩa và lòng hiếu khách.' },
  4: { ans: 1, exp: 'Tranh "Chăn trâu thổi sáo" vẽ mục đồng thảnh thơi thổi sáo trên lưng trâu, biểu tượng thái bình.' },
  5: { ans: 2, exp: 'Theo truyền thuyết, Thánh Gióng (Phù Đổng Thiên Vương) phá giặc Ân vào đời Hùng Vương thứ 6.' },
};

/** Thưởng mỗi câu trả lời đúng (mỗi câu chỉ được trả lời 1 lần mỗi ngày). */
export const TRIVIA_REWARD = { xp: 50, gold: 25 };
