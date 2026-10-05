# Vùng đất Tinh linh: Cốt truyện & Gameplay

Oct 3, 2026 · @VienBT

Vùng đất Tinh linh chuyển sang thế giới **cổ tích Việt pha kiếm hiệp nhẹ**, giữ art chibi vui. Tài liệu này là đặc tả để agent cập nhật code theo 2 giai đoạn.

## Hướng đi

Tên chính thức: **Vùng đất Tinh linh**. Người chơi Việt nhận ra truyện cổ và chất võ lâm quen thuộc; người nước ngoài thấy một thế giới lạ, dễ thương.

**Ba trụ cột:**

1. **Cổ tích Việt làm nền thế giới.** Mỗi vùng đất lấy cảm hứng từ một truyện dân gian (Thánh Gióng, Thạch Sanh, Sơn Tinh – Thủy Tinh, An Dương Vương, Chú Cuội...).
2. **Hệ thống võ lâm làm khung gameplay.** Môn phái, khinh công, bí kíp, bang hội, nhiệm vụ, nhưng không lấy tên hay cốt truyện từ Kim Dung hay Võ Lâm Truyền Kỳ.
3. **Giọng vui, không u tối.** Quái nghịch ngợm hơn là ác độc, lời thoại hài hước nhẹ, không máu me.

**Giọng văn:**

- Thoại NPC ngắn (tối đa 2 câu một lần), dùng tiếng Việt đời thường pha chút cổ kính: "Này con, rừng đa dạo này lạ lắm!"
- Tên kỹ năng, vật phẩm theo kiểu Hán Việt ngắn gọn hoặc thuần Việt dễ hiểu, tối đa 4 chữ.
- Không biến nhân vật huyền thoại được tôn kính (Thánh Gióng, Lạc Long Quân, Âu Cơ, Kim Quy) thành quái hay đối tượng chế giễu. Họ xuất hiện như truyền thuyết, linh vật bảo hộ, hoặc nguồn gốc của môn phái.
- Chỉ lấy phản diện có sẵn trong truyện (Chằn Tinh, Đại Bàng, Thuồng Luồng) hoặc yêu tinh tự tạo làm kẻ địch.

## Thế giới & cốt truyện chính

**Sợi chỉ chính: tìm lại 4 mảnh Trống Đồng để phong ấn yêu tinh.**

Vùng đất Tinh linh là thung lũng yên bình nhờ **Trống Đồng Linh** đặt ở đình làng. Mỗi mùa hội, tiếng trống giữ yêu tinh ngủ yên trong rừng núi. Năm nay, Mộc Tinh của cây đa cổ lén đánh cắp trống, đập vỡ thành 4 mảnh và chia cho các chúa yêu ở 4 vùng. Yêu tinh thức giấc khắp nơi.

Người chơi là **đệ tử trẻ của 3 môn phái** trong làng. Ông Táo, người giữ bếp lửa đình làng, giao nhiệm vụ: đi qua từng vùng, hạ chúa yêu, mang mảnh trống về. Khi đủ 4 mảnh, trống vang lên và mở ra phần tiếp theo (Thành Cổ Loa, nội dung sau này).

| Vùng | Cảm hứng | Cấp | Quái tiêu biểu | Chúa yêu (boss) | Phần thưởng chính |
| --- | --- | --- | --- | --- | --- |
| 1. Làng Tre & Rừng Đa Cổ | Cây đa, Chú Cuội | 1–8 | Bánh Trôi Tinh, Cáo Tinh | Chúa Mộc Tinh | Mảnh Trống Đồng 1 |
| 2. Đầm Sen & Sông Ma | Truyện ma da, đầm lầy | 8–15 | Ma Da, Cua Đá, Ếch Lửa | Thuồng Luồng | Mảnh Trống Đồng 2 |
| 3. Núi Tản & Hang Đá | Sơn Tinh – Thủy Tinh, Thạch Sanh | 15–22 | Dơi Đá, Rắn Núi | Chằn Tinh | Mảnh Trống Đồng 3 |
| 4. Đỉnh Mây | Thạch Sanh | 22–30 | Quạ Gió, Lính Mây | Đại Bàng Tinh | Mảnh Trống Đồng 4 |

**Bản MVP chỉ có vùng 1**, dùng đúng map hiện tại: làng ở dưới, rừng ở giữa, đấu trường boss ở trên đổi thành gốc đa cổ.

**Nhân vật phụ (NPC) ở làng:**

| NPC | Vai trò | Ghi chú |
| --- | --- | --- |
| Ông Táo | Giao nhiệm vụ chính, kể chuyện | Hài hước, hay than "năm nay chưa kịp về trời" |
| Bà Hàng Nước | Bán bình máu, mua lại đồ | Đứng cạnh giếng làng |
| Chú Cuội | Giao nhiệm vụ phụ ở rừng đa | Hay nói dối vui, nhiệm vụ có cú lừa nhỏ |
| 3 Chưởng môn | Dạy bí kíp, nâng cấp môn phái | Mỗi phái một người, đứng trước cổng phái |

## Môn phái

Ba lớp hiện tại đổi thành ba môn phái, **giữ nguyên chỉ số và cơ chế**, chỉ đổi tên, mô tả và hình ảnh.

| Id trong code (giữ nguyên) | Môn phái | Nguồn cảm hứng | Hình ảnh | Màu chủ đạo |
| --- | --- | --- | --- | --- |
| `warrior` | **Thiết Kiếm Môn** | Thánh Gióng: roi sắt, tre ngà, ngựa sắt | Giáp đồng hoa văn Đông Sơn, nón chóp, khăn đỏ | Đỏ + đồng |
| `archer` | **Lạc Tiễn Cốc** | Nỏ thần Kim Quy, chim Lạc | Áo nâu, khăn vấn, đeo nỏ thay cung, lông chim Lạc trên đầu | Vàng hổ phách + nâu |
| `mage` | **Thủy Phù Quán** | Phép mưa gió sấm sét (Sơn Tinh – Thủy Tinh) | Áo dài xanh, khăn xếp, cầm quạt phép, bùa giấy bay quanh | Xanh dương + tím |

**Mô tả trong màn chọn môn phái** (thay `desc` trong `shared/data.ts`):

- Thiết Kiếm Môn: "Đệ tử noi gương Phù Đổng, giáp dày, cận chiến mạnh."
- Lạc Tiễn Cốc: "Truyền nhân nỏ thần, bắn xa, khinh công nhanh."
- Thủy Phù Quán: "Dùng bùa gọi mưa sấm, đánh lan cả đám quái."

**Kỹ năng** (cơ chế không đổi, chỉ đổi tên và hiệu ứng):

| Ô kỹ năng | Thiết Kiếm Môn | Lạc Tiễn Cốc | Thủy Phù Quán |
| --- | --- | --- | --- |
| Đánh thường | Chém kiếm | Bắn nỏ | Ném bùa nước |
| Chiêu (thay Xoáy kiếm / Tên tán xạ / Thiên thạch) | **Quét Tre Ngà**: quét vòng quanh người | **Nỏ Liên Châu**: 5 mũi hình quạt | **Lôi Phù**: sau 0.6s sét đánh xuống vùng, vòng báo màu **cam viền vàng** (không đỏ) |
| Lướt (đổi tên thành Khinh Công) | Phi thân, vệt bụi đỏ | Lướt gió, lông chim bay | Hoá màn sương xanh |
| Bí kíp trấn phái (tuyệt chiêu, giai đoạn 2) | **Phù Đổng Thiên Vương**: hoá to, nện đất (cơ chế Địa Chấn) | **Nỏ Thần Kim Quy**: mưa tên vàng (cơ chế Mưa Tên Vàng) | **Thủy Long Quyển**: 6 giọt nước xoay quanh người, làm chậm quái (cơ chế Bão Băng Tinh, đổi băng thành nước) |

**Vũ khí** (giữ key, đổi tên hiển thị):

| Key (giữ nguyên) | Tên mới | Bậc |
| --- | --- | --- |
| `wood_sword` | Kiếm Tre | Thường |
| `iron_sword` | Kiếm Đồng Đông Sơn | Hiếm |
| `flame_blade` | Roi Sắt Phù Đổng | Sử thi |
| `short_bow` | Nỏ Tre | Thường |
| `hunter_bow` | Nỏ Đồng | Hiếm |
| `wind_bow` | Nỏ Móng Rùa | Sử thi |
| `oak_staff` | Quạt Giấy | Thường |
| `crystal_staff` | Quạt Lông Hạc | Hiếm |
| `storm_staff` | Quạt Phong Lôi | Sử thi |

Hình vũ khí trong art doc cần vẽ lại theo bảng này: cung thành nỏ, trượng thành quạt.

## Quái & boss

Vùng 1 dùng lại 3 loại quái đang có, **giữ nguyên chỉ số và AI**, chỉ đổi tên và hình.

| Kind trong code (giữ nguyên) | Tên mới | Hình ảnh | Tính cách | Báo đòn |
| --- | --- | --- | --- | --- |
| `slime` | **Bánh Trôi Tinh** | Viên bánh trôi trắng, nhân đường đỏ hình trái tim lộ ra khi bị đánh, mắt tròn | Nảy tưng tưng, chạy theo người chơi như đòi chơi | Bẹp xuống 2 khung rồi nhảy vào |
| `wolf` | **Cáo Tinh** | Cáo cam đuôi bông có đốm lửa ở chóp đuôi, khăn đỏ băng nhóm | Ranh mãnh, lao nhanh | Hạ thấp người, đuôi loé sáng 0.3s |
| `boss` | **Chúa Mộc Tinh** | Gốc đa cổ có mặt, rễ làm tay, tán lá như vương miện, ôm mảnh Trống Đồng | Ngạo mạn, cười khà khà | Đòn **Rễ Đâm**: rễ trồi lên trong vòng đỏ đầy dần 1.2s (thay đòn đập đất) |

Boss nói 1 câu khi người chơi vào đấu trường và 1 câu khi bị hạ, hiện trên đầu boss trong 3 giây:

- Vào trận: "Trống là của ta! Cút về làng mà ăn bánh trôi đi!"
- Bị hạ: "Ối... thôi trả, trả mảnh trống đây..."

**Quái đề xuất cho vùng sau** (chưa làm trong giai đoạn 1 và 2):

| Vùng | Quái | Hành vi |
| --- | --- | --- |
| 2 | Ma Da | Ẩn dưới nước, trồi lên kéo người chơi chậm lại |
| 2 | Ếch Lửa | Đứng xa nhả cầu lửa |
| 2 | Thuồng Luồng (boss) | Rắn nước dài nhiều đốt, quẫy đuôi theo vòng cung |
| 3 | Dơi Đá | Bay theo đàn, đánh nhanh rồi rút |
| 3 | Chằn Tinh (boss) | Trăn khổng lồ, cuộn tròn rồi lao thẳng |
| 4 | Đại Bàng Tinh (boss) | Bay vòng trên cao, sà xuống theo đường kẻ báo trước |

## Hệ thống gameplay

Giai đoạn 2 thêm 3 hệ thống: **thanh Khí + bí kíp trấn phái**, **NPC và chuỗi nhiệm vụ vùng 1**, **Mảnh Trống Đồng**. Bang hội, PK và sự kiện lịch âm để sau.

### Khí và bí kíp trấn phái

| Quy tắc | Giá trị |
| --- | --- |
| Khí tối đa | 100 |
| Gây sát thương lên quái | +2 Khí mỗi lần trúng |
| Nhận sát thương | +3 Khí mỗi lần trúng |
| Ngoài combat | Giữ nguyên, không hao |
| Chết | Về 0 |
| Dùng bí kíp | Cần đủ 100, tiêu hết về 0 |

| Bí kíp | Sát thương | Hiệu ứng thêm |
| --- | --- | --- |
| Phù Đổng Thiên Vương | 300% vùng bán kính 110 px, sau 0.3s lấy đà | Choáng quái 1.2s (quái đứng yên, không đánh) |
| Nỏ Thần Kim Quy | 60% mỗi 0.25s trong 3s, vùng 90 px quanh mục tiêu gần nhất | Không |
| Thủy Long Quyển | 6 giọt nước xoay bán kính 70 px trong 4s, chạm quái 80% (mỗi quái tối đa 1 lần / 0.5s) | Làm chậm 40% trong 1.5s |

Server quyết định toàn bộ: client gửi `{ t: 'ult' }`, server kiểm tra đủ Khí. `SelfState` thêm trường `khi`. Nút bí kíp nằm phía trên nút chiêu, sáng và rung nhẹ khi đầy.

### NPC và nhiệm vụ

- NPC là thực thể tĩnh do server định nghĩa (id, tên, toạ độ), gửi kèm snapshot hoặc gửi một lần khi vào game.
- Người chơi đứng trong 48 px quanh NPC thì hiện nút **Nói chuyện**, bấm mở hộp thoại Preact (tối đa 2 câu mỗi trang, nút Tiếp).
- Trạng thái nhiệm vụ lưu trong `Profile.quests: Record<string, number>` (id nhiệm vụ → bước hiện tại). Hồ sơ cũ không có trường này thì coi là rỗng.
- Tiến độ đếm phía server (giết quái, nhặt vật phẩm).

**Chuỗi nhiệm vụ vùng 1 "Bếp Lửa Đình Làng"** (Ông Táo giao):

1. Nói chuyện với Ông Táo. Thoại: "Trống Đồng mất rồi! Yêu tinh rừng đa náo loạn cả lên."
2. Hạ 8 Bánh Trôi Tinh. Thưởng 40 XP, 2 bình máu.
3. Nhặt 3 **Lá Đa Cổ** (Cáo Tinh rơi 35%, chỉ rơi khi đang làm bước này). Thưởng 80 XP, 30 vàng.
4. Hạ Chúa Mộc Tinh. Mọi người tham gia đánh đều được tính.
5. Mang **Mảnh Trống Đồng 1** về cho Ông Táo. Thưởng 200 XP, 1 vũ khí Hiếm đúng môn phái, mở khoá danh hiệu "Người Giữ Trống".

**Nhiệm vụ phụ của Chú Cuội** (tuỳ chọn): "Tìm con trâu bị lạc" ở rừng. Khi tìm được, trâu thật ra là một Bánh Trôi Tinh đội lốt và nhảy ra đánh. Thưởng 1 bình máu và câu thoại "Hì, Cuội nói dối tí thôi mà".

### Mảnh Trống Đồng

- Vật phẩm cốt truyện, không chiếm ô túi đồ, không rơi khi chết, không bán được.
- Hiển thị dạng 4 ô trên màn hình nhân vật; mảnh nào đã có thì sáng lên.
- Mỗi mảnh cho chỉ số vĩnh viễn nhỏ: +5% máu tối đa.

### Để sau (chưa làm)

- **Bang hội:** tạo bang, chat bang, đánh boss bang theo tuần.
- **Tỷ thí:** đấu tay đôi có đồng ý, không cướp đồ.
- **Sự kiện lịch âm:** Tết (Ông Táo về trời ngày 23 tháng Chạp, nhiệm vụ đưa ông lên trời), Trung Thu (Chú Cuội, rước đèn, săn Thỏ Ngọc).

## Hướng dẫn cho agent

Làm **giai đoạn 1 trước, xong và test xong mới sang giai đoạn 2**. Repo `happy-land/` gồm `shared/` (dữ liệu, map, giao thức dùng chung), `server/` (Node 22 + ws, mô phỏng trong `src/world.ts`), `client/` (Phaser 3 + Preact).

### Ràng buộc bắt buộc

- **Không đổi id nội bộ:** `warrior`/`archer`/`mage`, key vũ khí (`wood_sword`...), kind quái (`slime`/`wolf`/`boss`), key texture. Nhân vật đã lưu chứa các id này; đổi sẽ hỏng save. Chỉ đổi tên hiển thị và mô tả.
- **Server quyết định mọi thứ** (sát thương, Khí, tiến độ nhiệm vụ). Client chỉ gửi yêu cầu và hiển thị.
- File trong `shared/` và `server/` chỉ dùng TypeScript "xoá được" (không `enum`, không `namespace`, không parameter properties), import có đuôi `.ts`, import kiểu dùng `import type`. Server chạy bằng `node --experimental-strip-types`.
- Hồ sơ cũ thiếu trường mới (`quests`, `drumPieces`) phải được điền mặc định khi tải trong `server/src/store.ts`.
- Mọi chữ hiển thị bằng tiếng Việt có dấu.
- `cd server && npm test` phải pass sau mỗi giai đoạn; thêm test cho tính năng mới vào `server/test/sim.test.ts`.

### Giai đoạn 1: đổi bối cảnh (không đổi cơ chế)

| File | Việc cần làm |
| --- | --- |
| `shared/data.ts` | Đổi `name`, `desc`, `skill.name`, `skill.desc` của 3 lớp; `name` của 9 vũ khí; `name` của 3 quái theo các bảng ở trên |
| `client/src/ui/App.tsx` | Tiêu đề sảnh "Vùng đất Tinh linh", phụ đề "Nhập vai online màn hình dọc"; nhãn "Chọn lớp" thành "Chọn môn phái"; nút "Lướt" thành "Khinh Công"; cập nhật dòng gợi ý điều khiển |
| `client/index.html`, `client/public/manifest.webmanifest` | Tên đầy đủ "Vùng đất Tinh linh", tên ngắn "Tinh Linh" |
| `client/src/game/textures.ts` | Vẽ lại hình tạm: `mob_slime` thành bánh trôi trắng nhân đỏ; `mob_wolf` thành cáo cam đuôi bông; `mob_boss` thành gốc cây có mặt và tán lá; vòng báo chiêu Lôi Phù đổi sang cam viền vàng trong `WorldScene.ts` |
| `shared/map.ts` | Giữ nguyên bố cục và va chạm; chỉ đổi chú thích (đài phun nước thành giếng làng, đấu trường thành gốc đa cổ) |
| `client/src/game/textures.ts` (map) | Đài phun nước vẽ thành giếng làng; thêm một cây đa lớn trang trí cạnh giếng (chỉ là hình, không thêm va chạm) |
| `server/src/world.ts` | Câu thoại của boss khi vào trận và khi bị hạ (sự kiện `sys` hoặc sự kiện mới `say` gắn với id boss) |
| `README.md` | Cập nhật tên game, bảng môn phái, vũ khí, quái |

**Nghiệm thu giai đoạn 1:**

- [ ] Màn tạo nhân vật hiện 3 môn phái với tên và mô tả mới
- [ ] Tên vũ khí trong túi đồ và thông báo nhặt đồ dùng tên mới
- [ ] Thông báo hạ boss hiện "Chúa Mộc Tinh"
- [ ] Nhân vật tạo trước khi cập nhật vẫn vào game được, giữ cấp và đồ
- [ ] `npm test` pass, `npm run build` ở client không lỗi

### Giai đoạn 2: hệ thống mới

| Hạng mục | Server | Shared | Client |
| --- | --- | --- | --- |
| Khí + bí kíp | Cộng/trừ Khí theo bảng; xử lý `ult`; choáng, làm chậm, vùng sát thương kéo dài | Thêm `{ t: 'ult' }` vào `ClientMsg`, `khi` vào `SelfState`; số liệu bí kíp vào `data.ts` | Thanh Khí màu vàng cam dưới thanh XP; nút bí kíp; phím R trên máy tính; VFX tạm bằng hình học |
| NPC | Danh sách NPC tĩnh (Ông Táo, Bà Hàng Nước, Chú Cuội) ở làng | Kiểu `NpcSnap`, thoại để trong `shared/story.ts` | Vẽ NPC, nút Nói chuyện, hộp thoại |
| Nhiệm vụ | `Profile.quests`; đếm tiến độ khi giết quái, nhặt Lá Đa Cổ; trả thưởng | Định nghĩa chuỗi "Bếp Lửa Đình Làng" và nhiệm vụ Chú Cuội trong `shared/story.ts` | Khung nhiệm vụ nhỏ góc trái: tên bước + tiến độ (vd: 5/8) |
| Mảnh Trống Đồng | `Profile.drumPieces: number[]`; +5% máu mỗi mảnh trong `statsFor` | Thêm tham số số mảnh vào `statsFor` | 4 ô mảnh trống trong túi đồ |
| Bà Hàng Nước | Mua bình máu 10 vàng/bình, bán vũ khí lấy vàng (Thường 5, Hiếm 25, Sử thi 100) | Bảng giá trong `data.ts` | Hộp thoại mua bán đơn giản |

**Nghiệm thu giai đoạn 2:**

- [ ] Đánh quái liên tục khoảng 25–30 giây thì đầy Khí; bí kíp chỉ dùng được khi đủ 100
- [ ] Mỗi môn phái dùng bí kíp ra đúng hiệu ứng (choáng / mưa tên / làm chậm), test server cho cả 3
- [ ] Đi hết chuỗi "Bếp Lửa Đình Làng" bằng 2 người chơi cùng lúc, cả hai đều nhận Mảnh Trống Đồng 1
- [ ] Lá Đa Cổ chỉ rơi khi người chơi đang ở bước 3
- [ ] Thoát game giữa chừng rồi vào lại vẫn giữ đúng bước nhiệm vụ
- [ ] Không thể dùng bí kíp, mua bán, nhận thưởng nhiệm vụ bằng cách gửi gói tin giả từ client

**Ngoài phạm vi cả 2 giai đoạn:** vùng 2–4, bang hội, tỷ thí, sự kiện lịch âm, art thật (làm theo doc Vùng đất Tinh linh — Art Design).
