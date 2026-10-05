# Antigravity Agent Guidelines for Vùng Đất Tinh Linh (Happy Land)

## Quy Tắc Chạy Local: Luôn chạy Production Local
- **Yêu cầu cốt lõi**: Luôn chạy bản build **Production Local** cho cả Server và Client để đạt tốc độ tối đa, tải nhanh và không bị giật lag (zero HMR overhead).
- **Client (Frontend)**:
  - Khi có thay đổi code: chạy `npm run build` trong `client/`
  - Chạy service: `npm run preview` trong `client/` (cổng `5173`, serve thư mục `dist/`, proxy tự động `/ws` và `/api` sang `http://localhost:2567`).
- **Server (Backend)**:
  - Chạy service: `npm start` trong `server/` (cổng `2567`, chạy Node.js trực tiếp, không dùng watcher `--watch` để giảm tải CPU).
