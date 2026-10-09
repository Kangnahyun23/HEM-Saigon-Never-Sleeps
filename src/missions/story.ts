import type { Contact } from '@/systems/inbox';
import { centerX, centerZ, containsPoint } from '@/core/rect';
import type { CityLayout, Lot } from '@/world/city/layout';
import { locate } from '@/world/city/locate';
import { doorstep, type Spot } from './jobs';
import type { MissionDef } from './mission';

/**
 * Hồi 1 — "Cuốc xe định mệnh" (GDD): 5 nhiệm vụ cốt truyện nối tiếp nhau (thuần logic, có unit test).
 * Mỗi nhiệm vụ có điểm bắt đầu (người giao việc đứng đợi), tin nhắn mở / kết, và yêu cầu tiền nếu có.
 */

export type Line = readonly [Contact | 'Tín', string];

export interface StoryMission {
  def: MissionDef;
  giver: Contact;
  /** Điểm hẹn để bắt đầu nhiệm vụ. */
  start: Spot;
  /** Tin nhắn / lời thoại khi bắt đầu và khi xong. */
  intro: Line[];
  outro: Line[];
  /** Cần có ít nhất số tiền này mới bắt đầu được (trả nợ). */
  requiresCash?: number;
  /** Trả nợ app vay số tiền này khi xong nhiệm vụ. */
  paysDebt?: number;
}

/** Kỳ trả nợ đầu tiên. */
export const FIRST_INSTALLMENT = 1_500_000;

export interface StoryProgress {
  /** Chỉ số nhiệm vụ kế tiếp (0..5); 5 = hết Hồi 1. */
  next: number;
}

function nearestLot(lots: Lot[], x: number, z: number, filter: (l: Lot) => boolean): Lot {
  let best = lots[0] as Lot;
  let bestD = Infinity;
  for (const l of lots) {
    if (!filter(l)) continue;
    const d = Math.hypot(centerX(l.rect) - x, centerZ(l.rect) - z);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}

function farLot(lots: Lot[], x: number, z: number, min: number, max: number, filter: (l: Lot) => boolean): Lot {
  const candidates = lots.filter((l) => {
    const d = Math.hypot(centerX(l.rect) - x, centerZ(l.rect) - z);
    return filter(l) && d >= min && d <= max;
  });
  // Chọn tất định: lô có id nhỏ nhất trong khoảng (bố cục có seed nên kết quả cố định).
  return candidates.sort((a, b) => a.id - b.id)[0] ?? nearestLot(lots, x, z, filter);
}

export function buildStory(layout: CityLayout): StoryMission[] {
  const { spawn, lots, hems, market, river } = layout;
  const spot = (x: number, z: number): Spot => ({ x, z, place: locate(layout, x, z).name });

  // Nhà Tín và Ngân: căn trong hẻm gần chợ nhất.
  const home = doorstep(layout, nearestLot(lots, spawn.x, spawn.z, (l) => l.frontage === 'hem' && l.blockId >= 0));
  // Xe hủ tiếu gõ của chú Sáu: vỉa hè trước chợ, cạnh điểm xuất phát.
  const cart = spot(spawn.x - 6, spawn.z);
  // Ba điểm luồn hẻm: tâm ba hẻm chính gần chợ nhất (khác nhau).
  const mainHems = hems
    .filter((h) => h.kind === 'main')
    .map((h) => ({ h, d: Math.hypot(centerX(h.rect) - centerX(market.rect), centerZ(h.rect) - centerZ(market.rect)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map(({ h }) => spot(centerX(h.rect), centerZ(h.rect)));
  // Kèo không hỏi han: lấy ở tiệm mặt tiền cách chợ ~150–260 m, giao ra kho ven sông.
  const shady = doorstep(layout, farLot(lots, spawn.x, spawn.z, 150, 260, (l) => l.row === 'front' && l.kind === 'shophouse' && l.blockId >= 0));
  const prom = river.promenade;
  const dock = spot(centerX(prom) + 40, (prom.z0 + prom.z1) / 2);
  // Lần đầu bị truy đuổi: lấy ở phía bên kia khu, giao vào một nhà sâu trong hẻm.
  const pickup2 = doorstep(layout, farLot(lots, spawn.x, spawn.z, 260, 420, (l) => l.row === 'front' && l.kind !== 'tower' && l.blockId >= 0));
  const hideout = doorstep(layout, farLot(lots, pickup2.x, pickup2.z, 160, 300, (l) => l.frontage === 'hem' && l.row === 'back' && l.blockId >= 0));
  // Văn phòng Vay Liền 5S: cao ốc trên đại lộ gần chợ nhất.
  const office = doorstep(layout, nearestLot(lots, spawn.x, spawn.z, (l) => l.kind === 'tower'));

  return [
    {
      giver: 'Ngân',
      start: home,
      def: {
        id: 'h1-ve-nha',
        title: 'Hồi 1 · Về nhà',
        reward: 0,
        objectives: [{ kind: 'wait', x: home.x, z: home.z, radius: 4, seconds: 3, label: 'Nghe Ngân kể chuyện' }],
      },
      intro: [
        ['Ngân', 'Anh về rồi! Tờ giấy đỏ đây nè... "Khoản vay quá hạn — Vay Liền 5S".'],
        ['Tín', 'Anh vay để sửa xe chạy kèo, ai ngờ lãi chồng lãi vậy.'],
        ['Ngân', 'Họ nói tuần này không trả kỳ đầu thì tới trường em làm ầm lên...'],
      ],
      outro: [
        ['Tín', 'Đừng lo. Anh chạy kèo kiếm đủ 1,5 triệu trả kỳ đầu. Chú Sáu nói có mối cho anh.'],
        ['Ngân', 'Anh đi cẩn thận. Ghé xe hủ tiếu chú Sáu ở đầu chợ đó.'],
      ],
    },
    {
      giver: 'Chú Sáu',
      start: cart,
      def: {
        id: 'h1-hu-tieu-go',
        title: 'Hồi 1 · Hủ tiếu gõ',
        reward: 150_000,
        objectives: [
          { kind: 'mount', label: 'Lên xe' },
          ...mainHems.map((p, i) => ({ kind: 'goto' as const, x: p.x, z: p.z, radius: 4.5, bike: true, label: `Luồn hẻm ${i + 1}/3: ${p.place}`, place: p.place })),
          { kind: 'goto', x: cart.x, z: cart.z, radius: 4, label: 'Quay về xe hủ tiếu chú Sáu', place: cart.place },
        ],
        timeLimit: 150,
        timerFrom: 1,
        late: 'half',
      },
      intro: [
        ['Chú Sáu', 'Tín! Ăn tô hủ tiếu đi rồi nghe chú nói. Chạy kèo ở khu này, ai thuộc hẻm người đó sống.'],
        ['Chú Sáu', 'Ô tô vô hẻm không lọt, tụi đòi nợ đi xe hơi càng không. Chạy thử ba con hẻm chú chỉ, về đây trong hai phút rưỡi.'],
      ],
      outro: [
        ['Chú Sáu', 'Được đó! Đây, 150 ngàn tiền xăng. Mai chú giới thiệu mối "không hỏi han" — tiền khá, đừng tò mò.'],
      ],
    },
    {
      giver: 'Chú Sáu',
      start: shady,
      def: {
        id: 'h1-khong-hoi-han',
        title: 'Hồi 1 · Kèo không hỏi han',
        reward: 450_000,
        objectives: [
          { kind: 'wait', x: shady.x, z: shady.z, radius: 4, seconds: 2, label: `Nhận gói hàng ở ${shady.place}` },
          { kind: 'goto', x: dock.x, z: dock.z, radius: 5, bike: true, label: `Giao ra kho ven sông (${dock.place})`, place: dock.place },
        ],
        timeLimit: 120,
        timerFrom: 1,
        late: 'half',
      },
      intro: [['Chú Sáu', `Tới ${shady.place} lấy gói hàng, giao ra kho ven sông. Không mở, không hỏi.`]],
      outro: [
        ['Chú Sáu', 'Khách khen chạy lẹ. 450 ngàn nè con. Có kèo lớn hơn, nhưng nghe đâu dính tới người của Phát...'],
        ['Phát CEO', 'Chào tài xế Tín. Nghe nói dạo này chạy kèo "nóng" hả? Khu này là của tôi đó nha.'],
      ],
    },
    {
      giver: 'Chú Sáu',
      start: pickup2,
      def: {
        id: 'h1-truy-duoi',
        title: 'Hồi 1 · Lần đầu bị truy đuổi',
        reward: 650_000,
        objectives: [
          { kind: 'wait', x: pickup2.x, z: pickup2.z, radius: 4, seconds: 2, label: `Lấy hàng ở ${pickup2.place}` },
          { kind: 'escape', label: 'Đàn em của Phát bám đuôi! Chui hẻm để cắt đuôi' },
          { kind: 'goto', x: hideout.x, z: hideout.z, radius: 4, bike: true, label: `Giao hàng tới ${hideout.place}`, place: hideout.place },
        ],
        heat: { at: 1, level: 2 },
      },
      intro: [['Chú Sáu', 'Kèo này 650 ngàn. Người của Phát đang canh, lấy hàng xong là tụi nó bám. Nhớ: hẻm là nhà mình.']],
      outro: [
        ['Chú Sáu', 'Hay lắm! Tụi nó đi xe phân khối lớn mà thua con hẻm 3 tấc. Đây, 650 ngàn.'],
        ['Ngân', 'Anh ơi, em nghe nói anh bị rượt hả?? Anh có sao không?'],
        ['Tín', 'Anh không sao. Gom gần đủ tiền rồi, mai đi trả kỳ đầu.'],
      ],
    },
    {
      giver: 'Vay Liền 5S',
      start: office,
      requiresCash: FIRST_INSTALLMENT,
      paysDebt: FIRST_INSTALLMENT,
      def: {
        id: 'h1-tra-no',
        title: 'Hồi 1 · Trả nợ đợt đầu',
        reward: 0,
        objectives: [{ kind: 'wait', x: office.x, z: office.z, radius: 4, seconds: 3, label: 'Nộp tiền ở quầy Vay Liền 5S' }],
      },
      intro: [['Vay Liền 5S', 'Chào mừng Quý khách tới văn phòng Vay Liền 5S. Vui lòng chờ nhân viên xác nhận khoản thanh toán.']],
      outro: [
        ['Vay Liền 5S', 'Đã nhận 1.500.000 đ kỳ 1. Dư nợ còn lại sẽ được cập nhật kèm "phí dịch vụ".'],
        ['Phát CEO', 'Trả được kỳ đầu là giỏi. Nhưng chơi với tôi thì phải chơi lâu dài, tài xế à.'],
        ['Ngân', 'Anh ơi, họ gỡ giấy đỏ trước cửa rồi! Cảm ơn anh nhiều lắm!'],
        ['Tín', 'Hết Hồi 1. Sài Gòn còn chưa ngủ đâu...'],
      ],
    },
  ];
}

/** Điểm có nằm trong nhà nào không (kiểm tra dữ liệu nhiệm vụ). */
export function insideAnyLot(layout: CityLayout, x: number, z: number): boolean {
  return layout.lots.some((l) => containsPoint(l.rect, x, z));
}
