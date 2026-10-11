# Kế hoạch v0.2 — "Sài Gòn thật hơn, chơi đã hơn"

Cập nhật: 2026-10-10. v0.1 = M0–M4 (khu Trung Tâm, Hồi 1, xe máy, Độ Nóng, điện thoại, âm thanh, bản demo itch.io).
Tài liệu này chốt hướng v0.2 theo các lựa chọn của chủ dự án, chia thành các PR nhỏ merge dần vào `main`.

**Tiến độ:**
- [x] N1 nền tảng asset + font (PR #16);
- [x] N2.1 bảng hiệu, N2.2 nhà ống (chuồng cọp, đồ phơi, mái tôn, giá bồn nước) (PR #17);
- [x] N2.3 tầng trệt (nội thất giả, cửa cuốn theo giờ), N2.4 phố đông (dây điện rẽ vào nhà, quán cóc, xe đẩy),
  N2.5 hẻm (biển số hẻm, đồng hồ điện, mái bạt, bàn thờ thiên, chậu kiểng);
- [x] N2.6 đêm Sài Gòn (bloom theo mức chất lượng, bảng LED chạy chữ, đèn tiệm hắt ra vỉa hè, phản chiếu trên đường ướt);
- [x] N3.1 nhân vật có xương (Mesh2Motion CC0: 11 mẫu người, 43 động tác) — PR #20;
- [x] N3.2 Tín: đứng / đi / chạy / nhảy / lái xe, mở điện thoại thì áp máy lên tai (lên–xuống xe, cầm đồ để N5–N6);
- [x] N3.3 người đi đường gần camera là nhân vật có xương (3/6/10 người theo sức máy), xa vẫn khối hộp; người ngồi quán cóc,
  người bán xe đẩy (đông vắng theo giờ). Mẫu xa nướng động tác vào texture (VAT) để sau nếu cần;
- [x] N4.1 HUD: hàng thông báo góc dưới trái (tối đa 3, không đè), bảng phím thu gọn (F1), thanh máu / giáp, 5 ô sao;
- [x] N4.2 điện thoại cầm tay "Sầu Riêng S9": màn hình chính 8 app (thêm Ngân hàng, Phây, Camera chụp ảnh), thông báo trượt xuống;
- [x] N4.3 balo (phím I): 12 ô xếp chồng, nâng cấp 16 / 24 ô, dùng đồ ăn / thuốc hồi máu, vứt đồ; lưu cùng bản lưu;
- [x] N4.4 vòng chọn đồ (giữ Tab: game chậm 30 %, rê chuột chọn; phím 1–4), Tín cầm vũ khí (tư thế thủ), ô vũ khí trên HUD;
- [x] N5.1 cận chiến: đòn nhẹ 3 nhịp (chuột trái, có bộ đệm combo), đòn mạnh (chuột phải), dừng hình + rung camera,
  người đi đường trúng đòn / ngã / gục (nằm lại trên vỉa hè), người xung quanh bỏ chạy; vũ khí mòn dần rồi gãy.
  Vùng trúng đòn tính bằng quạt tầm + góc (thuần logic, rẻ hơn shape cast); né (Q) và đỡ đòn dời sang N5.3 (lúc có người đánh trả);
- [x] N5.2 vũ khí nhặt được (phím G: ghế nhựa ở chồng ghế quán cóc — 4 phát là vỡ; mũ bảo hiểm trên yên xe đậu, vài giờ game
  mới có lại), mỗi món có tầm / tốc độ / sát thương / độ bền / mức chảy máu riêng; máu nhẹ (giọt bắn, vết nhỏ, vũng loang
  dưới người gục, tự mờ sau 50 s), tắt được trong Cài đặt; màn hình cảnh báo 18+ lần đầu vào game (tắt máu ngay tại đó);
- [x] N5.3 người đi đường phản ứng khi thấy đánh nhau (có seed): bỏ chạy, la lên, đứng xa quay video, gọi báo công an
  (5 s, biểu tượng điện thoại trên đầu; Tín áp sát kịp thì cúp máy bỏ chạy), thanh niên xông vào đánh trả (Tín mất máu,
  gục hẳn để N5.5 — giờ còn 1 máu). Gọi báo xong ⇒ sao truy nã (đánh người 1 sao, có án mạng 2 sao, dân báo tối đa 3,
  không bị báo thêm 40 s thì hạ một sao) — công an đi tìm ở N5.4;
- [x] N5.4 công an truy nã 1–5 sao: xe công an (xe trắng, quân phục ô-liu, đèn chớp đỏ – xanh, còi hú) bám theo
  đường lớn — số xe theo sao (1/2/3/4/6), không vào hẻm; vùng tìm kiếm 60–400 m, công an thấy thì tâm vùng theo Tín,
  khuất mặt 10–60 s thì thoát (trong vùng chậm, trong hẻm nhanh); bản đồ nhỏ có chấm + nón tầm nhìn + vòng tìm kiếm;
  đứng yên / chạy chậm để công an áp sát 2 s thì bị bắt (nộp phạt, tịch thu vũ khí). Ô tô chặn đường để N7 (chưa có ô tô);
- [x] N5.5 bị bắt / bị gục kiểu GTA: game chậm lại, khung hình mất màu, chữ lớn "BỊ BẮT" / "GỤC", mờ đen rồi về
  đồn công an phường (nộp phạt ≥ 150.000 đ, tịch thu vũ khí) / trạm y tế phường (viện phí ≥ 100.000 đ, đầy máu);
  hết truy nã + Độ Nóng, nhiệm vụ / kèo đang làm thất bại; xe của Tín được đưa tới đậu cạnh; đồn và trạm có biểu tượng
  trên bản đồ. (Cảnh báo 18+ đã có từ N5.2.)
- [x] N6.1 cửa hàng vào được liền mạch: 6 lô nhà phố mặt đường gần chỗ xuất phát (tạp hoá, cơm tấm, nhà thuốc, cầm đồ,
  shop quần áo, điện thoại) — tầng trệt thành phòng thật sâu 7 m mở thẳng ra phố (sàn gạch caro, tường, trần, đèn tuýp,
  quầy + chủ tiệm trực cả đêm, kệ / đồ đạc theo nghề), có va chạm; khối nhà tách thành tầng trên + khối sau (shader mặt
  tiền thêm aBase để cửa sổ các tầng vẫn khớp); bảng hiệu riêng; HUD ghi tên tiệm; camera vào trong thì gần + thấp,
  chui dưới mái hiên. Karaoke / văn phòng Phát (chuyển cảnh mờ) để N9;
- [ ] N6.2–N10.

## 1. Rà soát v0.1 — điểm yếu cần sửa

| Mảng | Hiện trạng | Vì sao chưa "Sài Gòn" |
| --- | --- | --- |
| Nhà phố | Hộp màu phẳng, cửa sổ vẽ bằng shader, mặt tiền tầng trệt là ô đen | Nhà trống, không có hàng hoá, không có chuồng cọp / cửa sắt kéo / mái tôn |
| Bảng hiệu | 32 loại, cao 0,5 m, 1 dòng chữ, 1 font hệ thống | Bảng thật phủ hết bề ngang mặt tiền, cao tới 2 m, nhiều dòng (nghề → tên tiệm → "ĐT: 09xx"), có bảng dọc, băng rôn, LED chạy chữ |
| Đường phố | Ít dây điện, ít xe đậu, cây đa giác thô | Thiếu "mạng nhện" dây điện, hàng xe máy trên vỉa hè, ghế nhựa, xe đẩy, cây me / sao / dầu |
| Hẻm | Tường hẻm như vách container xanh | Thiếu biển số hẻm "123/45", bàn thờ ông Địa, chậu cây, đồng hồ điện, xe dựng trong nhà |
| Ban đêm | Cửa sổ sáng, đèn đường | Thiếu neon, hộp đèn, LED, ánh đèn hắt từ tiệm ra vỉa hè |
| Nhân vật | Người khối, không mặt, hoạt hoạ tay chân bằng code | Không thể đánh nhau, ngồi quán, nghe điện thoại cho thuyết phục |
| Bản đồ | 520 × 440 m, 1 khu | Chưa có Chợ Lớn, phố Tây, bờ sông kiểu Thủ Thiêm |
| HUD | Bảng phím che giữa màn hình lâu, thông báo đè giữa màn hình, điện thoại là khung chữ nhật | Không có dáng điện thoại, không có balo, không có máu / sao truy nã |

## 2. Các quyết định đã chốt (2026-10-10)

| Chủ đề | Quyết định |
| --- | --- |
| Chiến đấu | Tay không + vũ khí cận chiến (mã tấu, gậy sắt, dao bấm, côn); mua ở tiệm; tấn công được người đi đường; **có máu nhẹ, nhãn 18+** |
| Truy nã | Lực lượng **giống công an thật**, 1–5 sao kiểu GTA, đuổi bằng xe máy + ô tô, chặn đường từ 3 sao |
| Hậu quả | Kiểu GTA: bị bắt → mất một phần tiền + tịch thu vũ khí, ra đồn; bị đánh gục → tỉnh ở trạm y tế, mất viện phí; nhiệm vụ đang làm thất bại |
| Đồ hoạ | Lai: asset CC0 (Mesh2Motion, Kenney, KayKit, Poly Haven, ambientCG) + tự dựng các thứ đặc thù Sài Gòn |
| Bản đồ | Thêm 3 khu (~×4 diện tích): Chợ Lớn, phố Tây đèn neon, Bờ Sông — cần tải bản đồ theo vùng |
| Cửa hàng | 6–10 tiệm chính vào liền mạch; karaoke + văn phòng Phát chuyển cảnh |
| Balo | 12 ô xếp chồng + vòng chọn đồ (game chậm lại khi chọn) |
| Điện thoại | Cầm tay kiểu GTA V: khung máy hư cấu, màn hình chính lưới app, thông báo trượt |
| Hoạt hoạ | Người gần (Tín + 12–20 người) có xương; người xa bản nhẹ |
| Cốt truyện | Hồi 2: "Livestream Bạc Tỷ" + "Việc Nhẹ Lương Cao"; Hồi 3: "Đêm Triều Cường" (3 kết); nhánh phụ đua xe đêm với Vy. Giọng châm biếm, hài đen |
| Xe cộ | Xe tuần tra truy đuổi, ô tô lái được, giao thông đa dạng (buýt, taxi, ba gác, xích lô, xe đẩy), độ xe ở tiệm Vy |
| Mua sắm | Vũ khí cận chiến, quần áo + mũ bảo hiểm, đồ ăn hồi máu, nâng cấp đồ dùng (balo, điện thoại, phòng trọ) |
| Thiết bị | Chỉ máy tính (bàn phím + chuột) |
| Thứ tự | Nhìn trước, chơi sau |
| Asset | Chủ dự án mở mạng cho máy cloud tới các trang asset (mục 4) |

## 3. Rủi ro đã chấp nhận và cách giảm

- **Pháp lý VN:** Nghị định 147/2024 xếp game có vũ khí cận cảnh và bạo lực thực tế vào nhãn 18+. Luật 42/2024 coi mã tấu là vũ khí thô sơ. Mô phỏng công an thật có thể vướng Luật An ninh mạng (Điều 16), và Nghị định 174/2026 phạt 60–80 triệu đ cho game có nội dung vi phạm. Chủ dự án chọn nhận rủi ro này cho bản phi thương mại. Cách giảm rủi ro:
  - màn hình cảnh báo **18+** khi vào game;
  - tuỳ chọn **"Hiện máu"** trong Cài đặt;
  - gắn cờ nội dung nhạy cảm trên itch.io;
  - không dùng quốc huy, ảnh người thật hay vụ án thật; tên người, tên đơn vị, tên đường đều hư cấu;
  - không quảng bá hay kiếm tiền tại VN khi chưa hỏi luật sư.
- **Giấy phép asset:** chỉ dùng CC0, kèm `CREDITS.md` ghi nguồn từng file.
  - Không dùng Mixamo (cấm phân phối file gốc) hay Ready Player Me (đã đóng cửa 01/2026).
  - Quaternius đã đổi giấy phép sang QAL, không còn hẳn là CC0, nên tạm không dùng.
  - Không dùng CC-BY-SA hay thương hiệu thật (Honda, Vespa…).
- **Hiệu năng:** ngân sách bắt buộc cho mỗi PR:
  - < 500 lệnh vẽ;
  - ≤ 20 nhân vật có xương cùng lúc;
  - tải lần đầu ≤ 40 MB (asset ~25 MB, code ~7 MB);
  - bậc máy "yếu" vẫn ≥ 30 fps;
  - thứ gì tốn theo số lượng thì đưa vào `SCENE_BUDGETS`.
- **Phình phạm vi:** v0.2 rất lớn (khoảng 40 PR). Mỗi phần merge riêng và chơi được ngay. Trễ thì cắt theo thứ tự: nhánh đua xe → ô tô lái được → khu thứ ba (Bờ Sông dời sang v0.3, Hồi 3 cũng dời theo).

## 4. Asset — nguồn và ngân sách

**Cần mở mạng** cho máy cloud: menu môi trường ở thanh tiêu đề phiên → Edit → Network access → Allowed domains (giữ tick "Allow package managers"). Danh sách domain:
`polyhaven.com`, `api.polyhaven.com`, `dl.polyhaven.org`, `ambientcg.com`, `kenney.nl`, `github.com`, `codeload.github.com`, `objects.githubusercontent.com`.
Hướng dẫn: https://code.claude.com/docs/en/cloud-environments#network-access

| Loại | Nguồn (CC0) | Dùng cho | Ngân sách |
| --- | --- | --- | --- |
| Nhân vật + động tác | Mesh2Motion (khung xương 66 khớp; >160 động tác: đi, chạy, lái xe, ngồi, nghe điện thoại, đấm, đá, chém, trúng đòn, ngã, chết) | Tín, người đi đường, công an, đàn em | ~5 MB (1 file `anims.glb` ~30 động tác, nén meshopt) |
| Nội thất | KayKit Restaurant/Furniture Bits, Kenney Mini Market / Food / Furniture Kit | Tạp hoá, quán cơm tấm, nhà Tín, tiệm điện thoại | ~3 MB |
| Ô tô | KayKit City Builder Bits, Kenney Car Kit | Ô tô lái được, taxi, xe tuần tra, xe buýt | ~1 MB |
| Texture | Poly Haven, ambientCG: tường sơn bong tróc, vữa, mái tôn, tôn gỉ, cửa cuốn, đá mài, nhựa đường, ván gỗ | Nhà phố, mái, cửa, vỉa hè, đường | ~10 MB (1K, WebP, chỉ màu + normal + roughness) |
| Bầu trời | Poly Haven `shanghai_bund`, `kloofendal_48d_partly_cloudy_puresky` | Phản chiếu kim loại / kính / mặt nước | ~1,5 MB |
| Font | @fontsource (OFL): Oswald, Anton, Bungee, Barlow Condensed, Sriracha, Patrick Hand, Tilt Neon (đều có tiếng Việt) | Bảng hiệu, giao diện điện thoại | ~0,3 MB |
| Tự dựng bằng code (0 MB) | — | Xe máy, xích lô, ba gác, ghế nhựa, bồn nước inox, cột điện + dây, chuồng cọp, cửa sắt kéo, nón lá, gạch bông, đường ướt, bảng hiệu, vũ khí cận chiến | — |

Bản gốc tải về nằm trong `.cache/assets/` (không commit). Script `npm run assets` nén chúng ra `public/media/` và sinh `CREDITS.md`. Test kiểm tra tổng dung lượng không vượt ngân sách.

## 5. Lộ trình v0.2 — theo thứ tự "Nhìn trước, chơi sau"

Cỡ PR: S ≈ nửa ngày, M ≈ 1 ngày, L ≈ 2 ngày. Mỗi PR tuân theo quy trình hiện có:
- `npm run check` + e2e;
- xem ảnh chụp trước khi mở PR;
- CI xanh thì merge.

### N1 — Nền tảng asset (2 PR)
- **N1.1 (M) Đường ống asset:** `npm run assets` tải bản gốc vào `.cache/assets/` → nén WebP → `public/media/` (có commit) + `src/assets/manifest.ts`. GLB nén meshopt thêm vào cùng script khi có mẫu đầu tiên (N3.1).
  - Bộ tải GLB có thanh tiến độ ở màn hình tải; `CREDITS.md`; test ngân sách dung lượng.
- **N1.2 (S) Font bảng hiệu + giao diện** qua @fontsource; nạp font trước khi vẽ atlas bảng hiệu.

### N2 — Đồ hoạ Sài Gòn cho khu Trung Tâm (6 PR)
- **N2.1 (L) Bảng hiệu thật:** bộ sinh bảng hiệu có seed (thuần logic, có unit test).
  - Kiểu bảng: băng ngang phủ hết mặt tiền (1–2 m, 2–3 dòng), bảng dọc, băng rôn "KHAI TRƯƠNG / THANH LÝ / SANG NHƯỢNG", hộp đèn, LED chạy chữ ban đêm.
  - Khoảng 80 nghề với tên tiệm hư cấu và số điện thoại giả; 3–4 phong cách: alu chữ nổi, sơn tay, neon, mica.
- **N2.2 (L) Nhà ống:**
  - bề ngang 3,5–5 m, mặt tiền lởm chởm, 2–6 tầng, texture tường sơn bong tróc;
  - chuồng cọp có cây và đồ phơi; mái tôn và tum;
  - bồn nước inox trên giá sắt, ăng-ten.
- **N2.3 (M) Tầng trệt sống động:**
  - cửa sắt kéo / cửa cuốn: mở ban ngày, đóng ban đêm;
  - "nội thất giả" (interior mapping shader: kệ hàng, quầy, đèn tuýp) cho mọi tiệm không vào được, nên không còn ô đen.
- **N2.4 (M) Đường phố:**
  - dây điện bó dày trên cột bê tông có hộp điện;
  - hàng xe máy đậu vỉa hè (instanced) kèm người giữ xe;
  - ghế nhựa đỏ / xanh, xe đẩy bánh mì, xe nước mía;
  - cây me / sao / dầu dựng mới; vỉa hè gạch con sâu.
- **N2.5 (M) Hẻm:**
  - biển số hẻm "Hẻm 84/12", bàn thờ ông Địa có đèn đỏ, chậu kiểng, đồng hồ điện;
  - xe dựng trong nhà, mái hiên bạt, nền gạch bông.
- **N2.6 (M) Đêm Sài Gòn:**
  - neon, LED, hộp đèn (`addNightOnly`), ánh đèn tiệm hắt ra vỉa hè;
  - bloom theo mức chất lượng (tắt ở mức Thấp);
  - phản chiếu neon trên đường ướt.

### N3 — Nhân vật có xương (3 PR)
- **N3.1 (L) Hệ nhân vật:** nạp mẫu người + `anims.glb` (Mesh2Motion).
  - Hoà trộn động tác bằng `AnimationMixer`; bỏ root motion (Rapier điều khiển di chuyển).
  - Thay trang phục bằng atlas màu; nón lá / mũ bảo hiểm / balo gắn vào xương.
  - Bước đầu kiểm tra mẫu người: base mesh Mesh2Motion hoặc mẫu tự làm rồi rig bằng Mesh2Motion. Dự phòng: Kenney / KayKit.
- **N3.2 (M) Tín:** đứng, đi, chạy, nhảy, lên / xuống xe, lái xe (tư thế Driving), ngồi, nghe điện thoại, cầm đồ.
- **N3.3 (L) Người đi đường + bậc hình:**
  - 12–20 người gần nhất là SkinnedMesh; người xa dùng mẫu nhẹ, hoạt hoạ nướng sẵn vào texture (VAT), vẽ instanced;
  - hoạt cảnh nhỏ: ngồi ghế nhựa ăn uống, nghe điện thoại, đẩy xe, quét nhà;
  - số người theo `SCENE_BUDGETS`.

### N4 — HUD, điện thoại, balo (4 PR)
- **N4.1 (M) Làm lại HUD:**
  - thanh máu / giáp cạnh minimap, sao truy nã góc trên phải;
  - thông báo dời lên góc, xếp hàng không đè nhau;
  - bảng phím thu gọn, chuyển sang phím F1.
- **N4.2 (L) Điện thoại cầm tay:** Tín đưa máy lên góc dưới phải, khung máy hư cấu (viền, tai thỏ, nút), hình nền.
  - Màn hình chính là lưới app: Kèo, Bản đồ, Tin nhắn, Ví, Ngân hàng, Mạng xã hội (feed châm biếm), Camera, Cài đặt.
  - Thông báo trượt xuống; vẫn đi lại được khi đang mở.
- **N4.3 (M) Balo:** mô hình đồ (thuần logic, có unit test): 12 ô, xếp chồng, nâng cấp balo lớn. Phím I mở balo; dùng, vứt, xem đồ.
- **N4.4 (M) Vòng chọn đồ:** giữ Tab (game chậm 30 %): tay không, các vũ khí, đồ ăn, thuốc. Phím 1–4 chọn nhanh.

### N5 — Chiến đấu + truy nã (5 PR)
- **N5.1 (L) Cận chiến:** máu cho người chơi và NPC (thuần logic, có unit test).
  - Đòn nhẹ 3 nhịp (chuột trái), đòn mạnh (chuột phải), né (Q), đỡ / phản đòn.
  - Vùng trúng đòn bằng Rapier shape cast; dừng hình 2–10 khung, rung camera.
  - Ngã, đứng dậy, gục (động tác Death_A–D).
- **N5.2 (M) Vũ khí:** mã tấu, gậy sắt, dao bấm, côn nhị khúc, ghế nhựa và mũ bảo hiểm nhặt được. Mỗi món có tầm, tốc độ, sát thương, độ bền riêng.
  - Máu nhẹ (hạt + vệt trên đất, tự mờ), tắt được trong Cài đặt.
- **N5.3 (M) Phản ứng người đi đường:** bỏ chạy, la, quay video bằng điện thoại, đánh trả (một số).
  - Nhân chứng mất ~5 s để gọi báo, có icon điện thoại; người chơi đuổi kịp thì ngăn được.
- **N5.4 (L) Truy nã 1–5 sao — công an:**
  - vùng tìm kiếm 60 / 120 / 200 / 300 / 400 m, đặt lại tâm khi bị nhìn thấy; nón tầm nhìn trên minimap;
  - hết truy nã sau 10–60 s khuất mặt, nhanh hơn khi ở trong hẻm;
  - 1–2 sao xe máy tuần tra; 3 sao thêm ô tô và chặn đường; 4–5 sao thêm cơ động;
  - công an bắt người (còng) khi người chơi bị choáng hoặc đứng yên lâu;
  - chạy song song với Độ Nóng (đàn em của Phát) hiện có.
- **N5.5 (M) Bị bắt / bị gục:** màn hình kiểu GTA, đồn công an, trạm y tế, trừ tiền, tịch thu vũ khí, nhiệm vụ thất bại. Thêm màn hình cảnh báo 18+ khi vào game.

### N6 — Cửa hàng vào được + mua sắm (4 PR)
- **N6.1 (L) Hệ nội thất liền mạch:** phòng nông 4 × 6–10 m sau mặt tiền (mở thẳng ra phố), có va chạm, đèn riêng; chủ tiệm đứng quầy.
  - Karaoke và văn phòng Phát vào bằng chuyển cảnh mờ.
- **N6.2 (M) 7 tiệm đầu tiên:**
  - tạp hoá (đồ linh tinh, thẻ cào);
  - tiệm cầm đồ / chợ đồ cũ (vũ khí);
  - quán cơm tấm (hồi máu);
  - nhà thuốc (băng, thuốc);
  - shop quần áo + mũ bảo hiểm;
  - tiệm điện thoại (nâng cấp máy, mở app);
  - nhà Tín (lưu game, tủ đồ).
- **N6.3 (M) Giao diện mua bán + kinh tế:** giá, mặc cả nhẹ. Đổi đồ làm công an nhận ra chậm hơn; đồ ăn hồi máu theo thời gian; nâng cấp balo / điện thoại / phòng trọ.
- **N6.4 (S) Cân bằng kinh tế:** thu nhập từ kèo và nhiệm vụ so với giá đồ; unit test.

### N7 — Xe cộ (4 PR)
- **N7.1 (L) Ô tô lái được:** dùng mẫu xe CC0 (sedan, taxi, bán tải), dựa trên `motorbikePhysics`.
  - Cướp xe (kéo tài xế ra, tăng sao truy nã). Ô tô không vào được hẻm (bề ngang hẻm đã chặn sẵn).
- **N7.2 (M) Giao thông đa dạng:** ô tô / taxi / buýt chạy làn riêng trên đường lớn, ba gác, xích lô, xe đẩy (tự dựng). Mật độ theo `SCENE_BUDGETS`.
- **N7.3 (M) Xe tuần tra:** xe máy và ô tô công an (đèn chớp, còi hụ tổng hợp WebAudio) dùng chung AI đuổi theo mạng đường với `chase.ts`.
- **N7.4 (M) Độ xe ở tiệm Vy:** máy (tốc độ, tăng tốc), màu sơn, pô (tiếng máy khác), đèn LED; mua thêm xe.

### N8 — Bản đồ 3 khu (~×4) (5 PR)
- **N8.1 (L) Chia vùng + tải theo vùng:** bố cục nhiều khu (thuần logic, có unit test).
  - Dựng hình + va chạm theo ô lưới khi lại gần, giải phóng khi ra xa.
  - Giao thông / người đi bộ chỉ chạy quanh người chơi; minimap và bản đồ điện thoại hiện toàn thành phố.
  - Màn hình tải không dài hơn v0.1.
- **N8.2 (L) Chợ Cũ (kiểu Chợ Lớn):** hội quán mái cong + khoanh hương, lồng đèn, nhà phố người Hoa 2–3 tầng, bảng hiệu vẽ tay, chợ sỉ của Bà Tư.
- **N8.3 (L) Phố Tây (kiểu Bùi Viện, tên hư cấu):** neon dày đặc, quán bar, cấm xe từ 19 h, đám đông ban đêm.
- **N8.4 (L) Bờ Sông (kiểu Thủ Thiêm):** bờ kè, cầu dây văng, cao ốc dự án, phà, chung cư cũ sắp giải toả (nơi diễn ra Hồi 2b).
- **N8.5 (M) Nối khu:** cầu, đường lớn, tên đường / tên khu hư cấu trên HUD, cân lại hiệu năng toàn bản đồ.

### N9 — Cốt truyện Hồi 2–3 + nhánh phụ (6 PR)
- **N9.1 (M) Mở rộng hệ nhiệm vụ:** lựa chọn rẽ nhánh, cờ trạng thái, nhiều kết; đoạn phim ngắn (camera + hộp thoại có ảnh chân dung); feed mạng xã hội trong điện thoại.
- **N9.2 (L) Hồi 2a "Livestream Bạc Tỷ"** (5–6 nhiệm vụ):
  - Phát thuê KOL bán "kẹo detox" kèm trả góp qua app vay;
  - cú lật: Ngân là người dựng "phông bạt" cho KOL;
  - lựa chọn: "check var" trực tiếp trên sóng, hay ôm tiền.
- **N9.3 (L) Hồi 2b "Việc Nhẹ Lương Cao"** (5–6 nhiệm vụ):
  - bạn đua xe của Vy mất tích; đường dây "bắt cóc online" đặt trong chung cư cũ;
  - Ngân là mục tiêu kế tiếp; đua với thời gian để cứu.
- **N9.4 (L) Hồi 3 "Đêm Triều Cường"** (4–5 nhiệm vụ + 3 kết):
  - app gom sổ đỏ nhà trong hẻm cho dự án ven sông; Bà Tư là cổ đông ngầm;
  - đêm ngập kỷ lục (mưa + nước dâng trên phố);
  - 3 kết: giao bằng chứng cho nhà báo / nhận tiền mua chuộc / trả thù cho Bà Tư.
- **N9.5 (M) Nhánh phụ đua xe đêm với Vy:** 3–4 cuộc đua hẹn qua mạng xã hội; thắng có tiền + mở món độ xe.
- **N9.6 (M) Thoại và cân bằng:** thoại lầy lội chất Sài Gòn, thưởng / nợ theo hồi, kiểm tra cốt truyện chạy trọn từ đầu tới cuối bằng e2e.

### N10 — Hoàn thiện + phát hành v0.2 (2 PR)
- **N10.1 (M) Đo hiệu năng toàn game theo 3 bậc máy:**
  - chơi thử tự động (fuzz) với chiến đấu, truy nã và nội thất;
  - âm thanh mới: còi hụ, đánh nhau, chợ, karaoke (tổng hợp WebAudio).
- **N10.2 (S) Phát hành:**
  - màn hình ghi công (`CREDITS.md`);
  - đánh lại phiên bản theo bản phát hành: v0.1 = M0–M4, nên `package.json` → 0.2.0;
  - zip itch.io có cờ nội dung 18+; ảnh chụp mới cho README.

## 6. Phím điều khiển dự kiến (máy tính)

| Phím | Đi bộ | Trên xe |
| --- | --- | --- |
| Chuột trái / phải | đòn nhẹ / đòn mạnh | — |
| `Q` | né | — |
| `E` | tương tác (vào tiệm, mua, nhặt, nói chuyện) | — |
| `F` | lên xe / cướp xe | xuống xe |
| `Tab` (giữ) | vòng chọn đồ | vòng chọn đồ |
| `I` | balo | balo |
| `1`–`4` | chọn nhanh đồ | — |
| `P` | điện thoại | điện thoại |
| `F1` | bảng phím (trước là `Tab`) | |

## 7. Tiêu chí xong v0.2
- Ảnh chụp e2e các góc phố được người Sài Gòn nhìn ra "đúng Sài Gòn": bảng hiệu, dây điện, chuồng cọp, hàng xe máy, hẻm.
- Chơi trọn Hồi 1 → Hồi 3 (3 kết) không kẹt, e2e cốt truyện xanh.
- Đánh nhau, truy nã 5 sao, bị bắt / bị gục, mua sắm, balo, điện thoại, ô tô, độ xe chạy ổn định qua chơi thử tự động 30 phút.
- 4 khu chạy ≥ 60 fps ở bậc máy "mạnh", ≥ 30 fps ở bậc "yếu"; tải lần đầu ≤ 40 MB; < 500 lệnh vẽ.
