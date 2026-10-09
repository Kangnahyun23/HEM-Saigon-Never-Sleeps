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
npm run e2e        # build, chạy preview, Playwright mở game và chụp tests/e2e/__screenshots__/
```
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
  main.ts          khởi tạo renderer + physics + game loop
  core/            fixedStep, input, random (seed)
  physics/         bọc Rapier, đồng bộ mesh
  render/          tạo renderer
  world/           sandbox M0 (sẽ thành bộ sinh thành phố ở M1), bảng màu
  ui/              HUD
  (sắp có) vehicles/ player/ ai/ systems/ missions/ audio/
tests/unit/        Vitest
tests/e2e/         Playwright
```

## Quy trình làm việc
- Mỗi phiên làm MỘT task nhỏ, kết thúc bằng một PR vào `main` (CI: lint, typecheck, test, build, e2e).
- Push lên `main` tự deploy GitHub Pages (bật Pages → Source: GitHub Actions trong Settings của repo).
- Lộ trình: M0 khung dự án → M1 thế giới + xe máy → M2 thành phố sống động → M3 nhiệm vụ + truy đuổi → M4 hoàn thiện.
