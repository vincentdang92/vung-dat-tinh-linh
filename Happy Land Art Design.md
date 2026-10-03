# Happy Land — Art Design

Oct 3, 2026 · @VienBT

## Định hướng art

Happy Land dùng **pixel art chibi, góc nhìn 3/4 từ trên xuống**, màu tươi ấm như một buổi chiều nắng. Lý do: rẻ và nhanh để một người làm, phóng to nét căng trên điện thoại, và nhân vật chibi đầu to đọc rõ dù chỉ cao 32px.

| Hạng mục | Quy cách |
| --- | --- |
| Ô map (tile) | 32×32 px, khớp `TILE = 32` trong code |
| Khung nhân vật | 48×48 px; thân cao khoảng 32 px, tỉ lệ đầu : thân = 1 : 1 |
| Quái thường | 32×32 đến 48×48 px |
| Boss | 96×96 px |
| Hiệu ứng chiêu | 64×64 px (chiêu thường), 128×128 px (tuyệt chiêu) |
| Hướng nhìn | 4 hướng: xuống, lên, ngang (lật trái/phải) — vẽ 3, lật 1 |
| Tốc độ animation | 8–12 khung/giây |
| Phóng to trên máy | Số nguyên (3× trên màn 1080 px), lọc nearest, không làm mờ |

**Bảng màu:** giới hạn khoảng 32 màu dùng chung cho toàn game. Viền nhân vật và quái dùng **tím đậm `#2B1E3A`** thay vì đen để mềm hơn mà vẫn nổi trên nền.

**Quy tắc đọc rõ trên màn hình dọc:**

- Nền cỏ là xanh lá, nên **không lớp nhân vật hay quái thường nào được lấy xanh lá làm màu chính**.
- Người chơi: màu bão hoà, sáng. Quái: màu trầm hơn một bậc, mắt có điểm sáng đỏ/vàng để nhận ra là địch.
- Mọi thực thể có bóng elip dưới chân (đen 25%) để thấy rõ vị trí đứng.
- Màu cảnh báo chỉ dành cho nguy hiểm: **đỏ/cam = sắp trúng đòn**, xanh lá = hồi máu, vàng = phần thưởng (vàng, lên cấp).
- Màu hiệu ứng theo lớp, không lẫn nhau: Chiến binh cam–vàng, Cung thủ vàng kim–trắng, Pháp sư xanh băng–tím.

**Lưu ý kỹ thuật:** bản MVP đang xoay cả sprite theo hướng đi (nhìn thẳng từ trên). Khi chuyển sang art 3/4, cần đổi phần vẽ trong `WorldScene.ts` sang chọn animation theo 4 hướng thay vì xoay ảnh.

## Nhân vật

Mỗi lớp nhận ra được chỉ bằng **dáng đầu và màu áo**, kể cả khi nhỏ trên màn hình: mũ sắt chóp đỏ, mũ trùm da, mũ phù thuỷ nhọn.

&#91;image: Concept 3 lớp nhân vật\]

| Lớp | Dáng nhận diện | Màu chính | Trang phục | Tính cách thể hiện |
| --- | --- | --- | --- | --- |
| Chiến binh | Mũ sắt tròn có chóp lông đỏ, vai giáp | Đỏ `#E0533D`, thép `#C9D1DB` | Áo đỏ, thắt lưng da, khiên gỗ tròn tay trái, kiếm tay phải | Đứng vững, chân dang rộng, gật đầu khi idle |
| Cung thủ | Mũ trùm da ôm mặt, tóc mái vàng | Vàng hổ phách `#F2B33D`, da `#8A5A33` | Áo choàng xoè, dây đeo chéo, ống tên sau lưng, cung tay trái | Nhún nhảy nhẹ, nhanh nhẹn |
| Pháp sư | Mũ phù thuỷ vành rộng, chóp gập | Xanh dương `#4F6FE0`, tím `#8E5BD6` | Áo dài chấm đất, tóc bạc, trượng gỗ đầu cầu băng | Áo phấp phới, quả cầu trên trượng nhấp nháy |

**Animation cho mỗi lớp** (vẽ 3 hướng: xuống, lên, ngang; hướng còn lại lật):

| Animation | Số khung | Ghi chú |
| --- | --- | --- |
| Đứng (idle) | 4 | Thở nhẹ 1 px, lặp |
| Đi | 6 | Lặp |
| Đánh thường | 4–5 | 1 khung lấy đà rõ, khung trúng đòn giữ lâu hơn |
| Chiêu | 6 | Tư thế riêng mỗi lớp |
| Tuyệt chiêu | 8 | Có khung tạo dáng (pose) để chụp màn hình đẹp |
| Lướt | 3 | Kèm vệt mờ 2–3 bóng ma phía sau |
| Trúng đòn | 2 | Nháy trắng do code xử lý, art chỉ cần khung giật lùi |
| Gục ngã | 4 | Chỉ cần hướng xuống |

Tổng khoảng 110 khung mỗi lớp. Bản MVP đầu chỉ cần idle, đi, đánh thường cho 3 hướng (khoảng 45 khung/lớp), phần còn lại làm sau.

**Đổi trang phục theo vũ khí:** chỉ đổi sprite vũ khí cầm tay (layer riêng), thân giữ nguyên. Nhờ vậy 9 vũ khí không nhân số khung nhân vật lên 9 lần.

## Vũ khí

Độ hiếm phải nhìn ra được trong nửa giây, nhờ **ba lớp tín hiệu cộng dồn**: chất liệu, màu viền, và hiệu ứng phát sáng.

&#91;image: Concept 9 vũ khí theo lớp và độ hiếm\]

| Bậc | Màu khung UI | Chất liệu | Hiệu ứng trong game |
| --- | --- | --- | --- |
| Thường | Xám `#BDBDBD` | Gỗ, da, không đá quý | Không |
| Hiếm | Xanh `#4AA3FF` | Kim loại, 1 viên đá xanh | Lấp lánh 1 điểm sáng mỗi 2 giây |
| Sử thi | Tím `#A061FF` | Dáng riêng, có nguyên tố | Hào quang 1 px màu nguyên tố, vệt sáng khi vung, hạt bay quanh |
| Huyền thoại (sau này) | Cam `#FF9A3D` | Dáng riêng + chi tiết vàng | Như sử thi, thêm cột sáng khi rơi xuống đất |

| Vũ khí | Lớp | Bậc | Mô tả hình |
| --- | --- | --- | --- |
| Kiếm gỗ | Chiến binh | Thường | Lưỡi gỗ sáng, chuôi quấn da |
| Kiếm sắt | Chiến binh | Hiếm | Lưỡi thép, đá xanh ở chắn tay |
| Hỏa kiếm | Chiến binh | Sử thi | Lưỡi cam chuyển vàng, chắn tay vàng, đá đỏ; vệt lửa khi chém |
| Cung ngắn | Cung thủ | Thường | Gỗ sáng, dây trắng |
| Cung thợ săn | Cung thủ | Hiếm | Gỗ sẫm, hai đầu bịt kim loại, đá xanh |
| Phong cung | Cung thủ | Sử thi | Thân xanh băng, đầu cung hình cánh chim; tên để lại vệt gió |
| Gậy sồi | Pháp sư | Thường | Gậy gỗ đầu u tròn |
| Trượng pha lê | Pháp sư | Hiếm | Cầu pha lê xanh, vòng bạc ôm cầu |
| Trượng bão tố | Pháp sư | Sử thi | Thân tím sẫm, cầu tím, vòng vàng, tia sét nhảy quanh |

**Mỗi vũ khí cần 3 asset:** icon túi đồ 24×24, sprite cầm tay khớp khung nhân vật (theo 3 hướng), và sprite rơi trên đất (dùng lại icon, thêm bóng và nhún lên xuống bằng code).

## Chiêu & tuyệt chiêu

Mỗi lớp có 4 nút: **đánh thường (tự động), chiêu, lướt, tuyệt chiêu**. Tuyệt chiêu là tính năng mới: thanh **Nộ** đầy dần khi gây hoặc nhận sát thương (khoảng 25–30 giây đánh liên tục), đầy thì nút sáng lên và rung nhẹ.

&#91;image: Khung đỉnh của 3 tuyệt chiêu\]

| Tuyệt chiêu | Lớp | Cách hoạt động (đề xuất) | VFX |
| --- | --- | --- | --- |
| **Địa Chấn** | Chiến binh | Nhảy lên 0.3s rồi nện đất: 300% sát thương vùng 110 px, choáng quái 1.2s | 7 vết nứt cam–vàng toả ra, vòng bụi đất, đá văng; rung màn hình mạnh |
| **Mưa Tên Vàng** | Cung thủ | Vùng 90 px quanh mục tiêu gần nhất, 3 giây, mỗi 0.25s gây 60% | Vòng vàng trên đất, tên vàng rơi chéo liên tục, tia sáng nhỏ khi chạm đất |
| **Bão Băng Tinh** | Pháp sư | 6 tinh thể xoay quanh người 4 giây (bán kính 70 px), chạm quái gây 80% và làm chậm 40% | Vòng sương băng dưới chân, tinh thể xanh băng xoay, bông tuyết rơi |

**Hiệu ứng các chiêu còn lại:**

| Kỹ năng | Chiến binh | Cung thủ | Pháp sư |
| --- | --- | --- | --- |
| Đánh thường | Vệt chém trắng hình cung, 3 khung | Mũi tên có đuôi lông trắng | Cầu phép xanh băng, nổ nhỏ khi trúng |
| Chiêu | Xoáy kiếm: vòng chém trắng–cam 360°, 5 khung | Tên tán xạ: 5 mũi toả quạt, loé vàng ở đầu cung | Thiên thạch: vòng đỏ báo 0.6s, đá lửa rơi, nổ cam |
| Lướt | 3 bóng mờ đỏ | 3 bóng mờ vàng + lá bay | Biến thành vệt sao xanh |

**Nhịp của mọi hiệu ứng:** lấy đà (20%) → trúng đòn (khung sáng nhất, giữ 2 khung) → tan dần (phần còn lại). Khung trúng đòn trùng đúng lúc server tính sát thương để người chơi cảm thấy "đòn có lực".

**Màu không được dùng cho hiệu ứng người chơi:** đỏ đặc dạng vòng tròn trên đất, vì màu này dành riêng để báo đòn của quái và boss. Riêng Thiên thạch của Pháp sư đang dùng vòng đỏ, nên đổi sang **vòng cam viền vàng** khi làm art.

## Quái

Quái trong Happy Land **dễ thương nhưng có ý đồ xấu**: dáng tròn, mắt to, nhưng luôn có một chi tiết "nghịch" (mắt đỏ, nanh, khăn quàng của băng nhóm). Slime đổi từ xanh lá sang **hồng** để không chìm vào cỏ.

&#91;image: Concept quái hiện có và 2 quái đề xuất\]

| Quái | Kích thước | Màu chính | Hình dáng | Animation | Báo đòn |
| --- | --- | --- | --- | --- | --- |
| Thạch Hồng (slime) | 32×32 | Hồng `#FF8FB8` | Giọt thạch có chỏm, má hồng | Nảy (4), di chuyển nhún (4), chết: vỡ thành giọt (4) | Bẹp xuống 2 khung trước khi nhảy vào |
| Sói xám | 48×40 | Xám tím `#8C86A6` | Tai nhọn, mõm dài, khăn đỏ băng nhóm | Đi (6), chạy (6), cắn (4), chết (4) | Hạ thấp người, lùi nửa bước 0.3s |
| Vua Goblin (boss) | 96×96 | Xanh rêu `#7BAA4E`, áo choàng đỏ | Bụng phệ, vương miện vàng, chuỳ gai | Đi (6), đập thường (6), **đập đất** (10), choáng (4), chết (8) | Giơ chuỳ lên cao, chuỳ loé trắng, vòng đỏ trên đất đầy dần 1.2s |
| Nấm Lùn (đề xuất) | 32×32 | Đỏ chấm trắng | Mũ nấm to, thân ngắn | Đi (4), phun bào tử (6) | Mũ phồng lên trước khi phun |
| Ong Bắp Cày (đề xuất) | 32×32 | Vàng sọc nâu | Thân tròn, cánh trong | Bay (4, lặp liên tục), lao chích (4) | Lùi lại và rung cánh nhanh 0.4s |

**Quy tắc báo đòn:** quái thường lấy đà tối thiểu 300 ms, boss tối thiểu 1 giây. Vòng đỏ trên đất chỉ dùng cho đòn vùng, đòn đơn chỉ cần tư thế lấy đà. Người chơi phải có đủ thời gian bấm Lướt.

**Biến thể rẻ:** đổi màu (palette swap) để có quái cấp cao hơn mà không vẽ lại, ví dụ Thạch Tím Lv6, Sói tuyết Lv9.

## Môi trường, UI và danh sách asset

**Môi trường:** làng gạch be ấm, mái ngói đỏ, đài phun nước xanh; rừng cỏ hai tông xanh với hoa vàng–hồng rải rác; đấu trường boss lát đá xám bao quanh bởi vòng đá. Cây và nhà vẽ **cao hơn 1 ô** (phần tán/mái đè lên ô phía trên) để có chiều sâu 3/4, và đặt ở layer riêng để nhân vật đi ra sau được.

**UI:** nút tròn viền tím đậm, nền nâu gỗ trong suốt 60%, chữ trắng viền đen. Thanh máu đỏ, XP tím, Nộ vàng cam. Logo chữ "Happy Land" dạng pixel bo tròn, màu vàng `#F2C14E` viền tím đậm, có một ngọn cỏ mọc trên chữ L.

| Asset | Số lượng | Ưu tiên |
| --- | --- | --- |
| Nhân vật 3 lớp: idle, đi, đánh thường × 3 hướng | khoảng 135 khung | 1 |
| Tileset làng + rừng + đấu trường (32×32) | khoảng 60 ô | 1 |
| Thạch Hồng, Sói xám (đủ animation) | khoảng 50 khung | 1 |
| Icon 9 vũ khí + vàng + bình máu | 11 | 1 |
| Vua Goblin | khoảng 40 khung | 2 |
| VFX đánh thường + chiêu + lướt | 9 hiệu ứng | 2 |
| Nhân vật: chiêu, lướt, trúng đòn, gục ngã | khoảng 150 khung | 2 |
| Tuyệt chiêu: 3 animation nhân vật + 3 VFX | khoảng 50 khung | 3 |
| Vũ khí cầm tay × 3 hướng | 27 | 3 |
| UI: nút, khung túi đồ 9-slice, logo, icon app | khoảng 15 | 3 |
| Nấm Lùn, Ong Bắp Cày | khoảng 40 khung | 4 |

**Thứ tự làm:**

1. Chốt bảng màu 32 màu và 1 nhân vật (Chiến binh idle + đi) làm chuẩn tỉ lệ.
2. Vẽ tileset rừng và làng, ráp thử với nhân vật trên điện thoại thật, chỉnh độ tương phản.
3. Hoàn thiện 2 lớp còn lại và 2 quái thường, thay vào game để test cảm giác.
4. Boss + VFX chiêu, rồi tới tuyệt chiêu (cần thêm logic thanh Nộ ở server).
5. UI, logo và icon app cuối cùng.

**Quy cách file:**

- Vẽ bằng Aseprite, mỗi nhân vật/quái 1 file `.aseprite`, animation đặt bằng tag (`idle_down`, `walk_side`, `attack_up`...).
- Xuất spritesheet PNG + JSON (Array, có frameTags) để Phaser đọc bằng `load.aseprite()`.
- Tên file khớp key texture trong code: `hero_warrior`, `mob_slime`, `mob_boss`, `drop_weapon`...
- Tileset xuất PNG 32×32 không khoảng cách, vẽ map bằng Tiled, xuất JSON.
- Không khử răng cưa, không viền bán trong suốt; nền trong suốt hoàn toàn.

Concept trong tài liệu này được dựng nhanh bằng code để chốt hướng màu và dáng, chưa phải art cuối.
