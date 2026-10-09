# HẺM — Sài Gòn Không Ngủ

*HẺM: Saigon Never Sleeps* — game hành động thế giới mở góc nhìn thứ 3 trên trình duyệt. Bạn là Tín, tài xế xe ôm công nghệ
bị cuốn vào vòng nợ tín dụng đen, lách xe máy qua phố đông và những con hẻm chằng chịt của một Sài Gòn hư cấu.

> Trạng thái: **M1 — thế giới + xe máy**. Một khu phố hư cấu ~520 × 440 m (1.600+ nhà ống, mạng hẻm, chợ có tháp
> đồng hồ, công viên, bờ sông), Tín đi bộ / chạy / nhảy, lên xe máy chạy khắp phố với camera góc nhìn thứ 3.

![Chợ Trung Tâm nhìn từ mái nhà](docs/screenshots/m1-cho-trung-tam.png)

## Chạy thử
Yêu cầu Node ≥ 22.12 và npm ≥ 11 (`npm i -g npm@11`).
```bash
npm install
npm run dev
```
Mở http://localhost:5173 rồi bấm vào màn hình để điều khiển camera bằng chuột.

| Phím | Đi bộ | Trên xe |
| --- | --- | --- |
| `W A S D` / mũi tên | đi | ga · phanh/lùi · lái |
| `Shift` | chạy | — |
| `Space` | nhảy | phanh tay |
| `F` | lên xe (khi đứng gần) | xuống xe (khi chạy chậm) |
| `H` / `L` / `R` | — | bóp còi · đèn pha · dựng lại xe |
| Chuột / con lăn | xoay camera · zoom | xoay camera · zoom |
| `Tab` | ẩn/hiện bảng phím | |

## Công nghệ
TypeScript · Vite · Three.js (WebGPU, tự lùi về WebGL2) · Rapier physics · Vitest · Playwright.

## Tài liệu
- [Game Design Doc](docs/gdd.md)
- [Quy ước cho Claude / người đóng góp](CLAUDE.md)

## Giấy phép
Mã nguồn: chưa chọn giấy phép. Asset bên thứ ba (nếu có) ghi rõ nguồn trong `public/assets/CREDITS.md`.
