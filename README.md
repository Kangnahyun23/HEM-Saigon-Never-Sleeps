# HẺM — Sài Gòn Không Ngủ

*HẺM: Saigon Never Sleeps* — game hành động thế giới mở góc nhìn thứ 3 trên trình duyệt. Bạn là Tín, tài xế xe ôm công nghệ
bị cuốn vào vòng nợ tín dụng đen, lách xe máy qua phố đông và những con hẻm chằng chịt của một Sài Gòn hư cấu.

> Trạng thái: **M0 — khung dự án**. Sandbox một đoạn phố nhà ống với vật lý thùng gỗ rơi.

## Chạy thử
**Chơi ngay, không cần cài gì:** https://kangnahyun23.github.io/HEM-Saigon-Never-Sleeps/
(bản mới nhất trên nhánh `main`, tự deploy qua GitHub Pages).

**Chạy trên máy mình:** cần [Node](https://nodejs.org) ≥ 22.12, rồi chỉ một lệnh:
```bash
npm start
```
Lệnh này tự cài thư viện ở lần đầu (và mỗi khi `package-lock.json` đổi; các lần sau bỏ qua, mất chưa tới 1 giây),
rồi mở game trong trình duyệt tại http://localhost:5173. Máy còn npm 10 cũng không sao — script tự mượn npm 11 qua `npx`.

Chuột trái/phải để xoay/kéo camera, cuộn để zoom, `Space` thả thùng, `R` làm lại.

## Công nghệ
TypeScript · Vite · Three.js (WebGPU, tự lùi về WebGL2) · Rapier physics · Vitest · Playwright.

## Tài liệu
- [Game Design Doc](docs/gdd.md)
- [Quy ước cho Claude / người đóng góp](CLAUDE.md)

## Giấy phép
Mã nguồn: chưa chọn giấy phép. Asset bên thứ ba (nếu có) ghi rõ nguồn trong `public/assets/CREDITS.md`.
