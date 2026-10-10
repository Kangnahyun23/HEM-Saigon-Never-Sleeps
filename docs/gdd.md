# HẺM — Sài Gòn Không Ngủ · Game Design Doc (rút gọn)

Bản đầy đủ, có sơ đồ: https://claude.ai/code/artifact/4ddd4a85-92f7-40d5-adbc-b2126678954c · Cập nhật: 2026-10-09

## Tóm tắt
Game hành động thế giới mở góc nhìn thứ 3, cảm hứng GTA V, chạy trên trình duyệt. Người chơi lái **xe máy** xuyên phố và hẻm
của một Sài Gòn hư cấu. Hẻm là đường tắt ô tô không vào được — xe máy là lợi thế khi bị truy đuổi.

## Bối cảnh và cốt truyện
Bi hài kịch đường phố, giọng châm biếm nhưng có trái tim (gia đình, tình hàng xóm trong hẻm).

| Khu | Cảm hứng | Mở ở |
| --- | --- | --- |
| Trung Tâm | Quận 1, chợ Bến Thành, phố đi bộ | MVP |
| Chợ Cũ | Chợ Lớn, Quận 5 | Mở rộng 1 |
| Bờ Sông | Thủ Thiêm, cảng | Mở rộng 2 |
| Ngoại Ô | Khu công nghiệp, quốc lộ | Mở rộng 3 |

Nhân vật: **Tín** (24, xe ôm công nghệ, nhân vật chính) · **Ngân** (em gái, nợ học phí) · **Chú Sáu** (hủ tiếu gõ, dẫn đường hẻm) ·
**Bà Tư** (trùm chợ sỉ kiểu cũ) · **Phát "CEO"** (app cho vay siêu tốc, phản diện) · **Vy** (thợ độ xe, tay đua đêm).

1. **Hồi 1 — Cuốc xe định mệnh** (MVP): Ngân bị siết nợ; Tín chạy kèo "không hỏi han", học hẻm từ chú Sáu, lần đầu bị truy đuổi.
2. **Hồi 2 — Hai mặt trận**: Bà Tư vs Phát; chọn phe từng nhiệm vụ, thay đổi khu nào an toàn.
3. **Hồi 3 — Sài Gòn không ngủ**: phơi bày app của Phát trong đêm mưa ngập; kết thúc rẽ nhánh.

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
| Đánh tay đôi hoạt hình, không máu | Hồi 2 |
| Ô tô, radio, độ xe | Sau MVP |

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
| M4 Hoàn thiện | 3–4/11 | Instancing, LOD, sửa lỗi, âm thanh; demo lên itch.io | Đang làm: tối ưu hiệu năng (độ phân giải + bóng đổ tự động, ẩn chi tiết xa, gộp khối, bỏ rác bộ nhớ mỗi khung hình, bỏ IBL toàn cảnh, cài đặt đồ hoạ trong điện thoại, dựng cảnh theo sức máy); âm thanh tổng hợp (máy xe, phố, hiệu ứng, âm lượng); sửa lỗi từ chơi thử tự động (rơi xuống sông bị kẹt → lan can cao hơn + lưới an toàn), màn hình tải giữ tới khung hình đầu |

Cân bằng Hồi 1: kỳ trả nợ đầu 1.500.000 đ; thưởng 4 nhiệm vụ đầu + tiền mặt ban đầu = 1.400.000 đ ⇒ phải chạy thêm vài
kèo giao hàng (~40–90 nghìn/kèo, ~12 % "hàng nóng" trả gần gấp đôi nhưng bị bám đuôi).

Trễ thì cắt bớt M2 (mưa, người đi bộ), không cắt M3.

## Rủi ro
- **Pháp lý VN** (Nghị định 147/2024, dự thảo sửa đổi): không bạo lực/máu, không súng trong MVP, không sòng bài, thế lực hư cấu,
  không mô phỏng lực lượng chức năng có thật. Phát hành thương mại → hỏi luật sư.
- **IP**: không dùng tên GTA, asset Rockstar, nhạc/logo thật. Chỉ CC0 (Kenney, Quaternius) hoặc tự làm.
- **Hiệu năng**: instancing, LOD, chia chunk, ngân sách draw call.
- **Phình phạm vi**: ý mới vào backlog giai đoạn sau.
