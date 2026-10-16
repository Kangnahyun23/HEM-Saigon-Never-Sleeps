# Bàn giao dự án — HẺM: Sài Gòn Không Ngủ

Cập nhật: 2026-10-16, sau F1 — review toàn dự án rồi sửa loạt lỗi nhỏ (gameplay, hình, âm thanh, rác bộ nhớ, ghi công font; trước đó R1–R4: người lái NPC, công an, đàn em có xương; công an xuống xe đuổi bộ, đánh được công an). Đọc file này trước, rồi tới `CLAUDE.md` (lệnh, quy ước, bẫy kỹ thuật),
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
- **Chưa làm**: xe buýt dừng trạm đón khách; ô tô rẽ còn "quay quanh tâm" (buýt dài nên thấy rõ);
  đèn giao thông; xe NPC chưa né người đi bộ băng qua đường.

### N7.1 phần 2 — cướp xe (nhánh `n7.1b-cuop-xe`, tách từ nhánh N7.2)
- **Cách chơi**: ra đứng chắn đầu một ô tô con NPC ⇒ nó trườn chậm lại, bóp còi, chờ ~6 giây (`PERSON_PATIENCE`) rồi mới
  lách; trong lúc đó (hoặc khi nó chờ lượt ở ngã tư) đứng cách thân xe dưới 2 m là có gợi ý **F Cướp xe**.
- **Code**: `systems/carjack.ts` (thuần logic: `jackTarget`, `driverDoor`), `game.carjack()` + `takeCar()`,
  `TrafficSim.respawn()`, `PedestrianSim.eject()` (tài xế = người đi bộ rảnh ở xa nhất, chạy từ cửa xe lên vỉa hè —
  trường `enter` — rồi `react = 'call'`), `npcCarPaint()` (màu xe NPC, lớp hình và game dùng chung).
- **Sao truy nã** đi qua đúng đường có sẵn: tài xế gọi xong ⇒ `pedestrians.reports` ⇒ `wanted.report(1)`; đánh / áp sát
  tài xế thì cuộc gọi bị cắt. `game.carjackT` chỉ để chọn câu thông báo ("báo vụ cướp xe").
- **Bẫy**: xe bị chặn đầu KHÔNG bao giờ đứng khựng hẳn (tốc độ = khoảng hở × 0,9 ⇒ giảm theo hàm mũ): đừng viết điều
  kiện "tốc độ = 0"; gợi ý ẩn đi thì chữ cũ vẫn còn trong thẻ `.hud-prompt` — test đọc `.hud-prompt:not(.hidden)`.
- **Chưa làm**: động tác mở cửa / lôi tài xế (hiện đổi chỗ tức thì); cướp xe máy NPC; người đi đường chứng kiến chưa phản
  ứng (chỉ tài xế gọi báo); xe cướp được không lưu vào bản lưu.

### N7.3 — xe tuần tra (nhánh `n7.3-xe-tuan-tra`, tách từ nhánh `n7.1b-cuop-xe`)
- **Xe tuần tra trong dòng xe**: loại `police` trong `trafficKinds.ts` (một chỗ trong `CAR_MIX`, mẫu khối taxi + đèn trên mui
  ở `npcVehicleModels.ts`). `ai/patrol.ts` → `patrolWitness()` tìm xe tuần tra gần nhất thấy chỗ gây án (45 m, `SightGrid`).
  `game.patrolSees()` gọi sau `pedestrians.witness` (đánh người) và trong `carjack()`: `wanted.report` ngay, rồi
  `police.sim.spawnAt(...)` đúng chỗ chiếc đó và `traffic.sim.respawn(i)` cho chỗ của nó trong dòng xe.
- **Ô tô trong đoàn truy đuổi**: `Chaser.kind` ('bike' | 'car'), `POLICE_CHASE.car` (tốc độ, tăng tốc, góc cua, bán kính),
  `carsPerLevel`. `perLevel` vẫn là TỔNG số xe đuổi; xe chốt chặn không tính vào đó.
- **Chốt chặn**: `ChaseSim.placeRoadblock(player)` cần `dirX/dirZ` (game truyền hướng đầu xe, lùi thì ngược lại). Chọn làn
  thẳng hàng hướng chạy ở ~140 m phía trước, xe đỗ vuông góc, `mode: 'block'` đứng yên tới khi Tín vượt 25 m / hết 45 giây /
  tụt dưới 3 sao. `chaseSystem.addObstacles()` đưa chốt vào vật cản của xe NPC.
- **Hình**: ô tô công an vẽ bằng `TrafficFleetView` (kind 'police'); `update(..., count)` ẩn chỗ thừa. Đèn chớp dùng `LIGHT_BAR` theo loại.
- **Chưa làm**: còi hú riêng cho ô tô (dùng chung `siren`); công an xuống xe đi bộ; ô tô công an húc / ép xe Tín;
  xe tuần tra chỉ "thấy" lúc gây án (chưa nhận ra Tín đang bị truy nã khi chạy ngang).

### P1 — tối ưu hiệu năng (nhánh `perf-1-toi-uu`, tách từ nhánh `n7.3-xe-tuan-tra`)
Chủ dự án báo máy RTX 3060 Laptop vẫn lag (2026-10-14). Đo bằng Chrome thật (WebGPU), 2560×1600, không khoá vsync
(`npm run perf`, scripts/perf.mjs). Game nghẽn **CPU** (luồng JS), không phải GPU: hạ độ phân giải còn nửa mà fps không đổi.
- **Nguyên nhân chính — game chậm dần theo thời gian chơi**: mỗi ô LOD (người đi bộ gần, người ngồi quán) giữ bộ đệm hình
  riêng theo kiểu người + động tác, không bao giờ giải phóng; hình ẩn vẫn bị three.js tính ma trận xương mỗi khung. Sau 90 giây
  chạy xe: 228 nhân vật có xương (213 ẩn), 15 048 xương, 16 318 vật thể — còn tăng mãi. Sửa: kho dùng chung `KeyedPool`
  + `showNpc()` (ẩn thì tắt `matrixWorldAutoUpdate`) ⇒ có trần (~100 hình, hình ẩn không tốn CPU).
- **Bóng lan can (alphaTest)**: three.js tính lại khoá vật liệu của ~87 vật / khung trong lượt bóng (16 % CPU, hơn nửa rác
  bộ nhớ — xem bẫy trong CLAUDE.md). Lan can / lồng sắt thôi đổ bóng (song sắt nhỏ hơn texel bóng, chỉ là nhiễu).
- **Rác do code game mỗi khung**: closure trong `pedestrianView.update` / `trafficView.update`, `subarray` +
  `computeBoundingSphere` trong `DetailCuller` (thay bằng khối cầu bao tính sẵn), `for…of` trong `traffic.safeSpeed`.
- **Lệnh vẽ**: 7 ô tô đậu chiếm ~1/3 lệnh vẽ ⇒ bánh xe thôi đổ bóng, tầm vẽ xe đậu 170 → 110 m. Bản đồ nhỏ vẽ lại tối đa 30 lần / giây.
- **Kết quả** (fps / khung hình ms, trước → sau): chạy xe ngày 118 / 8,5 → 155 / 6,5; đêm 106 / 9,4 → 130 / 7,7; mưa đêm
  ~107 → 147; truy đuổi ~114 → 141. Rác bộ nhớ ~105 → ~40 MB/s (dọn rác 36 → 10 lần / 8 s). Khựng lớn nhất 221 → ~90 ms.
- **Còn lại**: xem P2 ngay dưới.

### P2 — hết khựng do biên dịch shader (nhánh `perf-2-toi-uu`, tách từ `main` sau PR #33)
Sau P1 fps trung bình đã ổn (130–170 không khoá vsync) nhưng vẫn khựng. Bắt từng khung > 25 ms (Chrome trace + đếm
`backend.createRenderPipeline`): gần như mọi khung khựng là `CommandBufferProxyImpl::WaitForToken` — luồng chính chờ tiến trình GPU
biên dịch shader (D3D11 / FXC chậm).
- **Đứng hình 5–8 giây ngay sau khi vào game** (có cả trên `main`): khung hình đầu gửi ~150–270 lệnh tạo pipeline, lệnh trả về
  ngay nhưng GPU biên dịch dần phía sau; màn hình tải tắt rồi khung đầu tiên cần đồng bộ mới đứng chờ. Playwright mặc định đợi
  1,5 s sau `ready` nên đo cũ không thấy — đo `rAF` thuần ngay khi `ready` mới lộ ra.
- **Vật lần đầu xuất hiện** (ô tô đậu lọt vào tầm 110 m, mẫu người mới, băng ghế ngoài tầm chi tiết…): 60–90 ms mỗi lần.
- **Lượt bloom đầu tiên lúc trời tối**: vẽ vào ảnh HDR (định dạng khác) ⇒ mọi vật cần pipeline thứ hai, ~0,9 s CPU + GPU.
- **Sửa** (`render/warmup.ts`): lúc tải `revealAll` tạm hiện mọi vật (ẩn / ngoài khung nhìn / InstancedMesh 0 bản) + mỗi mẫu người
  dân một thân (`civilianSamples` — P3 thay bằng thân dựng sẵn trong `NpcPool`), vẽ thật một lần ở 0,25× điểm ảnh (lượt chính + bóng) rồi một lượt bloom, sau đó
  `gpuIdle` chờ `queue.onSubmittedWorkDone()`. Bẫy: ShadowNode chỉ vẽ bóng một lần mỗi camera mỗi khung, mà trước vòng lặp
  hoạt ảnh khung chưa sang ⇒ lượt chính dùng `camera.clone()` để lượt bloom vẫn vẽ bóng (bóng trong bloom có pipeline riêng).
  Pipeline bóng của nhân vật có xương riêng theo từng mẫu người. `compileAsync` thử rồi: chậm hơn (11,6 s so với 9,5 s) và không làm lượt bóng.
- **Thời gian tải**: hồ sơ Chrome mới ~11 s (biên dịch ~7,5 s), lần sau Chrome đã lưu shader ~6 s. Trước: ~2,4 s rồi đứng 5–8 s.
- **Lệnh vẽ**: InstancedMesh hết bản thì ẩn (đàn em / công an lúc không truy đuổi: ~20 lệnh vẽ, đèn chớp, mũ trên yên);
  bốn bánh ô tô một InstancedMesh (~8 → ~5 lệnh vẽ / xe, chỉ ghi lại bộ đệm khi bánh đổi).
- **Kết quả** (`npm run perf`, trước → sau): khựng (> 33 ms / 8 s) chạy xe đêm 3 → 0–1, mưa đêm 3 → 0, khung lâu nhất
  đêm 90 → 16–36 ms; fps chạy xe ngày 154 → 167, đêm 129 → 143–158. Lúc chơi không còn tạo pipeline nào (ngày, đêm, mưa, đàn em,
  công an 3 sao, chuyển ngày → đêm).
- **Còn lại**: xem P3 ngay dưới.

### P3 — bớt việc CPU mỗi khung (nhánh `perf-3-toi-uu`, tách từ `main` sau PR #34)
Đo bằng `npm run perf` + hồ sơ CPU / lấy mẫu bộ nhớ theo hàm (Chrome thật, WebGPU). Sau P2 phần "logic" (mô phỏng + cập nhật
hình) còn 1–1,8 ms / khung, nhân vật có xương chiếm phần lớn (`updateMatrixWorld` của xương, `Skeleton.update`, mixer).
- **Kho NPC dùng chung** `NpcPool` (ai/npcBody.ts): một `KeyedPool` theo mẫu người cho cả người đi bộ gần lẫn người ngồi quán;
  mỗi thân có sẵn MỌI động tác NPC (`NPC_CLIPS`, nay 21 clip) nên đổi động tác không cần thân khác. Dựng sẵn lúc tải (`prebuild`,
  đủ cho số ô của hai LOD) ⇒ lúc chơi không dựng nhân vật mới nữa (trước ~10 ms + pipeline mới mỗi lần); thân ẩn được
  `revealAll` hâm nóng nên bỏ `civilianSamples`. Khựng 40–90 ms khi dịch chuyển xa (bị bắt / tỉnh dậy) hết hẳn: 0 khung > 25 ms.
- **Bộ xương rút gọn** (assets/slimRig.ts): NPC 66 → 23 xương (bỏ 40 xương ngón tay + 3 xương lá; đỉnh đang bám xương bị bỏ
  chuyển sang xương cha gần nhất còn giữ), clip lọc bỏ track tương ứng (`getNpcClip`). Tín giữ đủ xương (thấy tay gần).
- **Bớt rác do code game**: ma trận instance của đám đông / đàn xe ghi thẳng vào `instanceMatrix.array` (không qua Matrix4 /
  Euler — V8 đóng hộp số thực); `traffic.consider` đọc ứng viên từ một đối tượng dùng lại; `ChaseSim.route` dùng lại mảng
  kiểu cố định; vòng bước vật lý trong game.ts dùng lại vị trí / mối đe doạ / `runner` / danh sách vật cản; HUD so số thay
  chuỗi khoá; `characterBody.snapshot` khỏi tạo đối tượng; bản đồ nhỏ truyền `out` cho `worldToMap` / `markerOnMap`.
- **Kết quả** (fps trước → sau, không khoá vsync, 2560×1600): đứng yên ban ngày 192 → 194; chạy xe ngày 168 → 210; đêm
  109 → 164–180; mưa đêm 133 → 163; truy đuổi 144 → 164–174 (một lượt 135 — cảnh này dao động mạnh). Logic 1,0–1,8 → 0,7–1,0 ms.
  Rác ~38 → ~35 MB/s, dọn rác ~0,5 % CPU.
- **Còn lại**: rác ~35 MB/s phần lớn nằm trong three.js (danh sách vẽ, cập nhật uniform, `writeBuffer`); `traffic.step` /
  `safeSpeed` / `pedestrians.step` còn ~4,7 MB/s (số thực bị đóng hộp). Chưa đáng sửa — dọn rác không còn gây khựng.

### R1 — người lái xe máy NPC là nhân vật có xương (nhánh `r1-nguoi-lai-xe`, tách từ `perf-3-toi-uu`)
Chủ dự án muốn người lái xe trông giống người đi đường (trước đây cả đàn xe máy NPC chở người khối hộp).
- **LOD như người đi bộ** (`ai/nearRiders.ts` — `NearRiderView`): K xe máy gần camera nhất trong 35 m (`PedestrianLod`, giữ
  chỗ 3 m; chỉ xét `sim.bikes` xe đầu của mảng — xe máy) chở người lái có xương lấy từ `NpcPool` (cùng mẫu người dân, cùng kho
  với người đi bộ / người ngồi quán; kho dựng sẵn thêm cho đủ). `TrafficView.update(…, skinned)` bỏ phần người lái khối hộp
  của đúng các xe đó (cờ `rider` trên từng phần; hàng chở vẫn vẽ). Số người theo sức máy `SCENE_BUDGETS.nearRiders`
  (yếu 0, vừa 3, mạnh 5). Mẫu người chọn theo seed `id` + `generation` của xe; màu mũ = màu mũ khối hộp (`bikeLook`) nên
  xe chạy ra xa đổi sang khối hộp không đổi màu mũ.
- **Mũ bảo hiểm NPC**: mỗi thân trong kho có sẵn một mũ (nửa cầu + kính, một lệnh vẽ, không đổ bóng, vật liệu riêng để đổi
  màu) gắn xương đầu, mặc định ẩn — `revealAll` hâm nóng cùng thân nên lúc chơi không tạo pipeline.
- **Tư thế ngồi chung cho Tín và NPC** (`RIDER_POSE` trong vehicles/bikeModel.ts): động tác 'drive' (Mesh2Motion) là tư thế
  lái ô tô — hông lùi ~0,35 m sau gốc nhân vật, tay ôm vô-lăng trước ngực ⇒ đo vị trí hông thật trong động tác (`hipIn`),
  ghim hông lên nửa trước yên, ngả người 0,18 rad quanh hông, rồi **IK hai đoạn** (`player/armIk.ts` — `reachArm`: định lý
  cos + điểm cực cho khuỷu, ghi góc tuyệt đối) đặt cổ tay lên tay nắm ghi-đông. Tín: tay nắm là `MotorbikeView.grips` (xoay
  theo cụm lái), trước IK trả 6 xương tay về tư thế lái; NPC: tay nắm tính từ khung xe (xe NPC không bẻ lái), clip 'drive'
  có track tay đổi theo thời gian nên bộ trộn tự ghi lại tay mỗi khung (IK không cộng dồn).
- Kiểm tra: lúc chơi 0 pipeline mới; e2e gameplay / traffic / pedestrians xanh, ảnh chụp người lái gần và Tín trên xe
  đúng chỗ ngồi, hai tay trên ghi-đông. Chi phí 5 người lái (bật / tắt xen kẽ 16 lượt trong cùng trang, lấy trung vị):
  +11 lệnh vẽ, +0,2 ms logic mỗi khung (mixer + IK), fps / thời gian vẽ CPU không đổi trong sai số. Lúc đo máy đang chạy
  một game khác nên chưa đo lại bảng `npm run perf` — đo lại khi máy rảnh.

### R2 — công an / đàn em lái xe truy đuổi là nhân vật có xương (nhánh `r2-cong-an-co-xuong`, tách từ `r1-nguoi-lai-xe`)
- `ChaseSystem.riders` = một `NearRiderView` (như R1) cho các xe máy truy đuổi gần camera: công an dùng mẫu `police-m` /
  `police-f` (`POLICE_RIDERS`, kho chung `npcPool`), đàn em dùng `man-shirt` / `man-polo` (`GANG_RIDERS`) từ kho riêng
  `game.gangPool` mặc đồ đen. Mũ theo phe (công an xanh rêu, đàn em đỏ — `bikeLook`). Ngân sách mỗi phe
  `SCENE_BUDGETS.chaseRiders` (yếu 0, vừa 2, mạnh 3); dựng sẵn mỗi mẫu đủ `chaseRiders` thân.
- Xe truy đuổi đánh số theo chỗ trong mảng `chasers` (đổi khi có xe biến mất) ⇒ `byGeneration`: chọn người lái chỉ theo
  `generation` (= id xe + 1, duy nhất) — xe đổi chỗ không đổi mặt người lái.
- **Trang phục** (`assets/outfits.ts`): mẫu công an CC0 mặc đồng phục xanh đen kiểu Mỹ ⇒ đổi sang quân phục ô-liu bằng cách
  nướng thẳng vào ảnh màu lúc tải (canvas → `recolor` → `CanvasTexture`; không thêm shader nên không thêm pipeline). Đổi mọi
  chỗ "không phải da" (đỏ trội hơn hẳn xanh dương ⇒ da / tóc nâu giữ), độ sáng lấy căn bậc hai cho nếp vải dịu. Bẫy: mặt nạ
  "xanh dương trội" làm quân phục loang lổ như áo rằn ri — ảnh gốc nén thành ô 8×8 lệch sắc chút ít, mặt nạ hẹp bật / tắt
  theo từng ô. Đàn em: cùng cách, màu đen, chỉ mẫu không có áo đỏ / quần kaki (gần màu da, không nhuộm được).
  Thử nhanh trên ảnh: `recolorlab.mjs` (thư mục tạm của phiên) đọc ảnh màu đã xuất, ghi ảnh đã đổi màu.
- Kiểm tra: ngày / đêm, công an 2 sao + đàn em Độ Nóng 2 áp sát — 0 pipeline mới lúc chơi.

### R4 — xe truy đuổi chậm lại trong hẻm (nhánh `r4-hem-cham`, tách từ `r2-cong-an-co-xuong`)
- Chủ dự án: "vào hẻm mà công an đuổi nhanh như ngoài đường thì game khó quá". `ai/hemNav.ts` (`HemMap`, dựng một lần
  trong game.ts từ `layout.hems` + lô nhà, đưa vào cả hai `ChaseSystem`):
  - xe máy trong hẻm không quá `ChaseConfig.hemSpeed` = 5 m/s (Tín chạy bộ 6,4 m/s) và phanh kịp trước miệng hẻm
    (`hemCap`: quãng đường tới hẻm dọc đường đi `HemMap.entry`);
  - ô tô dừng trước miệng hẻm (khớp trụ chắn `hemBollards`), có chốt chặn cứng: bước tới mà lọt vào hẻm thì đứng lại;
  - xe trong hẻm mà mất dấu Tín: tới chỗ thấy Tín lần cuối (`Chaser.lastX/lastZ/lastSeen`, nhớ 4 s), rồi men theo trục
    hẻm ra đầu thông (`HemMap.exit` — đầu cụt nhận ra bằng lô nhà ngay sau đầu hẻm). Trước đây xe đuổi theo vào hẻm rồi
    mất dấu là lao thẳng về giao lộ gần nhất, xuyên qua nhà.
- Xe trên đường lớn vẫn không tự tìm vào hẻm (chỉ theo vào khi thấy Tín) ⇒ chui hẻm khuất mặt vẫn là cách cắt đuôi.
- Kiểm tra: `hemNav.test.ts` (8 test; tắt HemMap thì 5 test truy đuổi đỏ), e2e `police` thêm test "công an đuổi vào
  hẻm" (ảnh `police-hem.png`).

### R3 — đánh được công an: công an xuống xe đuổi bộ (nhánh `r3-danh-cong-an`, tách từ `r4-hem-cham`)
- Chủ dự án: "làm thêm chức năng có thể tấn công cả công an". `ai/footPolice.ts` (`FootPoliceSim`, thuần logic, có seed):
  - xe công an (xe máy, ô tô) đang đuổi mà cách Tín đang đi bộ < 9 m, thấy Tín ⇒ `ChaseSim.park` (chaser `mode: 'parked'`:
    phanh dần rồi đứng lại); xe đứng hẳn thì người lái xuống bên trái xe (`rider = false` ⇒ xe vẽ không người lái —
    `BikePose.riderless`);
  - công an chạy 5,6 m/s (Tín 6,4 m/s ⇒ chạy là thoát); áp sát Tín đứng yên / đi chậm (< 2 m/s) trong 1,3 m đủ 2 s ⇒ còng
    tay = bị bắt (màn hình BỊ BẮT như cũ). HUD: "Công an xuống xe!" kèm còi tuýt (`sfx 'whistle'`), "nắm tay rồi — chạy ngay!";
  - đánh được: 130 máu (người đi đường 100), trúng đòn qua `resolveHit` như người đi đường; đánh công an ⇒ 4 sao, giết ⇒
    5 sao (`game.assaultPolice`); đã bị đánh (hoặc từ 4 sao) thì công an vung dùi cui đánh lại: 8 máu mỗi cú, nghỉ 1,2–1,8 s;
  - Tín lên xe / hết sao / mất dấu 5 s ⇒ công an chạy về xe (Tín không còn thấy thì "lên xe" luôn), xe đuổi tiếp;
  - người lái gục ⇒ xe bỏ lại bên đường (`leaving`, đứng yên), đoàn truy đuổi gọi xe khác tới; xác nằm lại tối đa 2,
    dọn khi khuất mặt Tín.
- Số người xuống xe cùng lúc theo sức máy: `SCENE_BUDGETS.footPolice` (yếu 2, vừa 3, mạnh 4); 0 chỗ (hoặc mẫu công an chưa
  tải được) thì xe tự bắt như trước. Hình (`ai/footPoliceView.ts`): đúng người + chiều cao như lúc lái (`pickRider` theo
  `generation`), xuống từ xe máy thì vẫn đội mũ, tay phải cầm dùi cui (`npc.baton`, npcBody); động tác chạy / thủ thế / nắm
  tay / vung dùi cui (`slashA`) / trúng đòn / ngã / gục. Dùng chung kho NpcPool với người lái (dựng sẵn thêm `footPolice` thân).
- Kiểm tra: `footPolice.test.ts` (7 test), e2e `police` thêm test "đánh công an" (ảnh `police-foot.png`,
  `police-fight.png`); e2e `patrol` đếm cả xe đang đậu cho người lái xuống. Lúc chơi 0 pipeline mới.

### F1 — sửa lỗi nhỏ sau review (nhánh `f1-sua-loi-nho`, tách từ `main` sau PR #40)
Chủ dự án nhờ review kỹ toàn dự án rồi "sửa các lỗi nhỏ"; lỗi về bản lưu để PR sau (xem "Việc nhỏ đã dời lại").
- **Lỗi R3**: xe công an bỏ lại / đỗ giữa đường là vật cản cho xe NPC (`ChaseSim.addObstacles` — mọi xe không ở chế độ
  'chase'); công an đi bộ + vũng máu đúng cao độ mặt đất (`groundHeight(layout, x, z)` trong layout.ts: vỉa hè / hẻm / bờ
  sông 0,15 m, mặt đường 0); xe bị bỏ lại quá nhiều thì dời bớt chiếc xa nhất (`chaserCapacity` + `trim`) — trước đây vượt
  số thân Rapier dựng sẵn thì xe "tàng hình" (không hình, không va chạm).
- **Gameplay**: té xe văng theo tốc độ ngay trước cú va (`MotorbikePhysics.impactSpeed`); đầy máu thì không ăn (`healGain`,
  khỏi mất đồ); nút trả nợ chỉ hiện khi trả được (`payable`: ≥ 100.000 ₫ hoặc đủ trả hết); vòng chọn đồ luôn chừa ô đồ ăn
  + thuốc; bị bắt / gục thì cuộc gọi báo đang dở bỏ hết (`PedestrianSim.calmDown`), đàn em không lục túi thêm lúc đang ở
  màn hình kết cục, đóng tiệm đang mở; lên xe giữa đòn thì huỷ đòn + cú bấm nối combo.
- **Hình / âm thanh**: bảng hiệu tiệm + vũng đèn tiệm không còn biến mất ngoài 130 m (bảng tầm vẽ tách ra
  `world/city/detailDistance.ts`); xe bị thay thì vật liệu bỏ khỏi danh sách phản chiếu (`unreflective`); vệt bảng hiệu trên
  đường ướt chỉ vẽ khi tối VÀ ướt (`addWetNightOnly`, `setWetLevel`); bật bloom giữa lúc chơi thì làm nóng pipeline ngay;
  tắt tiếng (M) lưu trong cài đặt (`Settings.muted`); bản đồ trong điện thoại vẽ lại 10 lần / giây.
- **Rác bộ nhớ mỗi khung**: `lightingAt` / `applyWeather` ghi vào đối tượng có sẵn (`createLighting`,
  `createWeatherLighting`), `GameClock.label()` chỉ dựng chuỗi khi sang phút mới, `Input.isDown` / `wasPressed` bỏ tham số
  rest (tối đa 4 mã phím), `FollowCamera` dùng lại hướng + tia Rapier, `CharacterBody` dùng lại quãng đi / vị trí kế tiếp,
  game.ts dùng lại ý định đi bộ / vị trí chân / trạng thái động tác / ngữ cảnh nhiệm vụ.
- **Ghi công font**: 8 font @fontsource (SIL OFL 1.1) có mục riêng trong CREDITS.md (phần mở đầu ở
  `scripts/credits-header.md`); bản build (Pages + zip itch.io) kèm `CREDITS.md` + `licenses/<font>-OFL.txt`
  (`scripts/licenses.mjs`, plugin `hem-licenses` trong vite.config.ts).
- **`npm run perf` chạy ẩn**: không bật cửa sổ trình duyệt lên màn hình (chủ dự án thấy rất phiền). Headless kiểu mới vẫn
  dùng card đồ hoạ thật (đã kiểm tra: WebGL2 + WebGPU nhận RTX 3060); `PERF_WINDOW=1` mới hiện cửa sổ.
- Kiểm tra: unit test 330 (thêm `input`, `detailDistance`, `reflections`, `nightGlow`, `bloom`; mở rộng timeOfDay, weather,
  settings, assets, package, wheel, wallet, inventory, pedestrians, motorbikePhysics, police, footPolice, chase,
  cityLayout, blood); e2e `backpack` (đầy máu không ăn), `audio` (M lưu vào cài đặt).

## 4. Kế hoạch còn lại (theo `docs/plan-v0.2.md`)

1. ~~N6.4 cân bằng kinh tế~~ — xong (xem mục 3).
2. **N7 xe cộ**:
   - N7.1 phần 1 (ô tô đậu ven đường lái được, trụ chắn miệng hẻm) — xong, nhánh `n7.1-o-to-lai-duoc`;
     phần 2 (cướp ô tô NPC) — xong, nhánh `n7.1b-cuop-xe`; còn phần 3: thay khối hộp bằng mẫu xe CC0
     (phải thay cả xe đậu lẫn đàn xe NPC cùng lúc, không thì xe bị cướp đổi hình);
   - N7.2 giao thông đa dạng (ô tô, taxi, buýt, ba gác, xích lô, xe đẩy) — xong, nhánh `n7.2-giao-thong-da-dang`;
   - N7.3 xe tuần tra công an (xe tuần tra trong dòng xe, ô tô đuổi + chốt chặn từ 3 sao) — xong, nhánh `n7.3-xe-tuan-tra`;
   - N7.4 độ xe ở tiệm của Vy.
3. **N8 bản đồ 3 khu**:
   - N8.1 chia vùng + tải theo vùng (việc khó nhất);
   - N8.2 Chợ Cũ, N8.3 Phố Tây, N8.4 Bờ Sông;
   - N8.5 nối khu + cân hiệu năng.
4. **N9 cốt truyện Hồi 2–3** + đua xe đêm với Vy + thoại; nhà Tín (lưu game, tủ đồ); karaoke / văn phòng Phát vào bằng chuyển cảnh mờ.
5. **N10 hoàn thiện + phát hành 0.2.0** (đo hiệu năng 3 bậc máy, chơi thử tự động, ghi công, zip itch.io cờ 18+).

### Việc nhỏ đã dời lại (ghi để khỏi quên)
- **Bản lưu (PR kế tiếp, chủ dự án đã đồng ý)**:
  - bản lưu hỏng (JSON đúng nhưng trường sai kiểu) có thể làm game không vào được — cần kiểm tra từng trường như `parseSettings`;
  - lưu trong 30 giây đầu thì mất tin nhắn mở màn (nạp bản lưu bỏ tin mở màn);
  - lưu lúc đang ở màn hình BỊ BẮT / GỤC thì tải lại thoát phạt;
  - sao truy nã / Độ Nóng không được lưu (tải lại là sạch);
  - mở hai tab thì tab sau ghi đè bản lưu của tab trước.
- **Asset**: mẫu `riot.glb` (công an chống bạo động) tải lúc vào game nhưng chưa dùng — bỏ khỏi danh sách tải hoặc dùng ở 5 sao.
- **Chiến đấu**:
  - né (Q) và đỡ đòn;
  - công an đi bộ chưa có thân vật lý (Tín đi xuyên qua được; chỉ tự giãn cách nhau), chưa hiện trên bản đồ nhỏ;
  - xác công an có thể nằm đè lên chân Tín (chưa đẩy ra).
- **Nhân vật**:
  - người lái xe máy NPC có xương chưa nghiêng tay lái / chống chân khi dừng đèn đỏ;
  - công an quân phục ô-liu nhưng giày, thắt lưng cũng thành ô-liu (mặt nạ trang phục chỉ phân biệt da / không phải da);
  - thay đồ (`doiDo`) chưa đổi màu áo của Tín.
- **Thế giới**:
  - tiệm vào được mở 24/24, chưa có cửa cuốn đóng ban đêm;
  - bảng hiệu nhà thuốc có khi bị cây che.
- **Hiệu năng**: xem "Còn lại" ở mục P3 phía trên (rác còn lại chủ yếu trong three.js).

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
- Test đánh người giữa phố: xe tuần tra (N7.3) đi ngang thấy là bắt ngay ⇒ màn hình BỊ BẮT khoá điều khiển, đòn sau
  không ra. Test không kiểm tra công an thì tắt nó: `game.patrolSees = () => undefined` (xem `combat.spec.ts`).
- Tín đi bộ mà có sao: xe công an tới gần là dừng cho người lái xuống (`mode: 'parked'`, R3) ⇒ test đếm xe truy đuổi
  bằng `mode === 'chase'` sẽ thiếu xe — đếm `mode !== 'block'`.
- Trên CI (SwiftShader, 2 worker) mỗi khung hình mất 1–5 s khi cảnh nặng, và mỗi `page.evaluate` phải chờ khung đang vẽ
  ⇒ vòng `for` gọi `evaluate` hàng chục lần ăn hết vài phút. Đặt cả vòng chờ / chuỗi đòn vào TRONG một `evaluate`
  (hàm dùng lại thì gắn lên `window`, xem test "đánh công an"). Test này từng qua ở PR nhưng đỏ trên `main` (quá 400 s).
- HUD chỉ cập nhật trong `game.update`: đổi trạng thái lúc đang dừng thì phải `simulate(1/60)` rồi mới kiểm tra DOM.
- Test `phone` từng hỏng một lần trên CI (3 thay vì 4 tin nhắn) mà không tái hiện được. Test giờ chờ đủ tin và in
  `playTime` + hộp thư nếu thiếu — gặp lại thì đọc thông tin đó.
- **Không bật cửa sổ trình duyệt lên màn hình chủ dự án** (rất phiền): e2e mặc định đã ẩn — đừng thêm `--headed` /
  `headless: false`; `npm run perf` chạy ẩn. Playwright `headless: true` + `channel: 'chrome'` (Chrome 155) làm Chrome thoát
  ngay ⇒ perf.mjs truyền `--headless=new` qua `args`. Bản "headless shell" mặc định của Playwright chỉ có SwiftShader;
  headless kiểu mới (Chrome thật hoặc `channel: 'chromium'`) mới dùng GPU. Kiểm tra WebGPU trên `http://localhost`:
  `about:blank` không phải secure context nên không có `navigator.gpu`.

**Shader và đồ hoạ**
- Shader mặt tiền: biến `base` đã có (màu nền), thuộc tính độ cao khối là `baseY` / `aBase`.
- Khi thêm nhiều action cho một NPC, clip trùng tên phải nhân bản (`buildNpc` đã xử lý). Không thì trọng số các action
  ghi đè nhau.
- Đèn thật trong phòng rất tốn (ảnh hưởng mọi vật liệu): nội thất dùng `emissive` + `nightUniform` thay đèn.
- PropertyMixer của three.js chỉ ghi xương khi kết quả trộn khung này KHÁC khung trước. Ghi tay vào xương (đo tư thế, IK)
  rồi tự trả lại ⇒ track không đổi theo thời gian (clip nén một khoá: chân trong 'drive' / 'sit') kẹt ở giá trị ghi tay —
  từng làm người lái NPC "đứng" trên yên. Đo tư thế thì dùng `hipIn` (trả trọng số rồi `mixer.update(0)`); IK chạy SAU
  `mixer.update` mỗi khung và chỉ đúng nếu điểm xuất phát là tư thế của clip (Tín: trả xương về `armRest` trước IK).
- Hình NPC vừa lấy từ kho có mọi trọng số = 0; trộn dần lên thì PropertyMixer trộn cả tư thế gốc chữ T vào (công an vừa
  xuống xe dang tay). Đặt thẳng trọng số đích ở khung đầu (`fresh` trong footPoliceView; nearRiders / seatedPeople đặt lúc lấy).

**Dùng lại đối tượng (không tạo rác mỗi khung)**
- `camera.forward()`, `lightingAt(h, out)`, `applyWeather(l, w, out)` trả đối tượng DÙNG CHUNG: đọc ngay, đừng giữ qua khung sau
  (cần giữ thì chép ra). `Input.isDown` / `wasPressed` nhận tối đa 4 mã phím; nhóm dài hơn dùng `axis` / mảng hằng.
- Bảng tầm vẽ chi tiết (`detailDistance.ts`) khớp theo TIỀN TỐ tên lô: tiền tố ngắn dễ khớp nhầm (từng có `'shop-'` làm bảng
  hiệu mọi tiệm biến mất ngoài 130 m). Thêm dòng thì thêm cả test cho lô cùng đầu tên.

**Vật lý và truy đuổi**
- Xe truy đuổi là thân Rapier kinematic: không gì chặn được (xuyên tường) ⇒ đường đi phải tự tránh nhà — đường lớn theo
  nút giao lộ, trong hẻm theo `HemMap`, thấy Tín thì lao thẳng (tầm nhìn thông = không có nhà chắn).
- Xe truy đuổi là thân Rapier kinematic: lao vào người đi bộ sẽ **hất Tín đi** (tốc độ của Tín tăng vọt) ⇒ không bao giờ
  "bị bắt". `ChaseSim` giờ phanh theo quãng đường phanh và dừng cách `STOP_GAP` = 2 m. Đừng cộng tốc độ của Tín vào tốc
  độ mục tiêu (tạo vòng lặp càng hất càng nhanh).

## 6. Trạng thái lúc kết thúc phiên
- PR #28–#39 (N6.4, N7.1 phần 1–2, N7.2, N7.3, P1–P3, R1–R4) đã merge vào `main` (2026-10-15).
- CI trên `main` sau khi merge #39 đỏ: e2e "đánh công an" quá 400 s trên CI (xem mục 5, "Chạy e2e trên máy") — sửa ở
  nhánh `r3b-e2e-cong-an-nhanh` (PR #40): gom vòng chờ vào một `evaluate`, test còn ~50 s ở máy.
  Unit test: 309 (thêm `nearRiders.test.ts`, `armIk.test.ts`, `outfits.test.ts`, `hemNav.test.ts`, `footPolice.test.ts`).
- Việc chủ dự án giao 2026-10-15 (R1–R4 trong plan-v0.2.md) đã làm hết: người lái xe NPC có xương (R1), công an có xương
  (R2), đánh được công an — công an xuống xe đuổi bộ (R3), xe truy đuổi chậm lại trong hẻm (R4). Tiếp theo: N7.4–N10.
- Đo hiệu năng: `npm run perf` (bảng fps / khựng / lệnh vẽ / rác). Đo khựng thật thì đừng gói hàm của three.js giữa lúc chạy
  (V8 bỏ tối ưu ⇒ vài khung chậm giả) và đo ngay khi `ready` (khựng sau tải xảy ra trong 1,5 s chờ của Playwright).
- Máy Windows của chủ dự án: lần đầu chạy e2e phải `npx playwright install chromium`. Chạy nhiều test song song ở máy này,
  test `shops` "đi bộ vào tiệm" từng đỏ một lần (HUD chưa kịp ghi tên tiệm), chạy riêng thì xanh cả trên `main`.
  `npm run e2e` ở máy này tự chạy 8 tiến trình: mỗi lượt đỏ 2–3 test KHÁC NHAU (`missions`, `gameplay`, `phone`, `shops`, `story` —
  toàn chỗ chờ HUD / đồng hồ thật), chạy lại riêng với `--workers=2` thì xanh. Muốn lượt đầy đủ sạch ở máy: `npx playwright test --workers=2`.
