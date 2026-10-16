# CLAUDE.md — HẺM: Sài Gòn Không Ngủ

Game hành động thế giới mở góc nhìn thứ 3 (cảm hứng GTA V) bối cảnh một Sài Gòn hư cấu, chạy trên trình duyệt.
Thiết kế đầy đủ: `docs/gdd.md`. Đọc file đó trước khi làm tính năng mới.
**Bắt đầu phiên mới: đọc `docs/handover.md` trước** (tình trạng, PR đang mở, việc tiếp theo, bẫy đã gặp).

## Stack
- TypeScript strict · Vite 8 · Three.js r186 (`three/webgpu`, `WebGPURenderer` tự lùi về WebGL2) · Rapier (`@dimforge/rapier3d-compat`)
- Vitest (unit) · Playwright (e2e + ảnh chụp màn hình) · ESLint (typescript-eslint)
- Node ≥ 22.12, **npm ≥ 11** (npm 10.9 có lỗi `edgesOut` khi cài vitest 4; `scripts/setup.mjs` tự dùng `npx npm@11` nếu máy còn npm cũ)
- Phiên Claude trên cloud: hook `.claude/hooks/session-start.sh` cài thư viện sẵn khi mở phiên.

## Lệnh
```bash
npm start          # tự cài thư viện nếu cần (scripts/setup.mjs) rồi mở game ở http://localhost:5173
npm run dev        # như trên nhưng không mở trình duyệt (thêm ?webgl để ép WebGL2)
npm run check      # lint + typecheck + unit test — chạy trước mỗi commit
npm run build      # tsc + vite build → dist/
npm run assets     # tải asset CC0 (Poly Haven…) theo scripts/assets.mjs → nén WebP vào public/media/, sinh src/assets/manifest.ts + CREDITS.md
npm run package    # build + đóng gói release/hem-saigon-v<phiên bản>-web.zip cho itch.io (scripts/package.mjs, zip.mjs)
npm run e2e        # build, chạy preview, Playwright mở game và chụp tests/e2e/__screenshots__/
npx playwright test views      # chỉ chụp các góc nhìn khu phố
npx playwright test gameplay   # đi bộ → lên xe → chạy → cua → phanh → xuống xe
```
Debug trong console trình duyệt: `__HEM__.layout` (bố cục khu phố), `__HEM__.game`, `__HEM__.simulate(giây)`
(chạy logic không render), `__HEM__.setCamera(px,py,pz, tx,ty,tz)` (camera tự do), `__HEM__.setHour(21)` (đổi giờ).
Thêm `?gio=21` vào URL để vào game lúc 21 giờ (xem cảnh đêm), `?mua=1` để ép trời mưa; `__HEM__.setWeather('rain')`, `__HEM__.setHeat(2)` (đàn em Phát truy đuổi), `__HEM__.setWanted(3)` (công an truy nã 0–5 sao), `__HEM__.save()`. `?moi=1` = chơi lại từ đầu (xoá bản lưu). `?fps=1` hiện FPS / tỉ lệ điểm ảnh / số lệnh vẽ, `?bloom=0` tắt bloom ban đêm (so hiệu năng). `__HEM__.settings()` = cài đặt hiện tại.
Cảnh báo 18+ hiện lần đầu vào game (game đứng yên tới khi xác nhận); Playwright bỏ qua, thêm `?canhbao=1` để ép hiện.
Asset nhập ngoài: thêm dòng vào `SOURCES` (scripts/assets.mjs) rồi `npm run assets`; file nén trong `public/media/` có commit
(ngân sách `MEDIA_BUDGET` 25 MB, test `assets.test.ts` kiểm tra), bản gốc chỉ ở `.cache/assets/`. Code lấy texture bằng
`getTextures(id)` (src/assets/textures.ts) — luôn có đường lùi về vẽ thủ tục khi ảnh chưa tải được.
Hiệu năng: chi tiết nhỏ mới thì thêm tên lô vào `DETAIL_DISTANCE` (world/city/detailDistance.ts — khớp theo tiền tố, coi chừng
khớp nhầm lô khác cùng đầu tên; có unit test); khối tĩnh trong một nhóm nên dùng chung vật liệu để `mergeStaticMeshes` gộp được.
Vòng lặp mỗi khung hình KHÔNG tạo đối tượng / mảng / closure mới (dùng lại biến tạm) — rác bộ nhớ gây khựng khi trình duyệt dọn.
Hàm trả đối tượng dùng chung — đọc ngay, đừng giữ: `camera.forward()`, `lightingAt(h, out)` / `applyWeather(l, w, out)`
(`createLighting` / `createWeatherLighting` tạo `out` một lần). `Input.isDown` / `wasPressed` nhận tối đa 4 mã phím (không rest).
Game chậm lại (vòng chọn đồ 30 %, dừng hình khi trúng đòn) qua `game.tickScale(dt)` ở vòng lặp main.ts — `simulate()` không áp hệ số này.
Bước vật lý luôn qua `physics.step()` / `stepWorld()` — đừng gọi `world.step()` (Rapier 0.21 duyệt lại mọi collider, ~300 KB rác/bước).
Vật chỉ dùng ban đêm (phát sáng cộng màu, trong suốt) đăng ký `addNightOnly()` để ban ngày khỏi vẽ; vật chỉ có tác dụng
khi tối VÀ đường ướt (vệt bảng hiệu phản chiếu) đăng ký `addWetNightOnly()` — độ ướt đặt qua `setWetLevel()` (nightGlow.ts).
Vật liệu bọc `reflective()` mà bị huỷ (xe bị thay) thì gọi `unreflective()` trước khi `dispose()`.
NPC / máu đặt trên mặt đất theo `groundHeight(layout, x, z)` (layout.ts: vỉa hè, hẻm, bờ sông cao `PAD_HEIGHT`, mặt đường 0).
Vật đổ bóng KHÔNG dùng `alphaTest` (để `castShadow: false`): lượt vẽ bóng dùng chung một vật liệu bóng, vật có / không
alphaTest xen nhau làm nó tăng `version` ⇒ mọi vật đổ bóng tính lại khoá vật liệu mỗi khung (từng ăn ~16 % CPU + nửa rác bộ nhớ).
NPC có xương lấy / trả qua kho chung `NpcPool` (ai/npcBody.ts — `KeyedPool` theo mẫu người, dựng sẵn lúc tải bằng
`prebuild`; người đi bộ gần, người ngồi quán, người lái xe máy NPC gần, công an lái xe và công an đi bộ dùng chung; đàn em Phát có kho
riêng mặc đồ đen — `new NpcPool(GANG_CLOTHES)`) và ẩn bằng `showNpc(npc, false)` (tắt cả `matrixWorldAutoUpdate`):
three.js vẫn tính ma trận xương của vật đang ẩn; bộ đệm hình riêng từng ô từng phình tới hàng chục nghìn xương sau vài phút chơi.
NPC dùng bộ xương rút gọn 23 xương (assets/slimRig.ts: bỏ xương ngón tay + xương lá; clip lấy bằng `getNpcClip`, đã lọc
track của xương bị bỏ); chỉ Tín giữ đủ 66 xương (`FULL_RIG` trong characters.ts).
Ma trận instance của đám đông / đàn xe ghi thẳng vào `instanceMatrix.array` (pedestrianView `writePart`, trafficView
`writeFramed`), không qua Matrix4 / Euler: V8 đóng hộp số thực khi gọi hàm không inline được ⇒ mỗi ma trận là rác.
Mỗi lệnh vẽ tốn CPU (three.js ~15–20 µs / vật / lượt, cả lượt bóng): vật nhỏ nằm dưới / trong vật khác thì `castShadow = false`.
InstancedMesh hết bản (count = 0) thì ẩn luôn (`visible = false`): three.js vẫn tốn lệnh vẽ cho mesh 0 bản ở mọi lượt.
Pipeline biên dịch sẵn lúc tải (render/warmup.ts): `warmUpPipelines` vẽ một lần MỌI vật (kể cả đang ẩn, ngoài khung nhìn,
chỉ hiện ban đêm) + lượt bloom, rồi `gpuIdle` chờ GPU biên dịch xong. Thiếu thì vật lần đầu xuất hiện làm khựng 60–90 ms
(D3D11), lượt bloom đầu tiên lúc trời tối ~1 s, và ngay sau màn hình tải game đứng 5–8 s chờ GPU. Vật tạo muộn (chưa nằm
trong cảnh, kể cả dạng ẩn) thì đưa một mẫu vào `samples`, hoặc dựng sẵn ở dạng ẩn lúc tải (như `NpcPool.prebuild`); kiểm tra bằng cách đếm
`renderer.backend.createRenderPipeline` lúc chơi — phải bằng 0.
Thuộc tính instance tới fragment qua nội suy: số nguyên có thể thành 0,9999… ⇒ giải mã bằng ngưỡng, đừng `fract()` đúng tại số nguyên.
`material.positionNode` được gán SAU bước instancing (ghi đè cả phần dịch của instance).
Nhân vật có xương: đừng gọi `skeleton.pose()` (lưới lượng tử hoá meshopt ⇒ xương gốc lệch chỗ); động tác mới thêm vào
`ANIMATIONS` trong scripts/assets.mjs (tên trong game → tên clip gốc) rồi `npm run assets`.
Đo tư thế trong một động tác (vị trí hông khi ngồi / lái) bằng `hipIn` (ai/npcBody.ts): PropertyMixer của three.js chỉ ghi
xương khi kết quả trộn KHÁC khung trước ⇒ tự ghi tay vào xương rồi trả lại sẽ làm track tĩnh (clip nén một khoá) kẹt ở tư
thế cũ; phải trả trọng số rồi `mixer.update(0)` để mixer tự ghi lại.
Hình NPC vừa lấy từ kho có mọi trọng số động tác = 0: đặt thẳng trọng số đích lúc lấy (nearRiders, seatedPeople,
footPoliceView `fresh`) — trộn dần từ 0 thì PropertyMixer trộn cả tư thế gốc chữ T vào (dang tay vài khung hình).
Người lái xe máy (Tín và NPC) ngồi theo `RIDER_POSE` (vehicles/bikeModel.ts): ghim hông lên nửa trước yên, ngả người về
trước, IK hai đoạn (`reachArm`, player/armIk.ts) đặt cổ tay lên tay nắm ghi-đông — động tác 'drive' gốc là tư thế lái ô tô.
KHÔNG đặt `scene.environment` (IBL cho mọi điểm ảnh tốn 25–40 % thời gian vẽ): vật liệu kim loại / mặt nước cần phản chiếu
thì bọc `reflective(mat)` (world/reflections.ts); ánh sáng nền thay IBL là đèn `envFill` trong environment.ts.
Đo GPU trên máy không GPU: đổi vật liệu / đèn xong phải `await renderer.compileAsync()` rồi mới đo — three.js bỏ qua
không vẽ vật đang biên dịch shader dở (số đo sẽ "nhanh" giả).
Đo hiệu năng: `__HEM__.renderer.info.render` (lệnh vẽ, tam giác), `__HEM__.scene`, `__HEM__.camera`, `__HEM__.timings`
(thời gian từng bước dựng cảnh lúc tải), `__HEM__.hardware` (card đồ hoạ, bậc máy, ngân sách cảnh).
Dựng cảnh theo sức máy: `SCENE_BUDGETS` (hardware.ts) quyết định số xe NPC, người đi bộ (và số người đi bộ / người lái xe
máy / người lái xe truy đuổi gần vẽ bằng nhân vật có xương), số công an xuống xe đuổi bộ cùng lúc (`footPolice`),
hạt mưa, cỡ bản đồ bóng lúc tải;
thứ gì mới tốn theo số lượng thì đưa vào ngân sách đó. Playwright (navigator.webdriver) luôn dùng bậc "mạnh".
Trên máy cloud không có GPU: e2e render bằng SwiftShader (~1 fps) — chậm nhưng đúng hình. Sau mỗi thay đổi về hình ảnh,
chạy `npm run e2e` rồi **xem ảnh chụp** để tự kiểm tra trước khi mở PR.

## Quy ước
- Luôn import three qua `three/webgpu` (alias trong vite.config.ts đưa `three` → `three/webgpu`; addons dùng `three/addons/...`).
- Đơn vị: mét, giây, kg. Trục Y hướng lên. Đường lớn chạy dọc trục X.
- Vật lý chạy bước cố định 60 Hz (`FixedStepAccumulator`); không đặt logic gameplay phụ thuộc FPS.
- Ngẫu nhiên phải có seed (`createRng`) để bug tái hiện được.
- Logic thuần (không DOM/WebGL) phải có unit test trong `tests/unit/`.
- `window.__HEM__` chỉ để test/debug, không dùng trong logic game.
- Code và tên biến bằng tiếng Anh; comment, text hiển thị và tài liệu bằng tiếng Việt.
- Tên khu, đường, thương hiệu trong game đều hư cấu. Không dùng asset/nhạc có bản quyền; chỉ CC0 hoặc tự làm
  (không Mixamo, không Quaternius bản QAL); asset nhập ngoài phải ghi nguồn trong CREDITS.md. Riêng font chữ: SIL OFL 1.1
  (gói @fontsource) — ghi trong mục "Font chữ" của `scripts/credits-header.md`; bản build tự kèm CREDITS.md + giấy phép
  từng font (`scripts/licenses.mjs`); test `assets.test.ts` kiểm tra font nào trong `ui/fonts.ts` cũng có dòng ghi công.
- Chạy trình duyệt tự động (e2e, `npm run perf`, kiểm tra nhanh) luôn ở chế độ ẩn — không bật cửa sổ lên màn hình chủ dự án.
  `npm run perf` mặc định ẩn (headless kiểu mới vẫn dùng GPU thật); `PERF_WINDOW=1` mới hiện cửa sổ.
- Nội dung: v0.1 không máu; từ v0.2 cận chiến có máu nhẹ (tắt được trong Cài đặt), nhãn 18+, không súng (xem mục Rủi ro trong GDD).
- Kế hoạch đang làm: `docs/plan-v0.2.md` — làm theo thứ tự N1 → N10, mỗi mục một PR nhỏ.

## Cấu trúc
```
src/
  assets/            manifest.ts (tự sinh: texture, nhân vật, động tác), textures.ts (tải lúc vào game, getTextures),
                     characters.ts (mẫu người có xương + clip động tác Mesh2Motion CC0: createCharacter, getClip, getNpcClip),
                     slimRig (rút bộ xương NPC 66 → 23 xương + lọc track clip — có unit test),
                     outfits (trang phục nướng vào ảnh màu lúc tải, không thêm shader: công an quân phục ô-liu trên mẫu
                     `police-m` / `police-f`, đàn em đồ đen qua `createCharacter(id, h, GANG_CLOTHES)` — có unit test)
  main.ts            khởi tạo renderer, physics, khu phố, Game; vòng lặp khung hình; móc __HEM__
  game/game.ts       vòng chơi: đi bộ ⇄ lái xe, bước vật lý cố định + nội suy, camera, HUD
  core/              fixedStep, input (phím + chuột/pointer lock; khi khoá chuột, nút chuột thành mã `Mouse0` / `Mouse2`), random (seed), rect,
                     keyedPool (kho đồ dùng lại theo khoá — hình NPC có xương; có unit test)
  physics/           Rapier: physics.ts (stepWorld — bước không tạo rác), groups.ts (nhóm va chạm), staticWorld.ts (vật cản tĩnh)
  render/            renderer (WebGPU→WebGL2, tối đa 1,5× điểm ảnh), instancing.ts (InstanceBatch),
                     resolution (chất lượng tự động theo FPS: bóng đổ cách khung → hạ độ phân giải), detailCulling (chi tiết nhỏ chỉ vẽ quanh camera),
                     merge (gộp khối tĩnh cùng vật liệu: xe, nhân vật, công trình) — đều có unit test,
                     bloom (NightBloom: hậu kỳ chỉ chạy lúc tối, tắt ở mức Thấp — QualityProfile.bloom),
                     warmup (biên dịch sẵn pipeline lúc tải: revealAll có unit test, warmUpPipelines, gpuIdle)
  world/
    environment.ts   bầu trời SkyMesh + vòm trời đêm, nắng/trăng + bóng đổ bám điểm nhìn, đèn bù sáng envFill, sương; setLighting()
    reflections.ts   ảnh bầu trời (PMREM) chỉ cho vật liệu cần phản chiếu: reflective(mat)
    timeOfDay.ts     đồng hồ game + ánh sáng theo giờ (mặt trời, màu trời, sương, mức đêm) — thuần logic, có unit test
    nightGlow.ts     uniform "mức đêm" dùng chung cho mọi vật liệu phát sáng (cửa sổ, bảng hiệu, đèn đường, đèn xe) + độ ướt đường
    weather.ts       thời tiết có seed (nắng/mây/mưa rào chiều tối, đường ướt) + applyWeather() — có unit test
    rain.ts          hạt mưa quanh camera tính trên GPU (1 draw call)
    blood.ts         máu nhẹ: giọt bắn, vết / vũng loang rồi mờ (bể cố định — có unit test) + bloodView (2 InstancedMesh)
    pickupView.ts    mũ bảo hiểm trên yên xe đậu (đồ nhặt được; mũ bị lấy thì ẩn)
    city/layout.ts   BỐ CỤC thuần dữ liệu (đường, block, hẻm, lô nhà, cột điện, cây…) — có unit test
    city/locate.ts   tên địa điểm tại (x, z) cho HUD
    city/places.ts   đồn công an phường + trạm y tế phường (chỗ thả ra / tỉnh dậy) chọn theo bố cục — có unit test
    city/shops.ts    cửa hàng vào được: chọn lô + loại tiệm (SHOP_TYPES), insideShop — có unit test; dựng phòng ở
                     build/shopInteriors.ts (lô tiệm: khối tầng trên có aBase + khối tầng trệt phía sau, ở buildings.ts)
    city/materials.ts  shader TSL: mặt tiền (cửa sổ, cửa hàng + nội thất giả, cửa cuốn theo giờ…), vỉa hè, bê tông hẻm, nhựa đường
    city/signage.ts  nội dung bảng hiệu / băng rôn / câu LED (thuần logic, có unit test); signs.ts vẽ atlas
    city/hemDetails.ts  miệng hẻm, số hẻm, vị trí cửa nhà trong hẻm (thuần logic, có unit test)
    city/nightMaterials.ts  bảng LED chạy chữ, vũng đèn tiệm hắt ra vỉa hè, vệt bảng hiệu phản chiếu trên đường ướt
    city/build/*     dựng hình + va chạm từ bố cục: ground, buildings, streetProps, hems (đời sống trong hẻm), landmarks,
                     lightPools (vũng đèn đường), nightStreet (đèn tiệm + phản chiếu đường ướt)
  player/            characterBody (Rapier character controller), skinnedCharacter (nhân vật có xương: AnimationMixer,
                     mũ bảo hiểm / thùng hàng gắn vào xương; lùi về characterModel khối hộp nếu tải lỗi),
                     locomotion (trộn đứng/đi/chạy theo tốc độ — có unit test), followCamera (góc nhìn 3, chống xuyên tường),
                     armIk (IK hai đoạn: đặt cổ tay người lái lên tay nắm ghi-đông — có unit test)
  vehicles/          bikeModel (mẫu xe từ khối + tư thế người lái `RIDER_POSE`), motorbikePhysics (ray-cast vehicle),
                     motorbikeView (tay nắm `grips` xoay theo cụm lái — đích IK tay của Tín)
                     carModel (sedan / taxi / bán tải từ khối), carPhysics (bốn bánh, khoá nghiêng như xe máy — có unit test),
                     carView (thân gộp theo vật liệu, màu trong đỉnh, bốn bánh một InstancedMesh; chúi / nghiêng là hiệu ứng hình).
                     Trong game.ts xe là `Vehicle = Bike | Car` (trường `kind`); ô tô đậu: `game.cars`, chỗ đậu world/city/carSpots.ts.
                     Ô tô không vào hẻm nhờ trụ chắn miệng hẻm (hemDetails.hemBollards, nhóm va chạm CAR_BLOCK ⇄ CAR).
                     Cướp ô tô NPC: `game.carjack()` đổi xe NPC thành Car lái được (takeCar: tối đa `maxCars` thân vật lý,
                     hết chỗ thì dời chiếc xa nhất tới), `traffic.sim.respawn()` đưa chỗ đó trong đàn xe đi nơi khác
  ai/                giao thông NPC: trafficNetwork (lưới làn từ bố cục), traffic (mô phỏng thuần logic — có unit test),
                     trafficKinds (bảng loại xe: xe máy, sedan, taxi, bán tải, buýt, ba gác, xích lô, xe đẩy — kích thước,
                     sức máy, chạy sát tim đường / sát lề; xe "big" qua giao lộ theo lượt, xe nhỏ nhường),
                     trafficView (InstancedMesh cho đàn xe máy + người lái khối hộp), trafficFleetView (các loại xe còn lại, 4 lệnh vẽ;
                     mẫu ở vehicles/npcVehicleModels.ts), trafficSystem (gắn Rapier kinematic + hình),
                     nearRiders (K xe máy gần camera có người lái là nhân vật có xương lấy từ NpcPool, mũ cùng màu người lái
                     khối hộp; trafficView ẩn phần người của các xe đó — có unit test).
                     Thêm loại xe: một dòng trong VEHICLE_SPECS + mẫu khối trong npcVehicleModels + chỗ trong CAR_MIX / SLOW_MIX.
                     Đổi luật giao thông thì chạy trafficFleet.test.ts — nó đo cả đàn 150 giây (tốc độ trung bình, xe đứng ì, chồng xe)
                     pedestrians (người đi bộ vòng vỉa hè, lách vật cản, né xe; thấy đánh nhau thì bỏ chạy / la / quay video /
                     gọi báo / đánh trả; Tín bị bắt / gục thì `calmDown()` bỏ mọi cuộc gọi dở — có unit test),
                     civilians (mẫu người dùng chung cho mô phỏng + hình), pedestrianView (khối hộp instanced),
                     nearPedestrians + pedestrianLod (K người gần camera vẽ bằng nhân vật có xương, có giữ chỗ — có unit test),
                     seatedPeople (người ngồi quán cóc / người bán xe đẩy quanh camera, đông vắng theo giờ), npcBody (dựng NPC có xương + kho chung NpcPool;
                     dùi cui gắn tay phải `npc.baton`, ẩn khi trả về kho)
                     chase (xe truy đuổi theo mạng đường, mất dấu khi khuất tầm nhìn — có unit test; cấu hình CHASE cho đàn em
                     Phát, POLICE_CHASE cho công an: từ 3 sao có ô tô (`carsPerLevel`) và chốt chặn ô tô đỗ ngang đường phía
                     trước — `placeRoadblock`, chaser `mode: 'block'`; xe dừng cho người lái xuống: `mode: 'parked'`, `rider` =
                     còn người trên xe; mọi xe không ở 'chase' — chốt chặn, xe đỗ, xe bỏ lại — là vật cản cho xe NPC qua
                     `addObstacles`; số xe giới hạn theo thân Rapier dựng sẵn `chaserCapacity`, thừa thì dời xe bỏ lại xa nhất),
                     chaseSystem (thân Rapier + hình theo loại xe máy / ô tô; công an có đèn chớp đỏ – xanh; xe máy gần camera
                     có người lái có xương — `chaseSystem.riders`: công an `POLICE_RIDERS`, đàn em `GANG_RIDERS` từ kho
                     riêng `game.gangPool`; xe truy đuổi đánh số theo chỗ trong mảng nên chọn người theo `generation`),
                     hemNav (HemMap — xe truy đuổi trong hẻm: xe máy ≤ `hemSpeed`, chậm hơn Tín chạy bộ; ô tô dừng ở miệng
                     hẻm; mất dấu trong hẻm thì tới chỗ thấy Tín lần cuối rồi men theo trục hẻm ra, không xuyên nhà — có unit test),
                     footPolice (công an xuống xe đuổi bộ: xe tới gần Tín đang đi bộ thì dừng, người lái xuống — chạy 5,6 m/s,
                     chậm hơn Tín; Tín đứng yên trong tầm 1,3 m đủ 2 s thì còng = bị bắt; đánh được (130 máu, `resolveHit`),
                     bị đánh / từ 4 sao thì vung dùi cui đánh lại; Tín lên xe / mất dấu thì về xe; người lái gục thì xe bỏ lại,
                     gọi xe khác tới; số người theo ngân sách `footPolice` — có unit test), footPoliceView (hình: đúng mẫu người
                     + chiều cao như lúc lái — `pickRider` theo `generation` = id xe + 1; kho NpcPool chung với người lái),
                     patrol (xe tuần tra 'police' trong dòng xe NPC thấy Tín gây án ⇒ lên sao ngay, chính nó quay sang đuổi — có unit test)
  missions/          mission (chuỗi mục tiêu, giới hạn giờ — có unit test), jobs (kèo giao hàng có seed — có unit test),
                     director (nhiệm vụ đang chạy, bảng kèo trong điện thoại, điểm đánh dấu, HUD, trả tiền), marker
                     story (5 nhiệm vụ Hồi 1: điểm hẹn, lời thoại, trả nợ — có unit test), storyRunner
  audio/             âm thanh tổng hợp WebAudio (không file): mixer (MỘT AudioContext + âm lượng, phím M), engineSound
                     (tiếng máy theo tốc độ / ga), ambience (ồn phố, dế đêm), sfx (tiền, tin nhắn, nhiệm vụ, truy đuổi, té xe,
                     còi tuýt công an xuống xe),
                     horn, rainSound, siren (còi hú công an theo khoảng cách); soundModel (thông số âm thanh — thuần logic, có unit test).
                     Âm thanh mới nối vào mixer.bus(), KHÔNG tạo AudioContext riêng.
  ui/                HUD (địa điểm, giờ, đồng hồ tốc độ, máu / giáp, sao truy nã, bảng phím F1, hàng thông báo — toastQueue
                     có unit test), minimap (+ minimapMath có unit test)
                     phone (điện thoại "Sầu Riêng S9" cầm tay, phím P: màn hình chính + 8 app — Kèo, Bản đồ, Tin nhắn, Ví,
                     Cài đặt, Ngân hàng, Phây, Camera; phím 1–8 mở app, Backspace/Esc lùi), ageGate (cảnh báo 18+ lần đầu), outcome (màn hình BỊ BẮT / GỤC)
  systems/           wallet (tiền mặt + nợ app vay; `payable` = số trả được: ≥ `MIN_PAYMENT` hoặc đủ trả hết), inbox (tin nhắn),
                     heat (Độ Nóng + tầm nhìn),
                     economy (mức phạt khi bị bắt / viện phí / bị lục túi: phần trăm tiền mặt có sàn + trần — có unit test;
                     đổi giá, tiền công, mức phạt thì chạy economy.test.ts: mô hình chơi thử tests/unit/economySim.ts),
                     combat (đòn nhẹ / mạnh theo vũ khí, combo, quạt trúng đòn, máu → đau / ngã / gục, lượng máu bắn — có unit test),
                     pickups (đồ nhặt ngoài phố, phím G: chồng ghế nhựa quán cóc, mũ bảo hiểm trên yên xe — có unit test),
                     shopCatalog (hàng + giá từng tiệm, mặc cả, cầm đồ mua lại, nâng cấp — có unit test; giao diện ui/shopPanel, phím E),
                     carjack (cướp xe: xe nào cướp được, tầm với, chỗ tài xế bị kéo ra — có unit test; tài xế là người đi bộ
                     `pedestrians.eject()` chạy lên vỉa hè gọi báo),
                     wanted (sao truy nã công an 0–5: dân gọi báo ⇒ lên sao; đánh công an ⇒ 4 sao, giết ⇒ 5 sao —
                     `game.assaultPolice`; vùng tìm kiếm theo sao, khuất mặt đủ lâu — nhanh
                     hơn khi ra khỏi vùng / trốn trong hẻm — thì thoát; có unit test),
                     social (bảng tin "Phây" châm biếm, phản ứng theo diễn biến game — có unit test),
                     inventory (balo: ô đồ xếp chồng, dùng / vứt, nâng cấp, lưu; `healGain` = máu hồi thật, đầy máu thì 0 —
                     game không cho ăn — có unit test; giao diện ui/backpack, phím I),
                     wheel (vòng chọn đồ: danh sách ô + chọn theo hướng chuột — có unit test; ui/weaponWheel, giữ Tab),
                     save (lưu localStorage, chịu được bộ nhớ bị chặn / dữ liệu hỏng),
                     settings (cài đặt người chơi — cả tắt tiếng phím M — + bảng mức chất lượng Tự động/Thấp/Vừa/Cao; đổi
                     cài đặt từ chỗ khác app Cài đặt thì qua `changeSettings` ở main.ts để điện thoại cập nhật bản sao),
                     hardware (nhận diện card đồ hoạ / CPU / RAM → bậc máy → ngân sách dựng cảnh) — thuần logic, có unit test
                     fallGuard (lưới an toàn: rơi xuống sông / lọt khe quá lâu thì đưa lên chỗ đứng vững gần nhất — có unit test)
scripts/             setup.mjs (tự cài thư viện), assets.mjs (tải + nén asset CC0, sinh manifest + CREDITS.md), package.mjs + zip.mjs (đóng gói zip cho itch.io — zip.mjs có unit test),
                     licenses.mjs (CREDITS.md + giấy phép font đưa vào dist/ — có unit test), perf.mjs (đo fps / rác trên GPU thật, chạy ẩn)
tests/unit/          Vitest (bố cục, nhân vật, xe máy chạy trong Node với Rapier thật, giao thông NPC: traffic + trafficFleet)
tests/e2e/           Playwright: smoke, views, gameplay, traffic, dayNight, phone, weather, pedestrians, missions, chase, story, save, settings, audio, fall, backpack, combat, reactions, police, shops, car, patrol
```

Quy ước hướng: yaw = 0 nhìn về +Z; hướng (sin yaw, cos yaw); bên TRÁI là (cos yaw, −sin yaw).
Xe chạy bên phải: đi theo +X thì ở nửa +Z của đường, đi theo +Z thì ở nửa −X.
Test e2e cần tất định thì đặt `window.__HEM__.paused = true` rồi chạy game bằng `simulate(giây)`.

## Quy trình làm việc
- Mỗi phiên làm MỘT task nhỏ, kết thúc bằng một PR vào `main` (CI: lint, typecheck, test, build, e2e).
- Push lên `main` tự deploy GitHub Pages (bật Pages → Source: GitHub Actions trong Settings của repo).
- CI luôn đóng gói zip itch.io (artifact `hem-saigon-web-zip`); có secret `BUTLER_API_KEY` + biến `ITCH_TARGET` thì bản trên `main`
  tự đẩy lên itch.io. Giữ `base: './'` trong vite.config.ts — itch.io phục vụ game trong thư mục con.
- Lộ trình: M0 khung dự án → M1 thế giới + xe máy → M2 thành phố sống động → M3 nhiệm vụ + truy đuổi → M4 hoàn thiện.
