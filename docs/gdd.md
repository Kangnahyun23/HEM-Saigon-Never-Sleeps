# HẺM — Sài Gòn Không Ngủ · Game Design Doc (rút gọn)

Bản đầy đủ, có sơ đồ: https://claude.ai/code/artifact/4ddd4a85-92f7-40d5-adbc-b2126678954c · Cập nhật: 2026-10-10
Kế hoạch bản v0.2 (đồ hoạ Sài Gòn, 3 khu mới, chiến đấu, truy nã, cửa hàng, Hồi 2–3): [plan-v0.2.md](plan-v0.2.md)

## Tóm tắt
Game hành động thế giới mở góc nhìn thứ 3, cảm hứng GTA V, chạy trên trình duyệt. Người chơi lái **xe máy** xuyên phố và hẻm
của một Sài Gòn hư cấu. Hẻm là đường tắt ô tô không vào được — xe máy là lợi thế khi bị truy đuổi.

## Bối cảnh và cốt truyện
Bi hài kịch đường phố, giọng châm biếm nhưng có trái tim (gia đình, tình hàng xóm trong hẻm).

| Khu | Cảm hứng | Mở ở |
| --- | --- | --- |
| Trung Tâm | Quận 1, chợ Bến Thành, phố đi bộ | MVP |
| Chợ Cũ | Chợ Lớn, Quận 5 | v0.2 |
| Phố Tây | Bùi Viện (tên hư cấu), đèn neon | v0.2 |
| Bờ Sông | Thủ Thiêm, cảng, chung cư cũ | v0.2 |
| Ngoại Ô | Khu công nghiệp, quốc lộ | Sau v0.2 |

Nhân vật: **Tín** (24, xe ôm công nghệ, nhân vật chính) · **Ngân** (em gái, nợ học phí) · **Chú Sáu** (hủ tiếu gõ, dẫn đường hẻm) ·
**Bà Tư** (trùm chợ sỉ kiểu cũ) · **Phát "CEO"** (app cho vay siêu tốc, phản diện) · **Vy** (thợ độ xe, tay đua đêm).

1. **Hồi 1 — Cuốc xe định mệnh** (MVP): Ngân bị siết nợ; Tín chạy kèo "không hỏi han", học hẻm từ chú Sáu, lần đầu bị truy đuổi.
2. **Hồi 2 — Hai mặt trận** (v0.2): *Livestream Bạc Tỷ* (KOL bán "kẹo detox" trả góp qua app của Phát; Ngân là người dựng
   "phông bạt"; chọn "check var" trên sóng hay ôm tiền) và *Việc Nhẹ Lương Cao* (đường dây "bắt cóc online" trong chung cư cũ,
   mục tiêu kế tiếp là Ngân). Nhánh phụ: đua xe đêm với Vy.
3. **Hồi 3 — Đêm Triều Cường** (v0.2): app gom sổ đỏ nhà trong hẻm cho dự án ven sông, Bà Tư là cổ đông ngầm; đêm ngập kỷ lục;
   3 kết (nhà báo / nhận tiền / trả thù).

## Gameplay
Vòng lặp: nhận kèo trên điện thoại → chạy tới điểm hẹn → thực hiện → nhận tiền, trả nợ → nâng cấp, mở nhiệm vụ mới.

| Hệ thống | MVP |
| --- | --- |
| Xe máy arcade (nghiêng, lách, bốc đầu, chở người) | Có |
| Đi bộ, lên/xuống xe, camera góc nhìn thứ 3 | Có |
| Mạng hẻm (xe máy vào được, ô tô không) | Có |
| Độ Nóng 3 cấp (băng đối thủ đi xe máy truy đuổi; cắt đuôi trong hẻm) | Có |
| Giao thông xe máy NPC dày đặc | Cơ bản |
| Ngày đêm, mưa, ngập | Ngày đêm + mưa |
| Điện thoại (kèo, bản đồ, tin nhắn, ví) | Có |
| Cận chiến (tay không, mã tấu, gậy…), máu nhẹ tắt được, nhãn 18+ | v0.2 |
| Truy nã công an 1–5 sao, bị bắt / bị gục | v0.2 |
| Cửa hàng vào được, balo, vòng chọn đồ, mua sắm | v0.2 |
| Ô tô lái được, giao thông đa dạng, độ xe | v0.2 |
| Radio, lồng tiếng, điện thoại cảm ứng | Sau v0.2 |

## Phạm vi MVP (hạn 2026-11-04)
- Khu ~600 × 600 m: khối nhà sinh tự động, 4–6 đường lớn, mạng hẻm, một ngôi chợ làm mốc
- Xe máy + đi bộ, 40–80 xe NPC, người đi bộ cơ bản
- Độ Nóng 3 cấp; 5 nhiệm vụ Hồi 1 + kèo giao hàng lặp lại
- Ngày đêm, mưa, minimap, HUD, menu điện thoại, lưu game localStorage
- 60 fps laptop tầm trung, tải lần đầu < 30 MB, < 500 draw call

Không làm trong MVP: ô tô lái được, vũ khí, đánh tay đôi, multiplayer, lồng tiếng, radio, độ xe, khu khác.

## Tiến độ
- [x] M0 khung dự án (2026-10-09)
- [x] M1 thế giới + di chuyển: bộ sinh khu phố có hẻm, nhân vật đi bộ, camera góc nhìn 3, xe máy (2026-10-09)

## Lộ trình
| Mốc | Ngày | Nội dung | Trạng thái |
| --- | --- | --- | --- |
| M0 Khung dự án | 10–12/10 | Vite + TS + Three + Rapier, CI, Pages, Playwright screenshot, CLAUDE.md | Xong |
| M1 Thế giới + di chuyển | 13–19/10 | Sinh nhà/đường/hẻm; nhân vật đi bộ, camera; xe máy (Rapier vehicle controller) | Xong |
| M2 Thành phố sống động | 20–26/10 | Xe NPC theo làn, người đi bộ, ngày đêm, mưa; HUD, minimap, điện thoại | Xong (9/10) |
| M3 Nhiệm vụ + truy đuổi | 27/10–2/11 | Hệ thống nhiệm vụ, 5 nhiệm vụ Hồi 1, kèo lặp lại; Độ Nóng; lưu game | Xong (9/10) |
| M4 Hoàn thiện | 3–4/11 | Instancing, LOD, sửa lỗi, âm thanh; demo lên itch.io | Xong (10/10): tối ưu hiệu năng (độ phân giải + bóng đổ tự động, ẩn chi tiết xa, gộp khối, bỏ rác bộ nhớ mỗi khung hình, bỏ IBL toàn cảnh, cài đặt đồ hoạ trong điện thoại, dựng cảnh theo sức máy); âm thanh tổng hợp (máy xe, phố, hiệu ứng, âm lượng); sửa lỗi từ chơi thử tự động (rơi xuống sông bị kẹt → lan can cao hơn + lưới an toàn), màn hình tải giữ tới khung hình đầu; bản demo itch.io (`npm run package`, CI đóng gói zip, tuỳ chọn tự đẩy bằng butler) |
| v0.2 | sau M4 | Xem [plan-v0.2.md](plan-v0.2.md): N1 asset → N2 đồ hoạ Sài Gòn → N3 nhân vật có xương → N4 HUD/điện thoại/balo → N5 chiến đấu + truy nã → N6 cửa hàng → N7 xe cộ → N8 bản đồ 3 khu → N9 Hồi 2–3 → N10 phát hành | Đã chốt kế hoạch |

Cân bằng Hồi 1: kỳ trả nợ đầu 1.500.000 đ; thưởng 4 nhiệm vụ đầu + tiền mặt ban đầu = 1.400.000 đ ⇒ phải chạy thêm vài
kèo giao hàng (~40–90 nghìn/kèo, ~12 % "hàng nóng" trả gần gấp đôi nhưng bị bám đuôi).

Trễ thì cắt bớt M2 (mưa, người đi bộ), không cắt M3.

## Rủi ro
- **Pháp lý VN** (Nghị định 147/2024, Nghị định 174/2026, Luật 42/2024 về vũ khí thô sơ): MVP v0.1 không máu, không vũ khí.
  Từ v0.2 chủ dự án chọn cận chiến có máu nhẹ và lực lượng giống công an thật (nhãn 18+), chấp nhận rủi ro cho bản phi thương mại.
  Giảm rủi ro: màn hình cảnh báo 18+, tuỳ chọn tắt máu, cờ nội dung nhạy cảm trên itch.io, không súng, không sòng bài,
  không quốc huy / người thật / vụ án thật, mọi tên riêng hư cấu. Phát hành thương mại hoặc quảng bá ở VN → hỏi luật sư.
- **IP**: không dùng tên GTA, asset Rockstar, nhạc/logo thật. Chỉ CC0 (Mesh2Motion, Kenney, KayKit, Poly Haven, ambientCG)
  hoặc tự làm, ghi nguồn trong CREDITS.md. Quaternius đã đổi sang giấy phép QAL (cấm phân phối riêng asset) — không dùng;
  không dùng Mixamo (cấm phân phối file gốc).
- **Hiệu năng**: instancing, LOD, chia chunk, ngân sách draw call.
- **Phình phạm vi**: ý mới vào backlog giai đoạn sau.
