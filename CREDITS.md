# Ghi công — HẺM: Sài Gòn Không Ngủ

Tệp này do `npm run assets` tự sinh từ `scripts/assets.mjs` (sửa phần mở đầu ở `scripts/credits-header.md`).

Mọi thứ không có tên dưới đây đều tự làm cho game: nhà phố, xe máy, bảng hiệu, cây, người, âm thanh tổng hợp bằng WebAudio.
Asset nhập từ ngoài chỉ dùng giấy phép **CC0** (tặng vào phạm vi công cộng, không bắt buộc ghi công) — vẫn ghi lại để cảm ơn
tác giả và để tra nguồn.

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
| `man-shirt` | [male_5](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/male_5.glb) | elbolilloduro | Mesh2Motion | CC0 | Người đi đường (nam, sơ mi) |
| `man-tee` | [male_6](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/male_6.glb) | elbolilloduro | Mesh2Motion | CC0 | Người đi đường (nam, áo thun) |
| `man-polo` | [male_10](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/male_10.glb) | elbolilloduro | Mesh2Motion | CC0 | Người đi đường (nam, áo polo) |
| `old-man` | [male_32](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/male_32.glb) | elbolilloduro | Mesh2Motion | CC0 | Người đi đường (ông cụ) |
| `woman-young` | [female_9](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/female_9.glb) | elbolilloduro | Mesh2Motion | CC0 | Người đi đường (cô gái) |
| `woman-style` | [female_8](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/female_8.glb) | elbolilloduro | Mesh2Motion | CC0 | Người đi đường (cô gái sành điệu) |
| `old-woman` | [female_31](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/female_31.glb) | elbolilloduro | Mesh2Motion | CC0 | Người đi đường (bà cụ) |
| `police-m` | [police_male](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/police_male.glb) | elbolilloduro | Mesh2Motion | CC0 | Công an (nam) — đổi màu đồng phục trong game |
| `police-f` | [police_female](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/police_female.glb) | elbolilloduro | Mesh2Motion | CC0 | Công an (nữ) — đổi màu đồng phục trong game |
| `riot` | [swat_male](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/models-variation/human/swat_male.glb) | elbolilloduro | Mesh2Motion | CC0 | Cảnh sát cơ động (truy nã cấp cao) |
| `human-base` | [human-base-animations.glb](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/animations/human-base-animations.glb) (31 động tác) | Nhóm Mesh2Motion | Mesh2Motion | CC0 | Động tác nhân vật |
| `human-addon` | [human-addon-animations.glb](https://github.com/mesh2motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/animations/human-addon-animations.glb) (13 động tác) | Nhóm Mesh2Motion | Mesh2Motion | CC0 | Động tác nhân vật |
