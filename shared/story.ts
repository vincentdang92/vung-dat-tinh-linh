// Cốt truyện & Hệ thống Nhiệm vụ, NPC, Cửa hàng — Happy Land Vùng đất Vui Vẻ
import type { ClassId } from './data.ts';

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  x: number;
  y: number;
  color: number;
}

export const NPCS: Record<string, NpcDef> = {
  tao: {
    id: 'tao',
    name: 'Ông Táo',
    title: 'Người giữ bếp đình làng',
    x: 480,
    y: 1540,
    color: 0xe0533d,
  },
  nuoc: {
    id: 'nuoc',
    name: 'Bà Hàng Nước',
    title: 'Quán nước giếng làng',
    x: 550,
    y: 1610,
    color: 0x4aa3ff,
  },
  cuoi: {
    id: 'cuoi',
    name: 'Chú Cuội',
    title: 'Chăn trâu bìa rừng',
    x: 512,
    y: 1410,
    color: 0x84cc16,
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
