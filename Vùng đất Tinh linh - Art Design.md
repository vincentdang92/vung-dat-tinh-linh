# Vùng đất Tinh linh — Art Design

Oct 3, 2026 · @VienBT

## Định hướng art

Vùng đất Tinh linh dùng **pixel art chibi, góc nhìn 3/4 từ trên xuống**, màu tươi ấm như một buổi chiều nắng. Lý do: rẻ và nhanh để một người làm, phóng to nét căng trên điện thoại, và nhân vật chibi đầu to đọc rõ dù chỉ cao 32px.

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

**Lưu ý kỹ thuật:** nhân vật người chơi và NPC đã là sprite pixel art 3/4 có hướng, **dựng bằng code** trong `client/src/game/sprites/` (lưới điểm ảnh 48×48, vẽ theo lớp bộ phận, tự viền). `WorldScene.ts` chọn animation theo hướng mặt, không còn xoay ảnh. Texture dùng lọc nearest riêng, không bật `pixelArt` toàn game để chữ vẫn mịn.

## Nhân vật

Mỗi môn phái nhận ra được chỉ bằng **dáng đầu và màu áo**, kể cả khi nhỏ trên màn hình: nón chóp đồng có tua đỏ, khăn vấn cắm lông chim Lạc, khăn xếp tím.

| Môn phái (key) | Dáng nhận diện | Màu chính | Trang phục | Vũ khí mặc định |
| --- | --- | --- | --- | --- |
| Thiết Kiếm Môn (`warrior`) | Nón chóp đồng có tua đỏ, 2 đuôi khăn đỏ bay sau lưng | Đỏ `#E0533D`, đồng `#E3B05B` | Áo đỏ, giáp ngực đồng khắc ngôi sao trống Đông Sơn | Kiếm Tre |
| Lạc Tiễn Cốc (`archer`) | Khăn vấn hổ phách, 1 lông chim Lạc dựng cao | Hổ phách `#F2B33D`, nâu `#8A5A33` | Áo nâu viền hổ phách, dây đeo chéo, ống tên sau lưng | Nỏ Tre |
| Thủy Phù Quán (`mage`) | Khăn xếp tím tròn, quạt xoè | Xanh `#4F6FE0`, tím `#8E5BD6` | Áo dài xanh chấm đất; 2 lá bùa vàng bay quanh người (code vẽ, không nằm trong sprite) | Quạt Giấy |

**Quy cách:** khung 48×48, chân ở hàng 41 (đặt giữa bóng elip), đầu khoảng 20 px, thân khoảng 16 px. Vẽ 3 hướng (xuống, lên, ngang phải); ngang trái lật từ ngang phải.

**Animation hiện có** (mỗi phái × 3 hướng):

| Animation | Số khung | Tốc độ | Ghi chú |
| --- | --- | --- | --- |
| Đứng (idle) | 2 | 3 khung/giây, lặp | Thở 1 px |
| Đi | 4 | 9 khung/giây, lặp | Bật khi nhân vật dịch chuyển |
| Đánh thường | 3 | 12 khung/giây, 1 lần | Lấy đà → trúng → thu về; quay về phía mục tiêu của sự kiện `atk` |

Để sau: chiêu (6), khinh công (3), trúng đòn (2, hiện nháy trắng bằng code), gục ngã (4), dáng bí kíp (8).

**Đổi vũ khí:** vũ khí được vẽ theo góc cầm tay ở từng tư thế rồi ghép vào thân khi dựng sheet. Mỗi cặp phái + vũ khí là một sheet riêng (`hero_<phái>__<vũ khí>`), dựng lười khi cần. Snapshot đã có trường `w` nên đổi vũ khí là hình đổi ngay, không cần sửa server.

## NPC Làng Tre

NPC đứng yên nên chỉ vẽ hướng xuống. Mỗi NPC có một **prop tách riêng** đặt cạnh, có chiều sâu riêng.

| NPC (key) | Ngoại hình | Prop | Idle | Khi đang nói chuyện |
| --- | --- | --- | --- | --- |
| Ông Táo (`tao`) | Ông lão bụ bẫm, râu bạc dài, má đỏ, khăn xếp đen điểm vàng, áo cam đỏ viền vàng, cầm muôi gỗ | Kiềng ba chân có lửa (3 khung nhấp nháy) | 4 khung, có động tác vuốt râu | 2 khung nhún, mở miệng |
| Bà Hàng Nước (`nuoc`) | Bà cụ nón lá, khăn mỏ quạ, áo tứ thân nâu, môi đỏ ăn trầu, ngồi ghế đẩu, phe phẩy quạt nan | Bàn gỗ với ấm và 2 bát chè xanh | 4 khung, quạt lên xuống | 2 khung nhún |
| Chú Cuội (`cuoi`) | Chàng trai tóc rối, áo cánh chàm, quần nâu xắn ống, chân trần, nón rơm đeo sau lưng, cầm sáo trúc ngang ngực | Cây đa non có rễ phụ | 4 khung, nháy mắt | 2 khung nhún, cười |

Màu đại diện của Chú Cuội là **chàm `#3E5BA9`** (không dùng xanh lá).

**Dấu nhiệm vụ trên đầu NPC** (code vẽ, nhấp nhô, lấy từ `quests`/`questProg`/`drumPieces`):

- `!` vàng: có nhiệm vụ mới để nhận.
- `?` vàng: đủ điều kiện, quay về trả.
- `?` xám: đang làm dở.

## Vũ khí

Độ hiếm phải nhìn ra được trong nửa giây, nhờ **ba lớp tín hiệu cộng dồn**: chất liệu, màu viền, và hiệu ứng phát sáng.

| Bậc | Màu khung UI | Chất liệu | Hiệu ứng trong game |
| --- | --- | --- | --- |
| Thường | Xám `#BDBDBD` | Tre, gỗ, giấy | Không |
| Hiếm | Xanh `#4AA3FF` | Đồng, 1 viên đá xanh | Quầng sáng xanh khi rơi trên đất |
| Sử thi | Tím `#A061FF` | Dáng riêng, có nguyên tố | Quầng sáng tím khi rơi; lửa, sét hoặc hạt sáng trên vũ khí |

| Vũ khí (key) | Môn phái | Bậc | Mô tả hình |
| --- | --- | --- | --- |
| Kiếm Tre (`wood_sword`) | Thiết Kiếm Môn | Thường | Lưỡi tre vàng `#D8C27A` có đốt (không dùng xanh lá để khỏi chìm vào cỏ) |
| Kiếm Đồng Đông Sơn (`iron_sword`) | Thiết Kiếm Môn | Hiếm | Lưỡi đồng, đá xanh ở chắn tay |
| Roi Sắt Phù Đổng (`flame_blade`) | Thiết Kiếm Môn | Sử thi | Roi sắt nhiều đốt, đầu roi rực lửa |
| Nỏ Tre (`short_bow`) | Lạc Tiễn Cốc | Thường | Thân và cánh nỏ bằng tre |
| Nỏ Đồng (`hunter_bow`) | Lạc Tiễn Cốc | Hiếm | Báng gỗ sẫm, cánh đồng, đá xanh |
| Nỏ Móng Rùa (`wind_bow`) | Lạc Tiễn Cốc | Sử thi | Cánh vàng, mũi móng rùa ngọc lam, hạt sáng tím |
| Quạt Giấy (`oak_staff`) | Thủy Phù Quán | Thường | Giấy kem, nan nâu |
| Quạt Lông Hạc (`crystal_staff`) | Thủy Phù Quán | Hiếm | Lông trắng mép xám, đá xanh |
| Quạt Phong Lôi (`storm_staff`) | Thủy Phù Quán | Sử thi | Quạt tím sẫm, viền vàng, tia sét |

**Mỗi vũ khí có 2 dạng hình:** sprite cầm tay ghép trong sheet nhân vật (3 hướng × mọi tư thế), và **icon 24×24** (`wpn_<key>`) dùng chung cho túi đồ, ô trang bị, cửa hàng và đồ rơi trên đất (code thêm nhún lên xuống và quầng sáng theo độ hiếm).

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

Quái trong Vùng đất Tinh linh **dễ thương nhưng có ý đồ xấu**: dáng tròn, mắt to, nhưng luôn có một chi tiết "nghịch" (mắt đỏ, nanh, khăn quàng của băng nhóm). Slime đổi từ xanh lá sang **hồng** để không chìm vào cỏ.

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

**UI:** nút tròn viền tím đậm, nền nâu gỗ trong suốt 60%, chữ trắng viền đen. Thanh máu đỏ, XP tím, Nộ vàng cam. Logo chữ "Vùng đất Tinh linh" dạng pixel bo tròn, màu vàng `#F2C14E` viền tím đậm, có một ngọn cỏ mọc trên chữ L.

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
