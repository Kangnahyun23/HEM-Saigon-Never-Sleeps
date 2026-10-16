# Ghi công — HẺM: Sài Gòn Không Ngủ

Tệp này do `npm run assets` tự sinh từ `scripts/assets.mjs` (sửa phần mở đầu ở `scripts/credits-header.md`).

Mọi thứ không có tên dưới đây đều tự làm cho game: nhà phố, xe máy, bảng hiệu, cây, người, âm thanh tổng hợp bằng WebAudio.
Texture, nhân vật, động tác nhập từ ngoài chỉ dùng giấy phép **CC0** (tặng vào phạm vi công cộng, không bắt buộc ghi công) —
vẫn ghi lại để cảm ơn tác giả và để tra nguồn. Riêng font chữ dùng giấy phép **SIL Open Font License 1.1** (xem bên dưới).

## Font chữ

Font có đủ dấu tiếng Việt, lấy từ gói [Fontsource](https://fontsource.org) và đi kèm bản build (không tải từ Google Fonts).
Giấy phép [SIL Open Font License 1.1](https://openfontlicense.org): được dùng, nhúng và phát hành kèm game; không bán riêng
font. Toàn văn giấy phép có trong mỗi gói (`node_modules/@fontsource/<tên>/LICENSE`).

| Font | Gói | Bản quyền | Giấy phép | Dùng cho |
| --- | --- | --- | --- | --- |
| Be Vietnam Pro | [@fontsource/be-vietnam-pro](https://www.npmjs.com/package/@fontsource/be-vietnam-pro) | Copyright 2021 The Be Vietnam Pro Project Authors (https://github.com/bettergui/BeVietnamPro) | OFL-1.1 | Chữ giao diện (HUD, điện thoại, balo, cửa hàng) |
| Oswald | [@fontsource/oswald](https://www.npmjs.com/package/@fontsource/oswald) | Copyright 2016 The Oswald Project Authors (https://github.com/googlefonts/OswaldFont) | OFL-1.1 | Bảng hiệu: tên tiệm, dòng phụ |
| Anton | [@fontsource/anton](https://www.npmjs.com/package/@fontsource/anton) | Copyright 2020 The Anton Project Authors (https://github.com/googlefonts/AntonFont.git) | OFL-1.1 | Bảng hiệu: chữ đứng đậm (bảng alu chữ nổi) |
| Bungee | [@fontsource/bungee](https://www.npmjs.com/package/@fontsource/bungee) | Copyright 2023 The Bungee Project Authors (https://github.com/djrrb/Bungee) | OFL-1.1 | Bảng hiệu: chữ khối tròn (trà sữa, karaoke) |
| Barlow Condensed | [@fontsource/barlow-condensed](https://www.npmjs.com/package/@fontsource/barlow-condensed) | Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) | OFL-1.1 | Bảng hiệu: số điện thoại, địa chỉ |
| Sriracha | [@fontsource/sriracha](https://www.npmjs.com/package/@fontsource/sriracha) | Copyright (c) 2015, Cadson Demak (info@cadsondemak.com), Copyright (c) 2014, Pablo Impallari (www.impallari.com) | OFL-1.1 | Bảng hiệu: chữ vẽ tay (quán ăn, xe đẩy) |
| Patrick Hand | [@fontsource/patrick-hand](https://www.npmjs.com/package/@fontsource/patrick-hand) | Copyright (c) 2010-2012 Patrick Wagesreiter (mail@patrickwagesreiter.at) | OFL-1.1 | Bảng hiệu: chữ bút lông (bảng giá, giấy dán) |
| Tilt Neon | [@fontsource/tilt-neon](https://www.npmjs.com/package/@fontsource/tilt-neon) | Copyright 2019 The Tilt Project Authors (https://github.com/googlefonts/Tilt-Fonts) | OFL-1.1 | Bảng hiệu: chữ neon |

## Texture

| Mã trong game | Asset | Tác giả | Nguồn | Giấy phép | Dùng cho |
| --- | --- | --- | --- | --- | --- |
| `asphalt` | [Asphalt 02](https://polyhaven.com/a/asphalt_02) | Rob Tuytel | Poly Haven | CC0 | Mặt đường nhựa |
| `pavers` | [Concrete Pavers](https://polyhaven.com/a/concrete_pavers) | Amal Kumar | Poly Haven | CC0 | Vỉa hè gạch con sâu |
| `concrete` | [Concrete Floor Worn 001](https://polyhaven.com/a/concrete_floor_worn_001) | Dimitrios Savva, Rico Cilliers | Poly Haven | CC0 | Nền bê tông trong hẻm |
| `plaster` | [Worn Plaster Wall](https://polyhaven.com/a/worn_plaster_wall) | Dimitrios Savva | Poly Haven | CC0 | Tường vữa loang lổ của nhà phố |
| `corrugated` | [Corrugated Iron 02](https://polyhaven.com/a/corrugated_iron_02) | Jenelle van Heerden, Sergej Majboroda | Poly Haven | CC0 | Mái tôn sóng trên sân thượng |

## Nhân vật và động tác

Từ [Mesh2Motion](https://github.com/mesh2motion/mesh2motion-app) (commit `653a969`): "All 3d models, blend files, rigs, animations" theo CC0 1.0.
Chỉ dùng các mẫu ghi CC0 trong danh sách mẫu của Mesh2Motion (bỏ các mẫu CC-BY / CC-SA).

| Mã trong game | Asset | Tác giả | Nguồn | Giấy phép | Dùng cho |
| --- | --- | --- | --- | --- | --- |
| `tin` | [male_15](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/male_15.glb) | elbolilloduro | Mesh2Motion | CC0 | Tín — nhân vật chính |
| `man-shirt` | [male_5](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/male_5.glb) | elbolilloduro | Mesh2Motion | CC0 | Người đi đường (nam, sơ mi); đàn em của Phát (nhuộm đồ đen trong game) |
| `man-tee` | [male_6](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/male_6.glb) | elbolilloduro | Mesh2Motion | CC0 | Người đi đường (nam, áo thun) |
| `man-polo` | [male_10](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/male_10.glb) | elbolilloduro | Mesh2Motion | CC0 | Người đi đường (nam, áo polo); đàn em của Phát (nhuộm đồ đen trong game) |
| `old-man` | [male_32](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/male_32.glb) | elbolilloduro | Mesh2Motion | CC0 | Người đi đường (ông cụ) |
| `woman-young` | [female_9](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/female_9.glb) | elbolilloduro | Mesh2Motion | CC0 | Người đi đường (cô gái) |
| `woman-style` | [female_8](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/female_8.glb) | elbolilloduro | Mesh2Motion | CC0 | Người đi đường (cô gái sành điệu) |
| `old-woman` | [female_31](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/female_31.glb) | elbolilloduro | Mesh2Motion | CC0 | Người đi đường (bà cụ) |
| `police-m` | [police_male](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/police_male.glb) | elbolilloduro | Mesh2Motion | CC0 | Công an (nam) — đổi màu đồng phục trong game |
| `police-f` | [police_female](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/police_female.glb) | elbolilloduro | Mesh2Motion | CC0 | Công an (nữ) — đổi màu đồng phục trong game |
| `riot` | [swat_male](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/swat_male.glb) | elbolilloduro | Mesh2Motion | CC0 | Cảnh sát cơ động (truy nã cấp cao) |
| `human-base` | [human-base-animations.glb](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/animations/human-base-animations.glb) (31 động tác) | Nhóm Mesh2Motion | Mesh2Motion | CC0 | Động tác nhân vật |
| `human-addon` | [human-addon-animations.glb](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/animations/human-addon-animations.glb) (13 động tác) | Nhóm Mesh2Motion | Mesh2Motion | CC0 | Động tác nhân vật |
