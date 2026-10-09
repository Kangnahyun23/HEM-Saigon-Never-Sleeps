# CLAUDE.md — HẺM: Sài Gòn Không Ngủ

Game hành động thế giới mở góc nhìn thứ 3 (cảm hứng GTA V) bối cảnh một Sài Gòn hư cấu, chạy trên trình duyệt.
Thiết kế đầy đủ: `docs/gdd.md`. Đọc file đó trước khi làm tính năng mới.

## Stack
- TypeScript strict · Vite 8 · Three.js r186 (`three/webgpu`, `WebGPURenderer` tự lùi về WebGL2) · Rapier (`@dimforge/rapier3d-compat`)
- Vitest (unit) · Playwright (e2e + ảnh chụp màn hình) · ESLint (typescript-eslint)
- Node ≥ 22.12, **npm ≥ 11** (npm 10.9 có lỗi `edgesOut` khi cài vitest 4)

## Lệnh
```bash
npm install
npm run dev        # http://localhost:5173  (thêm ?webgl để ép WebGL2)
npm run check      # lint + typecheck + unit test — chạy trước mỗi commit
npm run build      # tsc + vite build → dist/
npm run e2e        # build, chạy preview, Playwright mở game và chụp tests/e2e/__screenshots__/
npx playwright test views      # chỉ chụp các góc nhìn khu phố
npx playwright test gameplay   # đi bộ → lên xe → chạy → cua → phanh → xuống xe
```
Debug trong console trình duyệt: `__HEM__.layout` (bố cục khu phố), `__HEM__.game`, `__HEM__.simulate(giây)`
(chạy logic không render), `__HEM__.setCamera(px,py,pz, tx,ty,tz)` (camera tự do).
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
- Tên khu, đường, thương hiệu trong game đều hư cấu. Không dùng asset/nhạc có bản quyền; chỉ CC0 hoặc tự làm.
- Nội dung: đối kháng phong cách hoạt hình, không máu, không súng trong MVP (xem mục Rủi ro trong GDD).

## Cấu trúc
```
src/
  main.ts            khởi tạo renderer, physics, khu phố, Game; vòng lặp khung hình; móc __HEM__
  game/game.ts       vòng chơi: đi bộ ⇄ lái xe, bước vật lý cố định + nội suy, camera, HUD
  core/              fixedStep, input (phím + chuột/pointer lock), random (seed), rect
  physics/           Rapier: physics.ts, groups.ts (nhóm va chạm), staticWorld.ts (vật cản tĩnh)
  render/            renderer (WebGPU→WebGL2), instancing.ts (InstanceBatch)
  world/
    environment.ts   bầu trời SkyMesh, PMREM, nắng + bóng đổ bám điểm nhìn, sương
    city/layout.ts   BỐ CỤC thuần dữ liệu (đường, block, hẻm, lô nhà, cột điện, cây…) — có unit test
    city/locate.ts   tên địa điểm tại (x, z) cho HUD
    city/materials.ts  shader TSL: mặt tiền (cửa sổ, cửa hàng…), vỉa hè, bê tông hẻm, nhựa đường
    city/build/*     dựng hình + va chạm từ bố cục: ground, buildings, streetProps, landmarks
  player/            characterBody (Rapier character controller), characterModel (hoạt hoạ thủ tục),
                     followCamera (góc nhìn 3, chống xuyên tường)
  vehicles/          bikeModel (mẫu xe từ khối), motorbikePhysics (ray-cast vehicle), motorbikeView
  audio/             còi xe WebAudio
  ui/                HUD (địa điểm, đồng hồ tốc độ, gợi ý phím, thông báo)
tests/unit/          Vitest (bố cục, nhân vật, xe máy chạy trong Node với Rapier thật)
tests/e2e/           Playwright: smoke, views (ảnh khu phố), gameplay
```

Quy ước hướng: yaw = 0 nhìn về +Z; hướng (sin yaw, cos yaw); bên TRÁI là (cos yaw, −sin yaw).
Xe chạy bên phải: đi theo +X thì ở nửa +Z của đường, đi theo +Z thì ở nửa −X.

## Quy trình làm việc
- Mỗi phiên làm MỘT task nhỏ, kết thúc bằng một PR vào `main` (CI: lint, typecheck, test, build, e2e).
- Push lên `main` tự deploy GitHub Pages (bật Pages → Source: GitHub Actions trong Settings của repo).
- Lộ trình: M0 khung dự án → M1 thế giới + xe máy → M2 thành phố sống động → M3 nhiệm vụ + truy đuổi → M4 hoàn thiện.
