# CLAUDE.md — HẺM: Sài Gòn Không Ngủ

Game hành động thế giới mở góc nhìn thứ 3 (cảm hứng GTA V) bối cảnh một Sài Gòn hư cấu, chạy trên trình duyệt.
Thiết kế đầy đủ: `docs/gdd.md`. Đọc file đó trước khi làm tính năng mới.

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
Thêm `?gio=21` vào URL để vào game lúc 21 giờ (xem cảnh đêm), `?mua=1` để ép trời mưa; `__HEM__.setWeather('rain')`, `__HEM__.setHeat(2)` (bị truy đuổi), `__HEM__.save()`. `?moi=1` = chơi lại từ đầu (xoá bản lưu). `?fps=1` hiện FPS / tỉ lệ điểm ảnh / số lệnh vẽ, `?bloom=0` tắt bloom ban đêm (so hiệu năng). `__HEM__.settings()` = cài đặt hiện tại.
Asset nhập ngoài: thêm dòng vào `SOURCES` (scripts/assets.mjs) rồi `npm run assets`; file nén trong `public/media/` có commit
(ngân sách `MEDIA_BUDGET` 25 MB, test `assets.test.ts` kiểm tra), bản gốc chỉ ở `.cache/assets/`. Code lấy texture bằng
`getTextures(id)` (src/assets/textures.ts) — luôn có đường lùi về vẽ thủ tục khi ảnh chưa tải được.
Hiệu năng: chi tiết nhỏ mới thì thêm tên lô vào `DETAIL_DISTANCE` (city/buildCity.ts); khối tĩnh trong một nhóm nên dùng chung vật liệu để `mergeStaticMeshes` gộp được.
Vòng lặp mỗi khung hình KHÔNG tạo đối tượng / mảng / closure mới (dùng lại biến tạm) — rác bộ nhớ gây khựng khi trình duyệt dọn.
Bước vật lý luôn qua `physics.step()` / `stepWorld()` — đừng gọi `world.step()` (Rapier 0.21 duyệt lại mọi collider, ~300 KB rác/bước).
Vật chỉ dùng ban đêm (phát sáng cộng màu, trong suốt) đăng ký `addNightOnly()` để ban ngày khỏi vẽ.
Thuộc tính instance tới fragment qua nội suy: số nguyên có thể thành 0,9999… ⇒ giải mã bằng ngưỡng, đừng `fract()` đúng tại số nguyên.
`material.positionNode` được gán SAU bước instancing (ghi đè cả phần dịch của instance).
Nhân vật có xương: đừng gọi `skeleton.pose()` (lưới lượng tử hoá meshopt ⇒ xương gốc lệch chỗ); động tác mới thêm vào
`ANIMATIONS` trong scripts/assets.mjs (tên trong game → tên clip gốc) rồi `npm run assets`.
KHÔNG đặt `scene.environment` (IBL cho mọi điểm ảnh tốn 25–40 % thời gian vẽ): vật liệu kim loại / mặt nước cần phản chiếu
thì bọc `reflective(mat)` (world/reflections.ts); ánh sáng nền thay IBL là đèn `envFill` trong environment.ts.
Đo GPU trên máy không GPU: đổi vật liệu / đèn xong phải `await renderer.compileAsync()` rồi mới đo — three.js bỏ qua
không vẽ vật đang biên dịch shader dở (số đo sẽ "nhanh" giả).
Đo hiệu năng: `__HEM__.renderer.info.render` (lệnh vẽ, tam giác), `__HEM__.scene`, `__HEM__.camera`, `__HEM__.timings`
(thời gian từng bước dựng cảnh lúc tải), `__HEM__.hardware` (card đồ hoạ, bậc máy, ngân sách cảnh).
Dựng cảnh theo sức máy: `SCENE_BUDGETS` (hardware.ts) quyết định số xe NPC, người đi bộ (và số người gần vẽ bằng nhân vật
có xương), hạt mưa, cỡ bản đồ bóng lúc tải;
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
  (không Mixamo, không Quaternius bản QAL); asset nhập ngoài phải ghi nguồn trong CREDITS.md.
- Nội dung: v0.1 không máu; từ v0.2 cận chiến có máu nhẹ (tắt được trong Cài đặt), nhãn 18+, không súng (xem mục Rủi ro trong GDD).
- Kế hoạch đang làm: `docs/plan-v0.2.md` — làm theo thứ tự N1 → N10, mỗi mục một PR nhỏ.

## Cấu trúc
```
src/
  assets/            manifest.ts (tự sinh: texture, nhân vật, động tác), textures.ts (tải lúc vào game, getTextures),
                     characters.ts (mẫu người có xương + clip động tác Mesh2Motion CC0: createCharacter, getClip)
  main.ts            khởi tạo renderer, physics, khu phố, Game; vòng lặp khung hình; móc __HEM__
  game/game.ts       vòng chơi: đi bộ ⇄ lái xe, bước vật lý cố định + nội suy, camera, HUD
  core/              fixedStep, input (phím + chuột/pointer lock), random (seed), rect
  physics/           Rapier: physics.ts (stepWorld — bước không tạo rác), groups.ts (nhóm va chạm), staticWorld.ts (vật cản tĩnh)
  render/            renderer (WebGPU→WebGL2, tối đa 1,5× điểm ảnh), instancing.ts (InstanceBatch),
                     resolution (chất lượng tự động theo FPS: bóng đổ cách khung → hạ độ phân giải), detailCulling (chi tiết nhỏ chỉ vẽ quanh camera),
                     merge (gộp khối tĩnh cùng vật liệu: xe, nhân vật, công trình) — đều có unit test,
                     bloom (NightBloom: hậu kỳ chỉ chạy lúc tối, tắt ở mức Thấp — QualityProfile.bloom)
  world/
    environment.ts   bầu trời SkyMesh + vòm trời đêm, nắng/trăng + bóng đổ bám điểm nhìn, đèn bù sáng envFill, sương; setLighting()
    reflections.ts   ảnh bầu trời (PMREM) chỉ cho vật liệu cần phản chiếu: reflective(mat)
    timeOfDay.ts     đồng hồ game + ánh sáng theo giờ (mặt trời, màu trời, sương, mức đêm) — thuần logic, có unit test
    nightGlow.ts     uniform "mức đêm" dùng chung cho mọi vật liệu phát sáng (cửa sổ, bảng hiệu, đèn đường, đèn xe) + độ ướt đường
    weather.ts       thời tiết có seed (nắng/mây/mưa rào chiều tối, đường ướt) + applyWeather() — có unit test
    rain.ts          hạt mưa quanh camera tính trên GPU (1 draw call)
    city/layout.ts   BỐ CỤC thuần dữ liệu (đường, block, hẻm, lô nhà, cột điện, cây…) — có unit test
    city/locate.ts   tên địa điểm tại (x, z) cho HUD
    city/materials.ts  shader TSL: mặt tiền (cửa sổ, cửa hàng + nội thất giả, cửa cuốn theo giờ…), vỉa hè, bê tông hẻm, nhựa đường
    city/signage.ts  nội dung bảng hiệu / băng rôn / câu LED (thuần logic, có unit test); signs.ts vẽ atlas
    city/hemDetails.ts  miệng hẻm, số hẻm, vị trí cửa nhà trong hẻm (thuần logic, có unit test)
    city/nightMaterials.ts  bảng LED chạy chữ, vũng đèn tiệm hắt ra vỉa hè, vệt bảng hiệu phản chiếu trên đường ướt
    city/build/*     dựng hình + va chạm từ bố cục: ground, buildings, streetProps, hems (đời sống trong hẻm), landmarks,
                     lightPools (vũng đèn đường), nightStreet (đèn tiệm + phản chiếu đường ướt)
  player/            characterBody (Rapier character controller), skinnedCharacter (nhân vật có xương: AnimationMixer,
                     mũ bảo hiểm / thùng hàng gắn vào xương; lùi về characterModel khối hộp nếu tải lỗi),
                     locomotion (trộn đứng/đi/chạy theo tốc độ — có unit test), followCamera (góc nhìn 3, chống xuyên tường)
  vehicles/          bikeModel (mẫu xe từ khối), motorbikePhysics (ray-cast vehicle), motorbikeView
  ai/                giao thông NPC: trafficNetwork (lưới làn từ bố cục), traffic (mô phỏng thuần logic — có unit test),
                     trafficView (2 InstancedMesh cho cả đàn xe + người lái), trafficSystem (gắn Rapier kinematic + hình)
                     pedestrians (người đi bộ vòng vỉa hè, lách vật cản, né xe — có unit test), pedestrianView (khối hộp instanced),
                     nearPedestrians + pedestrianLod (K người gần camera vẽ bằng nhân vật có xương, có giữ chỗ — có unit test),
                     seatedPeople (người ngồi quán cóc / người bán xe đẩy quanh camera, đông vắng theo giờ), npcBody (dựng NPC có xương)
                     chase (đàn em của Phát truy đuổi theo mạng đường, mất dấu khi khuất tầm nhìn — có unit test), chaseSystem
  missions/          mission (chuỗi mục tiêu, giới hạn giờ — có unit test), jobs (kèo giao hàng có seed — có unit test),
                     director (nhiệm vụ đang chạy, bảng kèo trong điện thoại, điểm đánh dấu, HUD, trả tiền), marker
                     story (5 nhiệm vụ Hồi 1: điểm hẹn, lời thoại, trả nợ — có unit test), storyRunner
  audio/             âm thanh tổng hợp WebAudio (không file): mixer (MỘT AudioContext + âm lượng, phím M), engineSound
                     (tiếng máy theo tốc độ / ga), ambience (ồn phố, dế đêm), sfx (tiền, tin nhắn, nhiệm vụ, truy đuổi, té xe),
                     horn, rainSound; soundModel (thông số âm thanh — thuần logic, có unit test).
                     Âm thanh mới nối vào mixer.bus(), KHÔNG tạo AudioContext riêng.
  ui/                HUD (địa điểm, giờ, đồng hồ tốc độ, máu / giáp, sao truy nã, bảng phím F1, hàng thông báo — toastQueue
                     có unit test), minimap (+ minimapMath có unit test)
                     phone (điện thoại "Sầu Riêng S9" cầm tay, phím P: màn hình chính + 8 app — Kèo, Bản đồ, Tin nhắn, Ví,
                     Cài đặt, Ngân hàng, Phây, Camera; phím 1–8 mở app, Backspace/Esc lùi)
  systems/           wallet (tiền mặt + nợ app vay), inbox (tin nhắn), heat (Độ Nóng + tầm nhìn),
                     social (bảng tin "Phây" châm biếm, phản ứng theo diễn biến game — có unit test),
                     inventory (balo: ô đồ xếp chồng, dùng / vứt, nâng cấp, lưu — có unit test; giao diện ui/backpack, phím I),
                     wheel (vòng chọn đồ: danh sách ô + chọn theo hướng chuột — có unit test; ui/weaponWheel, giữ Tab),
                     save (lưu localStorage, chịu được bộ nhớ bị chặn / dữ liệu hỏng),
                     settings (cài đặt người chơi + bảng mức chất lượng Tự động/Thấp/Vừa/Cao),
                     hardware (nhận diện card đồ hoạ / CPU / RAM → bậc máy → ngân sách dựng cảnh) — thuần logic, có unit test
                     fallGuard (lưới an toàn: rơi xuống sông / lọt khe quá lâu thì đưa lên chỗ đứng vững gần nhất — có unit test)
scripts/             setup.mjs (tự cài thư viện), assets.mjs (tải + nén asset CC0, sinh manifest + CREDITS.md), package.mjs + zip.mjs (đóng gói zip cho itch.io — zip.mjs có unit test)
tests/unit/          Vitest (bố cục, nhân vật, xe máy chạy trong Node với Rapier thật, giao thông NPC)
tests/e2e/           Playwright: smoke, views, gameplay, traffic, dayNight, phone, weather, pedestrians, missions, chase, story, save, settings, audio, fall
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
