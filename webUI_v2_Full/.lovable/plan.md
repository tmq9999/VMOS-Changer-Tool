# Plan: Tài liệu tích hợp Backend (Backend Integration Guide)

## Mục tiêu
Tổng hợp toàn bộ chức năng, UI/UX và hợp đồng API vừa được thêm vào frontend thành **một file Markdown duy nhất** để team backend có tài liệu nối tiếp, triển khai endpoint & WebSocket tương thích.

## Vị trí file đề xuất
`docs/backend-integration.md` (hoặc `README-BACKEND.md` tại thư mục gốc nếu dự án chưa có `docs/`).

## Nội dung tài liệu cần viết

### 1. Tổng quan hệ thống
- Mô tả kiến trúc: Frontend (TanStack Start + React) ↔ Backend (FastAPI/HTTP + WebSocket).
- Cơ chế lưu trữ local: `localStorage` dùng cho theme, ngôn ngữ, chế độ chạy, khoảng thời gian Auto, cấu hình Telegram, backend base URL.
- Các route chính: `/`, `/emails`, `/viewer`, `/logs`, `/settings`.

### 2. Giao diện & trải nghiệm người dùng (UI/UX)

#### 2.1 Dark / Light theme
- Nút toggle ở header (`ThemeToggle`).
- Lưu theme vào `localStorage` key `vmos.theme`, tự động áp class `.dark` lên `<html>`.
- Hỗ trợ `prefers-color-scheme` khi chưa có giá trị lưu.

#### 2.2 Màn hình thiết bị (`/viewer`)
- Hiển thị lưới thiết bị VMOS, mỗi ô là một PAD.
- Cho phép chọn số cột (1-6) và số dòng (1-4).
- Hiển thị frame hình ảnh từ endpoint `/api/viewer/frame?pad=<PAD>&t=<tick>`.
- Hiển thị trạng thái online/offline, email đang chạy, log gần nhất của từng PAD.
- Nếu backend chưa có PAD thật, hiển thị demo devices để xem trước layout.

#### 2.3 Nhật ký logs (`/logs`)
- Live tail từ WebSocket, hiển thị timestamp, level, pad, message.
- Lọc theo PAD, level (DEBUG/INFO/WARN/ERROR), tìm kiếm text.
- Tự động cuộn (auto-scroll) có thể bật/tắt.
- Xuất logs ra file `.txt` và xoá logs (gọi API + xoá local).
- **Màu theo level**:
  - ERROR: viền & badge đỏ (`rose`).
  - WARN: viền & badge vàng (`amber`).
  - DEBUG: muted.
  - INFO: xanh (`sky`).

### 3. Chế độ chạy Auto / Manual

#### 3.1 Cấu hình
- Lưu ở `localStorage`:
  - `vmos.runMode`: `"auto" | "manual"`.
  - `vmos.autoIntervalMin`: số phút (tối thiểu 1, mặc định 5).

#### 3.2 Hành vi Auto mode
- Frontend tự động gọi `POST /api/sheets/load` theo chu kỳ.
- Nếu có email mới (`loaded > 0`):
  - Hiển thị toast thông báo.
  - Gửi Telegram (nếu bật).
  - Kiểm tra không có worker/job nào đang chạy (qua store + `GET /api/jobs`).
  - Tự động gọi `POST /api/run/start` để khởi chạy.
- Manual mode: chỉ chạy khi người dùng bấm Start ở Dashboard.

### 4. Google Sheet settings

#### 4.1 Các field cấu hình
- `service_account_json`: nội dung file JSON Service Account.
- `spreadsheet_id`: ID Google Sheet.
- `sheet_name`: tên sheet.
- `data_start_row`: dòng bắt đầu đọc dữ liệu (mặc định 2).
- `skip_successful`: bỏ qua các dòng đã đánh dấu SUCCESS.

#### 4.2 Upload Service Account JSON
- Người dùng upload file `.json`.
- Frontend validate: phải có `client_email` và `type === "service_account"`.
- Nội dung file được điền vào textarea `service_account_json`.

#### 4.3 Test kết nối Sheet
- Nút "Kiểm tra kết nối" gọi `POST /api/sheets/test`.
- Nếu backend trả về 404/405, frontend fallback báo "OK" (vì chưa có endpoint).
- Backend cần trả về: `{ ok: boolean, rows?: number, title?: string, error?: string }`.

### 5. Thông báo Telegram

#### 5.1 Cấu hình
- Lưu ở `localStorage` key `vmos.telegram`:
  - `bot_token`
  - `chat_id`
  - `thread_id` (tuỳ chọn, dùng cho group topic)
  - `enabled`: bật/tắt gửi thông báo

#### 5.2 Test kết nối Telegram
- Gọi trực tiếp `POST https://api.telegram.org/bot<BOT_TOKEN>/sendMessage` từ browser.
- Body gồm `chat_id`, `text`, `parse_mode: "HTML"`, `disable_web_page_preview: true`, và `message_thread_id` nếu có `thread_id`.

#### 5.3 Toggle trên Dashboard
- Switch "Gửi Telegram" trong card điều khiển.
- Khi bật, các sự kiện sau sẽ gửi Telegram:
  - Start / Stop run
  - Thêm email thủ công
  - Tải từ Google Sheet
  - Các thông báo trong Auto mode

### 6. Hợp đồng API backend cần cung cấp

#### 6.1 REST endpoints
| Method | Path | Body | Response | Mô tả |
|--------|------|------|----------|-------|
| GET | `/api/stats` | - | `StatsResponse` | Thống kê tổng quan |
| GET | `/api/jobs` | - | `JobRow[]` hoặc `{ jobs: JobRow[] }` | Danh sách job |
| GET | `/api/logs?limit=&pad=&level=` | - | `LogEntry[]` | Lấy logs |
| DELETE | `/api/logs` | - | `{ ok }` | Xoá logs |
| POST | `/api/emails/validate` | `{ text }` | `ValidateResult` | Validate email hàng loạt |
| POST | `/api/emails/add` | `{ text }` | `AddResult` | Thêm email vào hàng đợi |
| POST | `/api/sheets/load` | - | `SheetLoadResult` | Tải email từ Google Sheet |
| POST | `/api/sheets/test` | - | `SheetTestResult` | Test kết nối Sheet |
| GET | `/api/pads` | - | `PadsResult` | Lấy danh sách PAD |
| POST | `/api/run/start` | `{ pad_codes?: string[] \| null }` | `{ ok, error? }` | Bắt đầu chạy |
| POST | `/api/run/stop` | - | `{ ok }` | Dừng chạy |
| POST | `/api/queue/clear` | - | `{ ok }` | Xoá hàng đợi |
| GET | `/api/settings` | - | `AppSettings` | Lấy cài đặt |
| POST | `/api/settings` | `Partial<AppSettings>` | `{ ok }` | Lưu cài đặt |
| GET | `/api/viewer/frame?pad=...` | - | image/jpeg/png | Frame hình ảnh thiết bị |

#### 6.2 WebSocket (`/ws`)
- Frontend mở WebSocket tại `/ws` (hoặc qua `wsUrl` nếu backend chạy khác origin).
- Các message type frontend xử lý:
  - `snapshot`: toàn bộ state workers.
  - `worker_update`: cập nhật một worker theo `pad`.
  - `job_update`: cập nhật job theo `pad`.
  - `log`: log entry mới với `ts`, `level`, `message`, và tùy chọn `pad`.

#### 6.3 Các interface dữ liệu
Tài liệu cần liệt kê đầy đủ các type/interface:
- `JobRow`
- `StatsResponse`
- `ValidateResult`
- `AddResult`
- `SheetLoadResult`
- `PadsResult`
- `AppSettings`
- `LogEntry`
- `WorkerState`

### 7. Các file frontend liên quan
- `src/lib/theme.tsx`, `src/components/theme-toggle.tsx`
- `src/routes/viewer.tsx`
- `src/routes/logs.tsx`
- `src/lib/run-mode.ts`, `src/hooks/useAutoMode.ts`
- `src/lib/telegram.ts`
- `src/routes/settings.tsx`, `src/routes/index.tsx`
- `src/lib/api.ts`, `src/lib/store.ts`, `src/hooks/useBackendSocket.ts`
- `src/lib/i18n.tsx`

### 8. Lưu ý cho backend
- `service_account_json` được gửi nguyên văn trong `AppSettings`, backend cần lưu trữ an toàn (không log).
- `skip_successful` cần backend xử lý khi đọc Sheet (bỏ qua dòng đã SUCCESS).
- Auto mode hoàn toàn chạy ở frontend; backend chỉ cần đảm bảo các endpoint `/api/sheets/load`, `/api/jobs`, `/api/run/start` hoạt động.
- Telegram do frontend gọi trực tiếp Telegram Bot API; backend không cần proxy trừ khi muốn chuyển logic về server.
- WebSocket cần tự động reconnect với khoảng cách ~3 giây.

## Cách thực hiện
1. Tạo thư mục `docs/` (nếu chưa có).
2. Viết file `docs/backend-integration.md` với cấu trúc trên.
3. Sao chép các interface TypeScript từ `src/lib/api.ts` và `src/lib/store.ts` vào phụ lục.
4. Kiểm tra lại tính đầy đủ của các endpoint và WebSocket message format.
5. Không cần thay đổi code frontend — chỉ tạo tài liệu.

## Deliverable
- File `docs/backend-integration.md` đầy đủ, rõ ràng, có thể đưa cho backend đọc và triển khai.