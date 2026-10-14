# Bàn giao dự án — HẺM: Sài Gòn Không Ngủ

Cập nhật: 2026-10-12, sau N6.4 (phiên trước: N4.2 → N6.3). Đọc file này trước, rồi tới `CLAUDE.md` (lệnh, quy ước, bẫy kỹ thuật),
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

### PR #27 (đã merge 2026-10-12)
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

### N6.4 cân bằng kinh tế (nhánh `n6.4-can-bang-kinh-te`)
- `systems/economy.ts`: mức phạt khi bị bắt / viện phí / bị lục túi (phần trăm tiền mặt, có sàn và **trần**), `game.ts` dùng chung.
- `tests/unit/economySim.ts`: mô hình chơi thử (Hồi 1 + chạy kèo, ăn uống, tai nạn, sắm đồ) chạy trên dữ liệu thật;
  `tests/unit/economy.test.ts` khoá các mốc cân bằng. Đổi giá / tiền công / mức phạt mà test đỏ thì đọc tên test để biết lệch chỗ nào.
- Đã sửa: trần phạt 400 / 250 / 150 nghìn; cà phê sữa đá 12 / 15 nghìn.
- Chưa đụng (ghi lại để cân nhắc): trả nợ qua app Ngân hàng không được tính vào kỳ đầu 1,5 triệu (nhiệm vụ 5 đòi đủ tiền mặt);
  lãi 0,3 %/ngày mới chỉ hiện chữ, chưa cộng vào nợ; giới hạn giờ của kèo rất rộng (mô phỏng không kèo nào trễ).

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
- Unit test: 210/210 xanh sau N6.4 (`npm run check`); lúc bàn giao N6.3 là 194.
- e2e: 24 test (mới: `combat` ×3, `reactions`, `police` ×2, `shops` ×2). Lượt đầy đủ trên bản cuối (N6.3): **24/24 xanh**
  (18,6 phút ở máy cloud). Từng bước N5.3 → N5.5 cũng đã chạy đầy đủ xanh trước đó.

### N7.1 phần 1 — ô tô lái được (nhánh `n7.1-o-to-lai-duoc`, tách từ nhánh N6.4)
- **Xe**: `vehicles/carModel.ts` (sedan / taxi / bán tải từ khối), `carPhysics.ts` (bốn bánh, khoá nghiêng như xe máy),
  `carView.ts`. Trong `game.ts`: `Vehicle = Bike | Car`, `game.cars`, `nearestVehicle`, `mount` / `dismount` theo `kind`.
- **Chỗ đậu**: `world/city/carSpots.ts` (có seed); số xe theo `SCENE_BUDGETS.cars` (3 / 5 / 7).
- **Trụ chắn miệng hẻm**: `hemDetails.hemBollards` + dựng ở `build/hems.ts`; collider thuộc nhóm `CAR_BLOCK`, chỉ va chạm
  với nhóm `CAR` (thân ô tô) — xe máy, người đi bộ, tia giảm xóc không đụng. Lý do: hẻm chính rộng 3,4 m, ô tô 1,8 m lọt vừa.
- **Bẫy đã gặp**: ô tô ở xa thì ẩn + bỏ đồng bộ hình (`CAR_DRAW_DISTANCE`), nhưng camera bám theo vị trí HÌNH của xe đang
  lái ⇒ xe đang lái phải luôn được đồng bộ, không thì dời xe đi xa (reset) là hình đứng yên mãi. Sau `dismount()` thì
  `this.riding` là null — đừng đọc lại trong cùng khối lệnh.
- **Chưa làm**: người lái hiện trong xe (đang ẩn Tín vì kính tối), tiếng máy ô tô riêng, hư hỏng xe, mẫu xe CC0, cướp xe.

### N7.2 — giao thông đa dạng (nhánh `n7.2-giao-thong-da-dang`, tách từ nhánh N7.1)
- **Loại xe**: `ai/trafficKinds.ts` (`VEHICLE_SPECS`: kích thước, sức máy, `position` inner / curb / spread, `big`, `avenueOnly`).
  `TrafficSim.agents` xếp xe máy trước (`sim.bikes` chiếc), rồi ô tô, rồi xe thô sơ — loại xe của mỗi chỗ cố định suốt đời
  nên thân Rapier và chỗ trong InstancedMesh chia sẵn một lần. Số lượng: `SCENE_BUDGETS.trafficCars` / `trafficSlow`.
- **Luật mới trong `traffic.ts`** (xe máy với nhau vẫn như cũ):
  - xe có vệt cố định chỉ lách vật cản đứng yên và loại xe vốn chậm hơn (`worthPassing`), giữ vệt lách tới khi đuôi xe
    qua hẳn (`agent.hold`, tính bằng mét) rồi về `home()`;
  - xe lớn (`big`) xin lượt qua giao lộ (`nodeMode` / `nodeCount`): đi thẳng + rẽ phải cùng trục đi chung, rẽ trái / quay đầu
    cần giao lộ riêng; chỉ xe đứng đầu hàng mới được xin (`firstInLine`); giữ tới khi đuôi xe ra khỏi giao lộ (`agent.leaving`);
  - xe lớn đang có lượt chỉ phanh cho xe nhỏ ngay trước mũi (`NOSE_REACH`), xe nhỏ thì bên nào cũng nhường xe lớn;
  - "nhích" khỏi chỗ kẹt (`creep`) bỏ qua xe nhỏ nhưng KHÔNG bỏ qua xe lớn.
- **Hình**: `vehicles/npcVehicleModels.ts` (khối + vai màu), `ai/trafficFleetView.ts` (hộp / trụ / đèn / vệt đèn pha).
- **Bẫy đã gặp** (mất nhiều thời gian nhất của bước này):
  - cho xe máy "nhích" xuyên qua ô tô đang chờ ở vạch ⇒ ô tô có xe nằm trong thân, không bao giờ đi được ⇒ kẹt cả phố;
  - xe đứng sau giữ lượt qua giao lộ trong khi xe trước nó (rẽ hướng khác) chưa có lượt ⇒ kẹt vĩnh viễn (vì vậy có `firstInLine`);
  - ô tô lách cả hàng xe máy đang chờ ngã tư ⇒ ô tô nằm ngang khắp lòng đường (vì vậy có `worthPassing`);
  - thử cho xe nhỏ né "khoảng trước mũi" xe lớn: xe máy rẽ trái xếp hàng ngay trước mũi ô tô, hai bên chờ nhau ⇒ tệ hơn, đã bỏ;
  - điều kiện kẹt cũ (khoảng hở phải lớn hơn 0,6 m) làm hai xe chồng sát nhau không bao giờ được nhích — lỗi có từ M2, nay đã sửa;
  - test e2e cho xe người chơi BĂNG NGANG làn xe: giao thông thả quanh người chơi nên vài giây sau khi Tín tới nơi là luôn có
    xe chạy qua, xe máy NPC 30–40 km/h không kịp phanh ⇒ xe bị tông lệch, test hỏng theo nhịp giao thông (`car.spec.ts` đã
    dính). Chờ "đường trống" không ăn thua (60 giây vẫn không có lúc nào trống 35 m) — cho xe xuất phát từ vỉa hè.
- **Số đo** (80 xe máy + 10 ô tô + 6 xe thô sơ, người chơi đứng yên giữa khu): xe máy ~29 km/h, đứng yên ~3 %; ô tô chờ ở
  ngã tư 15–30 % thời gian, lần chờ dài nhất ~35 giây. Tăng số ô tô quá ~14 là ngã tư hai đại lộ quá tải.
- **Chưa làm**: cướp xe NPC (N7.1 phần 2); xe buýt dừng trạm đón khách; ô tô rẽ còn "quay quanh tâm" (buýt dài nên thấy rõ);
  đèn giao thông; xe NPC chưa né người đi bộ băng qua đường.

## 4. Kế hoạch còn lại (theo `docs/plan-v0.2.md`)

1. ~~N6.4 cân bằng kinh tế~~ — xong (xem mục 3).
2. **N7 xe cộ**:
   - N7.1 phần 1 (ô tô đậu ven đường lái được, trụ chắn miệng hẻm) — xong, nhánh `n7.1-o-to-lai-duoc`;
     còn phần 2: cướp xe (kéo tài xế ra, tăng sao) — ô tô NPC đã có từ N7.2; thay khối hộp bằng mẫu xe CC0;
   - N7.2 giao thông đa dạng (ô tô, taxi, buýt, ba gác, xích lô, xe đẩy) — xong, nhánh `n7.2-giao-thong-da-dang`;
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
- PR #27 đã merge vào `main` (2026-10-12). N6.4 nằm trên nhánh `n6.4-can-bang-kinh-te` (PR #28, CI xanh).
- N7.1 phần 1 nằm trên nhánh `n7.1-o-to-lai-duoc`, tách từ nhánh N6.4 ⇒ merge PR #28 trước rồi mới tới PR của N7.1.
  Unit test: 225. E2E thêm `car` (2 test, 4 ảnh `car-*`). PR #29, CI xanh.
- N7.2 nằm trên nhánh `n7.2-giao-thong-da-dang`, tách từ nhánh N7.1 ⇒ thứ tự merge: #28 → #29 → PR của N7.2.
  Unit test: 245. E2E `traffic` thêm 1 test (8 ảnh `fleet-*`).
- N6.4 không đổi hình ảnh nên chỉ chạy e2e liên quan ở máy (`police`, `shops`, `chase`: xanh); lượt đầy đủ để CI chạy.
- Máy Windows của chủ dự án: lần đầu chạy e2e phải `npx playwright install chromium`. Chạy nhiều test song song ở máy này,
  test `shops` "đi bộ vào tiệm" từng đỏ một lần (HUD chưa kịp ghi tên tiệm), chạy riêng thì xanh cả trên `main`.
  `npm run e2e` ở máy này tự chạy 8 tiến trình: mỗi lượt đỏ 2–3 test KHÁC NHAU (`missions`, `gameplay`, `phone`, `shops` —
  toàn chỗ chờ HUD / đồng hồ thật), chạy lại riêng với `--workers=2` thì xanh. Muốn lượt đầy đủ sạch ở máy: `npx playwright test --workers=2`.
