# HẺM — Sài Gòn Không Ngủ

*HẺM: Saigon Never Sleeps* — game hành động thế giới mở góc nhìn thứ 3 trên trình duyệt. Bạn là Tín, tài xế xe ôm công nghệ
bị cuốn vào vòng nợ tín dụng đen, lách xe máy qua phố đông và những con hẻm chằng chịt của một Sài Gòn hư cấu.

> Trạng thái: **M0 — khung dự án**. Sandbox một đoạn phố nhà ống với vật lý thùng gỗ rơi.

## Chạy thử
Yêu cầu Node ≥ 22.12 và npm ≥ 11 (`npm i -g npm@11`).
```bash
npm install
npm run dev
```
Mở http://localhost:5173. Chuột trái/phải để xoay/kéo camera, cuộn để zoom, `Space` thả thùng, `R` làm lại.

## Công nghệ
TypeScript · Vite · Three.js (WebGPU, tự lùi về WebGL2) · Rapier physics · Vitest · Playwright.

## Tài liệu
- [Game Design Doc](docs/gdd.md)
- [Quy ước cho Claude / người đóng góp](CLAUDE.md)

## Giấy phép
Mã nguồn: chưa chọn giấy phép. Asset bên thứ ba (nếu có) ghi rõ nguồn trong `public/assets/CREDITS.md`.
