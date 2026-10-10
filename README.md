# HẺM — Sài Gòn Không Ngủ

*HẺM: Saigon Never Sleeps* — game hành động thế giới mở góc nhìn thứ 3 trên trình duyệt. Bạn là Tín, tài xế xe ôm công nghệ
bị cuốn vào vòng nợ tín dụng đen, lách xe máy qua phố đông và những con hẻm chằng chịt của một Sài Gòn hư cấu.

> Trạng thái: **M4 — hoàn thiện** (chơi được trọn Hồi 1, có âm thanh, chạy vừa sức máy, có bản demo cho itch.io). Một khu phố hư cấu ~520 × 440 m (1.600+ nhà ống,
> mạng hẻm, chợ có tháp đồng hồ, công viên, bờ sông) đông xe máy, người đi bộ đội nón lá, có ngày đêm và mưa rào.
> Tín chạy kèo giao hàng qua điện thoại để trả nợ app vay, luồn hẻm cắt đuôi đàn em của Phát, đi hết 5 nhiệm vụ Hồi 1.
> Game tự lưu.

![Chợ Trung Tâm nhìn từ mái nhà](docs/screenshots/m1-cho-trung-tam.png)

## Chạy thử
**Chơi ngay, không cần cài gì:** https://kangnahyun23.github.io/HEM-Saigon-Never-Sleeps/
(bản mới nhất trên nhánh `main`, tự deploy qua GitHub Pages).

**Chạy trên máy mình:** cần [Node](https://nodejs.org) ≥ 22.12, rồi chỉ một lệnh:
```bash
npm start
```
Lệnh này tự cài thư viện ở lần đầu (và mỗi khi `package-lock.json` đổi; các lần sau bỏ qua, mất chưa tới 1 giây),
rồi mở game trong trình duyệt tại http://localhost:5173. Máy còn npm 10 cũng không sao — script tự mượn npm 11 qua `npx`.

Bấm vào màn hình để điều khiển camera bằng chuột.

| Phím | Đi bộ | Trên xe |
| --- | --- | --- |
| `W A S D` / mũi tên | đi | ga · phanh/lùi · lái |
| `Shift` | chạy | — |
| `Space` | nhảy | phanh tay |
| `F` | lên xe (khi đứng gần) | xuống xe (khi chạy chậm) |
| `H` / `L` / `R` | — | bóp còi · đèn pha · dựng lại xe |
| Chuột / con lăn | xoay camera · zoom | xoay camera · zoom |
| `P` | điện thoại (Kèo · Bản đồ · Tin nhắn · Ví · Cài đặt), `1`–`5` đổi tab, `Esc` cất | như đi bộ |
| `M` | tắt / bật tiếng (âm lượng chỉnh trong Cài đặt) | như đi bộ |
| `Tab` | ẩn/hiện bảng phím | |

Game tự lưu (sau mỗi nhiệm vụ, mỗi 30 giây, khi rời trang); muốn chơi lại từ đầu thì mở `?moi=1`.

Một ngày trong game dài 24 phút (1 phút = 1 giờ), bắt đầu lúc 16:30. Muốn xem ngay cảnh đêm: mở
http://localhost:5173/?gio=21 (thêm `&mua=1` để xem phố đêm mưa). Trời Sài Gòn hay đổ mưa rào chiều tối.

### Bị giật / lag?
Lúc tải, game đọc card đồ hoạ / CPU / RAM để dựng cảnh vừa sức máy (số xe, người đi bộ, mưa, độ nét bóng đổ) và
chọn mức khởi đầu cho chất lượng "Tự động" — tab Cài đặt ghi rõ máy được nhận là yếu / trung bình / mạnh.
Muốn đổi: mở điện thoại (`P`) → **Cài đặt** (`5`) → chọn **Chất lượng đồ hoạ**:
- **Tự động** (mặc định): máy chậm thì bóng đổ cập nhật cách khung, rồi hạ độ phân giải; mượt lại thì nâng lên.
- **Thấp**: tắt bóng đổ, vẽ 0,75× điểm ảnh, ít chi tiết ở xa — cho laptop card onboard (nhanh gần gấp đôi "Tự động").
- **Vừa** / **Cao**: cố định độ phân giải 1× / 1,5× và có bóng đổ.

Cũng trong Cài đặt: **Hiện FPS** (số khung hình/giây, tỉ lệ điểm ảnh, số lệnh vẽ), độ nhạy chuột, đảo trục dọc.
Cài đặt được lưu lại (chơi lại từ đầu bằng `?moi=1` vẫn giữ). Laptop có hai card đồ hoạ: chọn trình duyệt chạy bằng
card rời (Windows: Cài đặt → Hiển thị → Đồ hoạ). Chrome/Edge bản mới chạy WebGPU nhanh hơn Firefox/Safari (đang phải
lùi về WebGL2).

## Bản demo trên itch.io
Game là trang web tĩnh nên lên itch.io dạng **HTML** (chơi ngay trong trình duyệt). Lấy file zip bằng một trong hai cách:
- **Tự đóng gói:** `npm run package` → `release/hem-saigon-v<phiên bản>-web.zip` (build, kiểm tra theo giới hạn của
  itch.io: có `index.html` ở gốc, ≤ 1000 file, đường dẫn tương đối, rồi nén — khoảng 2 MB).
- **Lấy từ CI:** GitHub → tab **Actions** → lần chạy CI mới nhất trên `main` → mục **Artifacts** → `hem-saigon-web-zip`.
  GitHub bọc thêm một lớp zip bên ngoài: giải nén lớp đó ra, lấy file `hem-saigon-v…-web.zip` bên trong để tải lên.

Tải lên lần đầu (itch.io → **Dashboard** → **Create new project**):
1. **Kind of project:** `HTML`.
2. **Uploads:** chọn file zip ở trên, tick **This file will be played in the browser**.
3. **Embed options:** kích thước `1280 × 720`, tick **Fullscreen button**; không cần tick *SharedArrayBuffer support*.
4. **Visibility:** để `Draft` chơi thử trước, ổn rồi chuyển `Public`.

Đã kiểm tra bản zip chạy trong iframe khác tên miền ở thư mục con (giống cách itch.io nhúng game): tải được, lưu game được,
phím Space / mũi tên không cuộn trang itch.io bên ngoài. Bấm vào khung game một lần để game nhận phím và chuột.

**Tự đẩy bản mới lên itch.io (tuỳ chọn):** tạo API key ở itch.io → Settings → **API keys**; trong repo GitHub → Settings →
**Secrets and variables → Actions** thêm secret `BUTLER_API_KEY` (key vừa tạo) và biến `ITCH_TARGET`
(dạng `ten-ban/ten-game:web`). Từ đó mỗi lần merge vào `main` mà CI xanh, CI tự đẩy bản mới bằng
[butler](https://itch.io/docs/butler/). Lần đầu đẩy xong, vào trang sửa game tick **This file will be played in the browser**
cho bản tải lên kênh `web`.

## Công nghệ
TypeScript · Vite · Three.js (WebGPU, tự lùi về WebGL2) · Rapier physics · Vitest · Playwright.

## Tài liệu
- [Game Design Doc](docs/gdd.md)
- [Quy ước cho Claude / người đóng góp](CLAUDE.md)

## Giấy phép
Mã nguồn: chưa chọn giấy phép. Asset bên thứ ba (nếu có) ghi rõ nguồn trong `public/assets/CREDITS.md`.
