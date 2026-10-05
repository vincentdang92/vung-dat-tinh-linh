// Cốt truyện & Hệ thống Nhiệm vụ, NPC, Cửa hàng — Vùng đất Tinh linh
import type { ClassId } from './data.ts';
import type { MapId } from './map.ts';

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  mapId: MapId; // NPC chỉ hiện và nói chuyện được trên bản đồ của mình
  x: number;
  y: number;
  color: number;
}

export const NPCS: Record<string, NpcDef> = {
  tao: {
    id: 'tao',
    name: 'Ông Táo',
    title: 'Người giữ bếp đình làng',
    mapId: 'lang_tre',
    x: 480,
    y: 1540,
    color: 0xe0533d,
  },
  nuoc: {
    id: 'nuoc',
    name: 'Bà Hàng Nước',
    title: 'Quán nước giếng làng',
    mapId: 'lang_tre',
    x: 550,
    y: 1610,
    color: 0x4aa3ff,
  },
  cuoi: {
    id: 'cuoi',
    name: 'Chú Cuội',
    title: 'Chăn trâu bìa rừng',
    mapId: 'lang_tre',
    x: 512,
    y: 1410,
    color: 0x3e5ba9,
  },
  caothi: {
    id: 'caothi',
    name: 'Cáo Thị Làng',
    title: 'Bảng việc làng & Phong tục',
    mapId: 'lang_tre',
    x: 520,
    y: 1580,
    color: 0xd97706,
  },
  do: {
    id: 'do',
    name: 'Bác Lái Đò',
    title: 'Bến đò Sông Ma',
    mapId: 'dam_sen',
    x: 800,
    y: 1560,
    color: 0x8b5a2b,
  },
  tam: {
    id: 'tam',
    name: 'Cô Tấm',
    title: 'Bên hiên nhà sàn',
    mapId: 'dam_sen',
    x: 160,
    y: 1504,
    color: 0xf472b6,
  },
  mo: {
    id: 'mo',
    name: 'Cô Mơ',
    title: 'Hàng xén Chợ Phiên',
    mapId: 'lang_tre',
    x: 680,
    y: 1550,
    color: 0xec4899,
  },
};

export interface QuestStep {
  step: number;
  desc: string;
  dialogue: string[];
  targetType?: 'talk' | 'kill' | 'gather' | 'boss';
  targetCount?: number;
  targetKind?: string;
  reward?: {
    xp?: number;
    gold?: number;
    potion?: number;
    drumPiece?: number;
    weaponReward?: boolean; // Tặng vũ khí hiếm theo môn phái
    title?: string;
  };
}

export interface QuestDef {
  id: string;
  title: string;
  npcId: string;
  steps: Record<number, QuestStep>;
}

export const QUESTS: Record<string, QuestDef> = {
  main1: {
    id: 'main1',
    title: 'Bếp Lửa Đình Làng',
    npcId: 'tao',
    steps: {
      1: {
        step: 1,
        desc: 'Trò chuyện với Ông Táo ở đình làng',
        dialogue: [
          'Trống Đồng Linh mất rồi! Năm nay ta chưa kịp về trời thì Mộc Tinh đã cướp trống đập vỡ làm 4 mảnh.',
          'Yêu tinh rừng đa thức giấc náo loạn cả lên! Con hãy giúp ta diệt 8 Bánh Trôi Tinh ở bìa rừng để mở đường nhé.',
        ],
        targetType: 'kill',
        targetKind: 'slime',
        targetCount: 8,
      },
      2: {
        step: 2,
        desc: 'Hạ 8 Bánh Trôi Tinh ở bìa rừng đa',
        dialogue: [
          'Khá lắm con! Mấy viên bánh trôi nghịch ngợm ấy đã bớt quậy rồi.',
          'Nhưng sâu trong rừng đa, bầy Cáo Tinh đang rình mò. Con hãy đi thu thập 3 Lá Đa Cổ từ Cáo Tinh về cho ta nhóm lửa.',
        ],
        reward: { xp: 40, potion: 2 },
        targetType: 'gather',
        targetKind: 'leaf',
        targetCount: 3,
      },
      3: {
        step: 3,
        desc: 'Thu thập 3 Lá Đa Cổ (đánh Cáo Tinh rơi)',
        dialogue: [
          'Tuyệt vời! Lửa đình làng ấm lại rồi.',
          'Giờ là lúc quyết định: Chúa Mộc Tinh đang ở Gốc Đa Cổ phía trên rừng. Hãy cùng đồng đội hạ hắn và đoạt lại Mảnh Trống Đồng 1!',
        ],
        reward: { xp: 80, gold: 30 },
        targetType: 'boss',
        targetKind: 'boss',
        targetCount: 1,
      },
      4: {
        step: 4,
        desc: 'Tiêu diệt Chúa Mộc Tinh ở Gốc Đa Cổ',
        dialogue: [
          'Mau mang Mảnh Trống Đồng về đình làng báo công cho Ông Táo!',
        ],
        targetType: 'talk',
      },
      5: {
        step: 5,
        desc: 'Đem Mảnh Trống Đồng 1 về cho Ông Táo',
        dialogue: [
          'Tiếng trống linh thiêng vang lên rồi! Thung lũng đã được bảo vệ.',
          'Ta phong cho con danh hiệu "Người Giữ Trống". Hãy nhận bảo khí môn phái này làm phần thưởng!',
        ],
        reward: {
          xp: 200,
          drumPiece: 1,
          weaponReward: true,
          title: 'Người Giữ Trống',
        },
      },
    },
  },
  main2: {
    id: 'main2',
    title: 'Sương Mù Bến Đò',
    npcId: 'do',
    steps: {
      1: {
        step: 1,
        desc: 'Trò chuyện với Bác Lái Đò ở Bến Đò Đầm Sen',
        dialogue: [
          'Ôi chao tráng sĩ! Đầm sen này dạo gần đây yêu khí ngút trời, nước sông dâng cuồn cuộn.',
          'Lũ Cua Đá từ bùn lầy bò lên phá nát bến đò, xới tung bờ mương. Tráng sĩ hãy trừ giúp ta 10 con Cua Đá để bến đò được yên bình!',
        ],
        targetType: 'kill',
        targetKind: 'crab',
        targetCount: 10,
      },
      2: {
        step: 2,
        desc: 'Hạ 10 Cua Đá ở ven các ao sen',
        dialogue: [
          'Đa tạ tráng sĩ! Cua Đá đã lui bớt rồi.',
          'Nhưng nguy hiểm nhất là màn sương ma quái bao phủ khúc sông phía bắc. Con đò không thể qua sông vì sương độc.',
          'Con hãy đi tìm 4 Hạt Sen Đêm từ lũ Ếch Lửa rực cháy giữa đầm sen, ta sẽ nấu thang thuốc định thần xua tan khí độc.',
        ],
        reward: { xp: 80, gold: 40 },
        targetType: 'gather',
        targetKind: 'lotus_seed',
        targetCount: 4,
      },
      3: {
        step: 3,
        desc: 'Thu thập 4 Hạt Sen Đêm (đánh Ếch Lửa rơi)',
        dialogue: [
          'Hạt sen đêm quý giá đây rồi! Hương thơm thanh khiết này có thể phá tan tà khí.',
          'Giờ đây tráng sĩ có thể vượt đầm tiến về Sông Ma. Nhưng cẩn thận: bầy Ma Da dưới đáy nước đang rình rập kéo chân người.',
          'Hãy trừ 5 Ma Da để khai thông dòng chảy bến sông!',
        ],
        reward: { xp: 120, potion: 2 },
        targetType: 'kill',
        targetKind: 'mada',
        targetCount: 5,
      },
      4: {
        step: 4,
        desc: 'Trừ 5 Ma Da ẩn nấp dưới dòng Sông Ma',
        dialogue: [
          'Ma Da đã khiếp sợ uy vũ của tráng sĩ!',
          'Tâm điểm của mọi tai ương chính là Vực Sông Ma phía trên cùng. Chúa Thuồng Luồng đã nuốt chửng Mảnh Trống Đồng 2, quẫy sóng làm nghiêng ngả cả đất trời.',
          'Hãy cùng các đồng đội tiến vào Vực Sông, diệt trừ Chúa Thuồng Luồng và đoạt lại Mảnh Trống Đồng thứ hai!',
        ],
        reward: { xp: 180, gold: 60 },
        targetType: 'boss',
        targetKind: 'serpent',
        targetCount: 1,
      },
      5: {
        step: 5,
        desc: 'Hạ Chúa Thuồng Luồng ở Vực Sông Ma',
        dialogue: [
          'Thuồng Luồng đã đền tội! Mau mang Mảnh Trống Đồng 2 về Làng Tre báo tin mừng cho Ông Táo!',
        ],
        targetType: 'talk',
      },
      6: {
        step: 6,
        desc: 'Đem Mảnh Trống Đồng 2 về cho Ông Táo ở Làng Tre',
        dialogue: [
          'Tiếng trống thứ hai ngân vang như sấm dậy, xua tan làn sương mờ mịt trên bến sông!',
          'Ta phong cho con danh hiệu "Người Lặng Sóng" và trao tặng Thần Binh của môn phái!',
          'Khoan đã... trên cả hai mảnh trống đồng, ta đều ngửi thấy mùi yêu hương quen thuộc... Chẳng lẽ Mộc Tinh và Thuồng Luồng chỉ là tay sai?',
          'Chính là Hồ Tinh Chín Đuôi ở Rừng Sương Mù ngàn năm! Yêu hồ đang mưu toan cướp trọn 4 mảnh trống để xưng bá. Hãy sẵn sàng cho cuộc viễn chinh tiếp theo!',
        ],
        reward: {
          xp: 450,
          gold: 150,
          drumPiece: 2,
          weaponReward: true,
          title: 'Người Lặng Sóng',
        },
      },
    },
  },
  tam1: {
    id: 'tam1',
    title: 'Chiếc Hài Thêu',
    npcId: 'tam',
    steps: {
      1: {
        step: 1,
        desc: 'Nói chuyện với Cô Tấm bên nhà sàn Bến Đò',
        dialogue: [
          'Hu hu... Chàng/Nàng ơi, thiếp vội chạy trốn lũ quái vật đầm sen nên đã đánh rơi chiếc hài thêu hoa sen ven bờ nước.',
          'Thiếp thấy một con Ếch Lửa to tướng đã tha chiếc hài đi mất. Chàng/Nàng có thể giúp thiếp tìm lại chiếc hài được không?',
        ],
        targetType: 'gather',
        targetKind: 'shoe',
        targetCount: 1,
      },
      2: {
        step: 2,
        desc: 'Tìm Chiếc Hài Thêu (đánh Ếch Lửa rơi)',
        dialogue: [
          'Ôi, đúng là chiếc hài thêu chỉ vàng của thiếp rồi! Thiếp đội ơn người vô cùng!',
          'Tấm lòng hiệp nghĩa của người thiếp xin ghi tạc. Thiếp tặng người chiếc Bùa Bình An và chúc người luôn đoan trang, kiên cường.',
        ],
        reward: { xp: 90, gold: 50, title: 'Đoan Trang' },
      },
      3: {
        step: 3,
        desc: 'Hoàn thành nhiệm vụ Chiếc Hài Thêu',
        dialogue: [
          'Thiếp cảm ơn người nhiều lắm! Chúc người vạn dặm bình an, trừ gian diệt ác bảo vệ xóm làng.',
        ],
      },
    },
  },
  cuoi1: {
    id: 'cuoi1',
    title: 'Tìm Trâu Cho Cuội',
    npcId: 'cuoi',
    steps: {
      1: {
        step: 1,
        desc: 'Tìm con trâu thất lạc giúp Chú Cuội',
        dialogue: [
          'Ôi bạn ơi, Cuội mải ngủ quên làm lạc mất con trâu ở bìa rừng rồi!',
          'Bạn đi tìm hộ Cuội với, nó trắng tròn béo mẫm dễ nhận ra lắm!',
        ],
        targetType: 'kill',
        targetKind: 'slime',
        targetCount: 1,
      },
      2: {
        step: 2,
        desc: 'Quay lại nói chuyện với Chú Cuội',
        dialogue: [
          'Hì hì, thật ra là Cuội nói dối tí thôi, trâu Cuội gửi ông Táo rồi!',
          'Tặng bạn bình máu bồi dưỡng nha, đừng giận Cuội nghen!',
        ],
        reward: { potion: 1, xp: 25 },
      },
    },
  },
};

// Giá cả tại cửa hàng Bà Hàng Nước
export const SHOP_PRICES = {
  buyPotion: 10, // 10 vàng / 1 bình máu
  sellWeapon: {
    common: 5,   // Vũ khí thường: 5 vàng
    rare: 25,    // Vũ khí hiếm: 25 vàng
    epic: 100,   // Vũ khí sử thi: 100 vàng
  },
} as const;

// ------------------------------------------------------------ Đố Vui Dân Gian (Trivia)
// Chỉ có câu hỏi và lựa chọn. Đáp án + lời giải nằm ở server (server/src/trivia.ts),
// chỉ gửi xuống sau khi người chơi đã trả lời, để không ai đọc được đáp án từ mã client.
export interface TriviaQuestion {
  id: number;
  q: string;
  options: [string, string, string];
}

export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  {
    id: 0,
    q: 'Kinh nghiệm đúc kết về trồng lúa nước của ông cha ta: "Nhất nước, nhì phân, tam cần, tứ..." gì?',
    options: ['Đất', 'Cày', 'Giống'],
  },
  {
    id: 1,
    q: 'Câu thơ: "Thân em vừa trắng lại vừa tròn, bảy nổi ba chìm với nước non" nhắc đến món ăn dân gian nào?',
    options: ['Bánh chưng', 'Bánh trôi', 'Bánh dầy'],
  },
  {
    id: 2,
    q: 'Kinh nghiệm thời vụ nông nghiệp: "Bao giờ đom đóm bay ra, hoa gạo rụng xuống thì tra hạt..." gì?',
    options: ['Hạt đỗ (đậu)', 'Hạt lúa', 'Hạt vừng'],
  },
  {
    id: 3,
    q: 'Tục lệ nào của người Việt xưa thể hiện nét đẹp giao tiếp qua câu: "Miếng trầu là đầu câu chuyện"?',
    options: ['Tục ăn trầu & têm trầu cánh phượng', 'Tục gói bánh tét', 'Tục thả cá chép'],
  },
  {
    id: 4,
    q: 'Bức tranh dân gian Đông Hồ nào thể hiện sự bình yên thanh thản của trẻ mục đồng?',
    options: ['Đám cưới chuột', 'Chăn trâu thổi sáo', 'Hứng dừa'],
  },
  {
    id: 5,
    q: 'Theo truyền thuyết, Thánh Gióng nhổ tre đằng ngà đánh đuổi giặc Ân vào đời vua Hùng thứ mấy?',
    options: ['Hùng Vương thứ 1', 'Hùng Vương thứ 18', 'Hùng Vương thứ 6'],
  },
];

// ------------------------------------------------------------ Sổ Tay Tranh Đông Hồ (Codex)
export interface FolkArtEntry {
  id: string;
  title: string;
  subtitle: string;
  verse: [string, string];
  desc: string;
  buff: string;
}

export const FOLK_ART_ENTRIES: Record<string, FolkArtEntry> = {
  chan_trau: {
    id: 'chan_trau',
    title: 'Chăn Trâu Thổi Sáo',
    subtitle: 'Thanh bình chốn đồng quê',
    verse: ['Trời cao mây trắng thong dong,', 'Mục đồng thổi sáo trên lưng trâu hiền.'],
    desc: 'Bức tranh Đông Hồ khắc họa hình ảnh trẻ mục đồng ung dung trên lưng trâu, biểu tượng cho sự an yên, thái bình và ham học của người Việt.',
    buff: '+30 Máu tối đa',
  },
  hung_dua: {
    id: 'hung_dua',
    title: 'Hứng Dừa',
    subtitle: 'Nét duyên dáng sinh hoạt lứa đôi',
    verse: ['Khen ai khéo đắp cảnh dừa,', 'Chàng trèo trên ngọn, thiếp chờ dưới cây.'],
    desc: 'Bức tranh dân gian tươi vui, miêu tả cảnh sinh hoạt mộc mạc chan chứa tình làng nghĩa xóm và tình duyên lứa đôi đằm thắm.',
    buff: '+3 Công kích',
  },
  dam_cuoi_chuot: {
    id: 'dam_cuoi_chuot',
    title: 'Đám Cưới Chuột',
    subtitle: 'Châm biếm thâm thúy & khát vọng hòa bình',
    verse: ['Kèn le ré rắt rước dâu về,', 'Tiến cống chim mồi dạ hả hê.'],
    desc: 'Đỉnh cao nghệ thuật trào lộng dân gian Đông Hồ, vừa dí dỏm răn đời vừa cầu mong cộng đồng bình yên, mùa màng tươi tốt.',
    buff: '+2 Giáp phòng thủ',
  },
  vinh_hoa: {
    id: 'vinh_hoa',
    title: 'Vinh Hoa Phú Quý',
    subtitle: 'Ước nguyện ấm no, phúc lộc ngập tràn',
    verse: ['Bé ôm gà lớn vinh hoa nở,', 'Phú quý an khang rạng rỡ đình.'],
    desc: 'Hình ảnh em bé bụ bẫm ôm chú gà trống lớn cầu chúc cho năm mới sung túc, hiển vinh, tài lộc dồi dào cho mọi gia đình.',
    buff: '+5% Tốc độ di chuyển',
  },
};

// ------------------------------------------------------------ Cáo Thị Làng
export interface VillageNotice {
  id: string;
  title: string;
  tag: string;
  content: string;
  rewardText: string;
}

export const VILLAGE_NOTICES: VillageNotice[] = [
  {
    id: 'nong_nghiep',
    title: 'Nhất Nước Nhì Phân',
    tag: 'Nông Tang',
    content: 'Mương làng dẫn nước về đồng, bà con hãy giữ gìn bờ ruộng và xua đuổi quái vật phá phách.',
    rewardText: '+20 Vàng & Bình máu',
  },
  {
    id: 'trau_cau',
    title: 'Miếng Trầu Khởi Sự',
    tag: 'Phong Tục',
    content: 'Ghé quán nước đầu đình thưởng thức bát chè xanh, cùng bà con đàm đạo chuyện làng.',
    rewardText: 'Buff Trà Xanh Tỉnh Táo',
  },
  {
    id: 'tru_yeu',
    title: 'Tuần Tra Trừ Hại',
    tag: 'Cảnh Giác',
    content: 'Cua Đá và Ma Da đang quấy nhiễu bến sông, các bậc dũng sĩ hãy chung tay trừ hại giúp xóm làng.',
    rewardText: '+50 XP & Danh tiếng',
  },
];

