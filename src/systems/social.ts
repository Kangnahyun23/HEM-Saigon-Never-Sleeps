import { createRng, pick, type Rng } from '@/core/random';

/**
 * "Phây" — mạng xã hội châm biếm trong điện thoại (thuần logic, có unit test). Bảng tin sinh theo seed + ngày + khung giờ,
 * phản ứng theo diễn biến game (bị rượt, trời mưa, nợ app vay). Mọi tên người / trang / thương hiệu đều hư cấu.
 */

export interface FeedPost {
  readonly author: string;
  readonly text: string;
  readonly likes: number;
  readonly comments: number;
  /** Bài quảng cáo được tài trợ. */
  readonly sponsored?: boolean;
  /** Bài nóng theo diễn biến game (đẩy lên đầu). */
  readonly hot?: boolean;
}

export interface FeedContext {
  /** Độ Nóng / truy nã hiện tại (0 = không ai rượt). */
  heat: number;
  raining: boolean;
  /** Tiền nợ app vay còn lại (đ). */
  debt: number;
  hour: number;
}

type Template = (rng: Rng) => { author: string; text: string };

const PLACES = ['Đại lộ Sao Đen', 'chợ Trung Tâm', 'cầu Kênh Tẻ Mới', 'bến Bình Đông Cũ', 'vòng xoay Hàng Xanh Nhỏ'];
const FOODS = ['cơm tấm', 'hủ tiếu gõ', 'bánh mì', 'bún bò', 'ốc len xào dừa', 'trà sữa'];

/** Bài thường ngày (luôn có). */
const DAILY: readonly Template[] = [
  (r) => ({ author: 'Hóng Biến Sài Gòn', text: `Kẹt xe ${pick(r, PLACES)} từ chiều tới giờ, ai đi đường vòng giùm cái. Cập nhật liên tục!!!` }),
  (r) => ({ author: 'Bé Bảy Livestream', text: `LIVE nè cả nhà ơi 🔴 ${1 + Math.floor(r() * 9)}.${Math.floor(r() * 900 + 100)} người đang xem — "nước thần" uống vô hết mệt, hết nợ, hết luôn… tiền. Chốt đơn lẹ!` }),
  () => ({ author: 'Tuyển Dụng Siêu Tốc', text: 'TUYỂN GẤP: việc nhẹ lương cao, nằm nhà bấm điện thoại 30 triệu/tháng, không cần kinh nghiệm. Chỉ cần đóng 2 triệu phí hồ sơ. Inbox!!!' }),
  (r) => ({ author: 'Hội Xe Ôm Công Nghệ Q.Trung Tâm', text: `Anh em chạy đêm nay cẩn thận khúc ${pick(r, PLACES)}, có đám thanh niên đứng chặn đường xin "phí qua đường".` }),
  (r) => ({ author: 'Thánh Ăn Đêm', text: `${pick(r, FOODS)} ${pick(r, ['2h sáng', 'nửa đêm', '11h khuya'])} vẫn đông nghẹt, ai ngủ được ở cái thành phố này thì chỉ mình 😴` }),
  () => ({ author: 'Vy "Pô Độ"', text: 'Xe mới độ xong, pô kêu như máy bay. Tối nay ai dám ra cầu thì ra 🏁 (đua cho vui, công an đừng đọc)' }),
  () => ({ author: 'Ngân', text: 'Ủa ai thấy anh Tín đâu không, nhắn hoài không trả lời 😤' }),
  (r) => ({ author: 'Review Dạo Chuyên Nghiệp', text: `Quán ${pick(r, FOODS)} đầu hẻm: đồ ăn 3/10, thái độ 1/10, view hẻm 10/10. Sẽ quay lại (vì gần nhà).` }),
  () => ({ author: 'Chú Sáu Sửa Xe', text: 'Thay nhớt, vá vỏ, độ đèn — bao giá rẻ nhất khu. Tiệm mở tới khi nào chú buồn ngủ.' }),
  () => ({ author: 'Hóng Biến Sài Gòn', text: 'Clip: anh shipper chạy 3 đơn một lúc, tay xách nách mang, vừa chạy vừa nghe điện thoại. Đỉnh cao đa nhiệm!' }),
];

/** Quảng cáo app vay của Phát — luôn chen vào bảng tin. */
const LOAN_ADS: readonly string[] = [
  'VAY LIỀN 5S — duyệt 5 giây, không cần thế chấp, không hỏi lý do. Lãi chỉ 0,3%/ngày* (*chưa gồm phí, phí của phí, phí nhắc phí).',
  'Kẹt tiền? VAY LIỀN 5S lo hết! Trễ hạn? Đội ngũ chăm sóc khách hàng sẽ gọi cho cả danh bạ của bạn ❤️',
  'VAY LIỀN 5S: vay 5 triệu nhận ngay 3 triệu (2 triệu là "phí thẩm định tình cảm").',
];

export function generateFeed(seed: number, day: number, ctx: FeedContext): FeedPost[] {
  // Đổi bài mỗi 3 giờ trong game.
  const slot = Math.floor(ctx.hour / 3);
  const rng = createRng(seed * 977 + day * 131 + slot * 17 + 5);
  const reactions = (base: number): { likes: number; comments: number } => ({
    likes: Math.round(base * (0.4 + rng() * 1.6)),
    comments: Math.round(base * (0.02 + rng() * 0.12)),
  });
  const posts: FeedPost[] = [];

  // Bài nóng theo diễn biến game.
  if (ctx.heat > 0)
    posts.push({
      author: 'Hóng Biến Sài Gòn',
      text: `NÓNG: thanh niên áo khoác đen, đeo thùng giao hàng cam bị một đám người rượt trên ${pick(rng, PLACES)}. Ai quen thì báo giùm 😱`,
      hot: true,
      ...reactions(9000),
    });
  if (ctx.raining)
    posts.push({ author: 'Tuấn Kẹt Xe', text: 'Mưa có xíu mà nước lên tới đầu gối. Triều cường cộng mưa = bơi về nhà 🛶', hot: true, ...reactions(4000) });
  if (ctx.debt > 0)
    posts.push({ author: 'Hội Nạn Nhân App Vay', text: 'App vay gọi cho mẹ, cho sếp, cho cả người yêu cũ. Giờ cả họ biết mình nợ. Ai có kinh nghiệm thoát nợ chỉ với 🙏', ...reactions(2500) });

  // Bài thường ngày (không trùng) xen quảng cáo app vay.
  const pool = [...DAILY];
  const count = 6;
  for (let i = 0; i < count && pool.length > 0; i++) {
    const t = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
    posts.push({ ...t(rng), ...reactions(1200) });
    if (i === 1) posts.push({ author: 'VAY LIỀN 5S', text: pick(rng, LOAN_ADS), sponsored: true, likes: Math.round(rng() * 40), comments: 0 });
  }
  return posts;
}

/** Số lượt thích dạng "1,2K". */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1).replace('.', ',') : Math.round(k)}K`;
}
