# Bàn giao dự án — HẺM: Sài Gòn Không Ngủ

Cập nhật: 2026-10-11, cuối phiên làm N4.2 → N6.3. Đọc file này trước, rồi tới `CLAUDE.md` (lệnh, quy ước, bẫy kỹ thuật),
`docs/plan-v0.2.md` (kế hoạch v0.2 chi tiết + tiến độ) và `docs/gdd.md` (thiết kế đầy đủ).

## 1. Dự án là gì

Game hành động thế giới mở góc nhìn thứ 3, cảm hứng GTA V, bối cảnh một Sài Gòn hư cấu. Chạy trên trình duyệt:
TypeScript + Three.js r186 (`three/webgpu`, shader TSL) + Rapier + Vite. Nhân vật chính là Tín, tài xế giao hàng nợ app vay.
v0.1 (M0–M4) đã xong; đang làm **v0.2 "Sài Gòn thật hơn, chơi đã hơn"** theo `docs/plan-v0.2.md` (N1 → N10).

```bash
npm start        # cài thư viện nếu cần rồi mở http://localhost:5173
npm run check    # lint + typecheck + unit test (chạy trước mỗi commit)
npm run e2e      # build + Playwright (~17 phút trên máy cloud không GPU, SwiftShader)
```

## 2. Chủ dự án đã chốt (đừng hỏi lại)

- Trả lời bằng **tiếng Việt**. Code / tên biến tiếng Anh; comment, chữ hiện trong game, tài liệu tiếng Việt.
- **"Tự merge khi CI xanh"**: PR của mình, CI xanh, đã xem ảnh chụp e2e thì tự merge (merge commit, không squash).
- Lựa chọn thiết kế v0.2:

| Hạng mục | Chốt |
| --- | --- |
| Chiến đấu | Mã tấu + máu nhẹ, nhãn 18+, tắt máu được; không súng |
| Công an | Giống công an thật (quân phục ô-liu) |
| Đồ hoạ | Lai: asset CC0 + dựng thủ tục |
| Bản đồ | Thêm 3 khu mới |
| Cửa hàng | 6–10 tiệm vào được |
| Balo | Ô đồ + vòng chọn vũ khí |
| Điện thoại | Cầm tay kiểu GTA V |
| Hoạt hoạ | Gần camera có xương, xa đơn giản |
| Cốt truyện | Cả 4 mạch; châm biếm hài đen |
| Hậu quả | Kiểu GTA |
| Ưu tiên | "Nhìn trước, chơi sau" |
| Xe cộ, mua sắm | Làm đủ cả 4 hạng mục mỗi mảng |
| Nền tảng | Chỉ máy tính |

- Quy trình: mỗi bước (Nx.y) một PR nhỏ vào `main`. Trước khi mở PR: `npm run check`, `npm run e2e`, **xem ảnh chụp**
  trong `tests/e2e/__screenshots__/` (cần ảnh cận thì viết tạm `tests/e2e/zz-probe.spec.ts`, xoá trước khi commit).
- Nhánh làm việc của phiên cloud: `claude/fervent-goldberg-zf4y8b` (phiên mới có thể được giao nhánh khác — theo nhánh
  được giao). Không push lên nhánh khác; **không force-push** (bị chặn).
- Cuối mỗi commit có hai dòng `Co-Authored-By: …` và `Claude-Session: …` theo hướng dẫn của phiên; không ghi tên model
  vào commit / PR.

## 3. Tình trạng hiện tại

### Đã merge vào `main`
| PR | Nội dung |
| --- | --- |
| #16 | N1 nền tảng asset + font |
| #17, #18, #19 | N2 đồ hoạ Sài Gòn (bảng hiệu, nhà ống, tầng trệt, phố, hẻm, đêm + bloom) |
| #20 | N3.1 nhân vật có xương (Mesh2Motion CC0) |
| #21 | N3.2 + N3.3 người đi đường có xương gần camera, quán cóc |
| #22 | N4.1 làm lại HUD |
| #23 | N4.2 điện thoại cầm tay "Sầu Riêng S9" |
| #24 | N4.3 + N4.4 balo + vòng chọn đồ (+ sửa test phone chờ đủ tin nhắn) |
| #25 | N5.1 cận chiến |
| #26 | N5.2 vũ khí nhặt được, máu nhẹ, cảnh báo 18+ |

### Đang mở: PR #27
Ban đầu chỉ là N5.3; cuối phiên toàn bộ phần đã làm được đẩy lên cùng nhánh nên **PR #27 chứa các commit sau**
(mỗi commit = một bước, e2e đầy đủ đã chạy xanh ở máy cho từng bước):

| Commit | Bước |
| --- | --- |
| `eb2478f` | N5.3 người đi đường phản ứng (la, quay video, gọi báo, đánh trả) + sao truy nã |
| `f7e5159` | N5.4 công an truy nã 1–5 sao (xe công an, vùng tìm kiếm, khuất mặt thì thoát) |
| `76577b3` | N5.5 bị bắt / bị gục kiểu GTA, đồn công an phường, trạm y tế |
| `6599553` | N6.1 cửa hàng vào được liền mạch (6 tiệm) |
| `4415930` | N6.2 + N6.3 mua bán trong tiệm, mặc cả, cầm đồ, nâng cấp, đồ ăn hồi máu từ từ |
| (cuối) | file bàn giao này |

**Việc đầu tiên của phiên mới:** xem CI của PR #27.
- Xanh: merge (`merge_pull_request`, `expectedHeadSha` = SHA đầy đủ 40 ký tự của đầu nhánh, lấy bằng `git rev-parse`).
- Đỏ: đọc log job, sửa, đẩy thêm commit.

Nếu muốn tách lại thành nhiều PR nhỏ thì làm trước khi merge (nhưng không force-push được ⇒ thực tế cứ merge một lần).

### Hệ thống mới trong phiên này (chỗ tìm code)
- **Điện thoại** `ui/phone.ts`:
  - 8 app; mạng xã hội "Phây" (`systems/social.ts`);
  - Camera chụp ảnh;
  - bản Pro (`setPro`) mua ở tiệm điện thoại.
- **Balo + vòng chọn đồ**:
  - logic: `systems/inventory.ts`, `systems/wheel.ts`;
  - giao diện: `ui/backpack.ts` (phím I), `ui/weaponWheel.ts` (giữ Tab).
- **Cận chiến**:
  - logic: `systems/combat.ts` (đòn, combo, quạt trúng đòn, lượng máu bắn);
  - `game.ts`: `startAttack` / `updateAttack`, khựng hình qua `game.tickScale(dt)`;
  - chuột: mã `Mouse0` / `Mouse2` khi khoá chuột.
- **Máu nhẹ**:
  - `world/blood.ts` + `world/bloodView.ts`;
  - vũng máu đặt theo xương hông (`NearPedestrianView.pelvisOf`).
- **Đồ nhặt** (phím G): logic `systems/pickups.ts`, hình `world/pickupView.ts` (mũ trên yên xe); chồng ghế dựng trong `build/streetProps.ts`.
- **Cảnh báo 18+**: `ui/ageGate.ts`. Playwright bỏ qua; thêm `?canhbao=1` để ép hiện.
- **Người đi đường phản ứng**:
  - `ai/pedestrians.ts`: `witness`, `startReaction`, các bộ đếm `reports`, `callsStopped`, `damageToPlayer`, `shouts`;
  - mẫu người dùng chung: `ai/civilians.ts`;
  - hình: `ai/nearPedestrians.ts` (động tác phản ứng, điện thoại cầm tay, biểu tượng gọi điện).
- **Truy nã + công an**:
  - logic sao: `systems/wanted.ts` (vùng tìm kiếm, thoát, `disguise`);
  - xe truy đuổi: `ai/chase.ts` (`ChaseConfig`: `CHASE` cho đàn em, `POLICE_CHASE` cho công an), `ai/chaseSystem.ts` (đèn chớp);
  - còi hú: `audio/siren.ts`;
  - bản đồ nhỏ: chấm + nón tầm nhìn + vòng tìm kiếm;
  - debug: `__HEM__.setWanted(n)`.
- **Bị bắt / gục**:
  - giao diện: `ui/outcome.ts`;
  - `game.ts`: `startOutcome` / `updateOutcome` / `respawnAfter`;
  - đồn / trạm: `world/city/places.ts`.
- **Cửa hàng**:
  - chọn lô + loại tiệm: `world/city/shops.ts`;
  - phòng: `build/shopInteriors.ts`;
  - lô tiệm trong `build/buildings.ts`: khối tầng trên có `aBase` + khối sau;
  - hàng + giá: `systems/shopCatalog.ts`;
  - bảng mua: `ui/shopPanel.ts` (phím E trong tiệm);
  - camera trong nhà: `CameraRig.maxHeight`.

### Số liệu kiểm tra lúc bàn giao
- Unit test: 194/194 xanh (`npm run check`).
- e2e: 24 test (mới: `combat` ×3, `reactions`, `police` ×2, `shops` ×2). Lượt đầy đủ trên bản cuối (N6.3): **24/24 xanh**
  (18,6 phút ở máy cloud). Từng bước N5.3 → N5.5 cũng đã chạy đầy đủ xanh trước đó.

## 4. Kế hoạch còn lại (theo `docs/plan-v0.2.md`)

1. **N6.4 (S) Cân bằng kinh tế**:
   - thu nhập kèo / nhiệm vụ so với giá đồ, phạt, viện phí, nợ kỳ 1 (1,5 triệu);
   - unit test mô phỏng vài giờ chơi.
2. **N7 xe cộ**:
   - N7.1 ô tô lái được (mẫu CC0; cướp xe kéo tài xế ra, tăng sao);
   - N7.2 giao thông đa dạng (ô tô, taxi, buýt, ba gác, xích lô);
   - N7.3 xe tuần tra công an: phần xe máy đã có ở N5.4, còn ô tô công an + ô tô chặn đường từ 3 sao;
   - N7.4 độ xe ở tiệm của Vy.
3. **N8 bản đồ 3 khu**:
   - N8.1 chia vùng + tải theo vùng (việc khó nhất);
   - N8.2 Chợ Cũ, N8.3 Phố Tây, N8.4 Bờ Sông;
   - N8.5 nối khu + cân hiệu năng.
4. **N9 cốt truyện Hồi 2–3** + đua xe đêm với Vy + thoại; nhà Tín (lưu game, tủ đồ); karaoke / văn phòng Phát vào bằng chuyển cảnh mờ.
5. **N10 hoàn thiện + phát hành 0.2.0** (đo hiệu năng 3 bậc máy, chơi thử tự động, ghi công, zip itch.io cờ 18+).

### Việc nhỏ đã dời lại (ghi để khỏi quên)
- **Chiến đấu**:
  - né (Q) và đỡ đòn;
  - công an đi bộ xuống xe đuổi / còng tay;
  - đánh được công an (`Wanted.raise` đã sẵn cho 4–5 sao).
- **Nhân vật**:
  - người lái xe công an / đàn em vẫn là khối hộp (chưa dùng mẫu `police-m` / `police-f` có xương);
  - thay đồ (`doiDo`) chưa đổi màu áo của Tín.
- **Thế giới**:
  - tiệm vào được mở 24/24, chưa có cửa cuốn đóng ban đêm;
  - bảng hiệu nhà thuốc có khi bị cây che.
- **Hiệu năng**: còn vài chỗ tạo đối tượng mỗi khung hình có từ trước:
  - `character.feet()` (Rapier `translation()`);
  - mảng `threats` mỗi bước vật lý;
  - chuỗi khoá trong `hud.setHeat` / `setVitals`;
  - `markerOnMap` trên bản đồ nhỏ.

## 5. Bẫy đã gặp (đọc trước khi sửa)

**Git và GitHub**
- Đẩy nhiều commit lên nhánh bằng refspec: `git push origin <sha>:refs/heads/<nhánh>`.
- `public/media/**` **không** đi qua Git LFS (`.gitattributes` đã loại trừ): CI không tải LFS, và đẩy LFS từ phiên cloud bị cấm.
- `merge_pull_request` cần `expectedHeadSha` đủ 40 ký tự; đoán SHA sẽ bị lỗi 409.

**Chạy e2e trên máy**
- **Đừng `npm run build` khi e2e đang chạy**: preview đang phục vụ `dist/`, build lại sẽ trộn mã mới vào lượt test dở.
- `pkill -f "playwright test"` tự giết luôn shell đang chạy lệnh đó. Dùng mẫu có ngoặc như `pkill -f "[p]laywright…"`.
- e2e tất định: đặt `__HEM__.paused = true` rồi `simulate(giây)`. `simulate` gọi `game.update(1/60)` thẳng, KHÔNG nhân
  `tickScale`. Nhịp màn hình kết cục đổi dt game sang giây thật bằng cách chia `timeScale`.
- HUD chỉ cập nhật trong `game.update`: đổi trạng thái lúc đang dừng thì phải `simulate(1/60)` rồi mới kiểm tra DOM.
- Test `phone` từng hỏng một lần trên CI (3 thay vì 4 tin nhắn) mà không tái hiện được. Test giờ chờ đủ tin và in
  `playTime` + hộp thư nếu thiếu — gặp lại thì đọc thông tin đó.

**Shader và đồ hoạ**
- Shader mặt tiền: biến `base` đã có (màu nền), thuộc tính độ cao khối là `baseY` / `aBase`.
- Khi thêm nhiều action cho một NPC, clip trùng tên phải nhân bản (`buildNpc` đã xử lý). Không thì trọng số các action
  ghi đè nhau.
- Đèn thật trong phòng rất tốn (ảnh hưởng mọi vật liệu): nội thất dùng `emissive` + `nightUniform` thay đèn.

**Vật lý và truy đuổi**
- Xe truy đuổi là thân Rapier kinematic: lao vào người đi bộ sẽ **hất Tín đi** (tốc độ của Tín tăng vọt) ⇒ không bao giờ
  "bị bắt". `ChaseSim` giờ phanh theo quãng đường phanh và dừng cách `STOP_GAP` = 2 m. Đừng cộng tốc độ của Tín vào tốc
  độ mục tiêu (tạo vòng lặp càng hất càng nhanh).

## 6. Trạng thái lúc kết thúc phiên
- Toàn bộ code đã commit và đẩy lên `claude/fervent-goldberg-zf4y8b` (PR #27).
- Trước khi đẩy: `npm run check` xanh (194 unit test), `npm run e2e` đầy đủ 24/24 xanh. CI của PR #27 chạy lại toàn bộ
  sau lần đẩy cuối — phiên mới kiểm tra rồi merge nếu xanh.
