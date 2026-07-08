# VMOS Changer — Backend Integration Guide

Tài liệu này tổng hợp toàn bộ chức năng, UI/UX và hợp đồng API giữa **Frontend (TanStack Start + React)** và **Backend (FastAPI/HTTP + WebSocket)** đã được triển khai trên frontend. Backend team dùng tài liệu này để xây dựng/tương thích các endpoint, WebSocket message và xử lý dữ liệu.

---

## 1. Tổng quan kiến trúc

```text
┌─────────────────┐      HTTP/REST       ┌─────────────────┐
│   Web UI        │  <---------------->  │   Backend API   │
│  (React 19)     │      WebSocket       │   (FastAPI)     │
│                 │  <---------------->  │                 │
└─────────────────┘                      └─────────────────┘
```

- Frontend chạy trên TanStack Start, sử dụng file-based routing tại `src/routes/`.
- Giao tiếp backend qua REST API và WebSocket realtime.
- Một số cấu hình được lưu trữ cục bộ trên trình duyệt (`localStorage`) để giảm tải backend và cho phép tuỳ chỉnh nhanh.

### Các route chính

| Route | Mô tả |
|-------|-------|
| `/` | Dashboard: điều khiển, KPI, logs live, thêm email nhanh |
| `/emails` | Quản lý email: dán hàng loạt, tải từ Google Sheet, xem hàng đợi |
| `/viewer` | Màn hình thiết bị VMOS (chỉ xem) |
| `/logs` | Nhật ký logs với lọc và màu theo level |
| `/settings` | Cài đặt backend, VMOS API, Google Sheet, Telegram, chế độ chạy |

### localStorage keys được sử dụng

| Key | Giá trị | Mô tả |
|-----|---------|-------|
| `vmos.theme` | `"light" \| "dark"` | Theme giao diện |
| `vmos.lang` | `"vi" \| "en"` | Ngôn ngữ |
| `vmos.backendBase` | string (URL) | Base URL backend, để trống = cùng origin |
| `vmos.runMode` | `"auto" \| "manual"` | Chế độ chạy |
| `vmos.autoIntervalMin` | number (phút) | Chu kỳ tự động tải Sheet |
| `vmos.telegram` | JSON string | Cấu hình Telegram |

---

## 2. Giao diện & trải nghiệm người dùng (UI/UX)

### 2.1 Dark / Light theme

- Nút toggle theme nằm ở header bên cạnh language switcher.
- Theme được lưu vào `localStorage` key `vmos.theme`.
- Khi toggle, class `.dark` được thêm/xoá khỏi `<html>` và `color-scheme` được cập nhật.
- Lần đầu mở app, nếu chưa có theme lưu, sẽ tự động theo `prefers-color-scheme` của hệ thống.

### 2.2 Màn hình thiết bị (`/viewer`)

- Hiển thị danh sách thiết bị VMOS dưới dạng lưới (grid), mỗi ô là một PAD.
- Người dùng có thể chọn số cột (1-6) và số dòng (1-4) để điều chỉnh layout.
- Mỗi ô hiển thị:
  - Mã PAD.
  - Badge trạng thái online/offline.
  - Hình ảnh frame từ backend.
  - Email đang chạy trên thiết bị (nếu có).
  - Log gần nhất của thiết bị.
- Nếu backend chưa trả về PAD thật, frontend hiển thị demo devices để xem trước layout.

**Endpoint frame:**

```text
GET /api/viewer/frame?pad=<PAD_CODE>&t=<TICK>
```

- `pad`: mã thiết bị.
- `t`: timestamp/cache-buster, frontend tăng mỗi 2 giây.
- Response: ảnh JPEG/PNG.

### 2.3 Nhật ký logs (`/logs`)

- Live tail logs từ WebSocket.
- Hiển thị: timestamp, level, pad, message.
- Các tính năng:
  - Lọc theo PAD (dropdown từ danh sách workers).
  - Lọc theo level: `ALL`, `DEBUG`, `INFO`, `WARN`, `ERROR`.
  - Tìm kiếm text trong message.
  - Tự động cuộn (auto-scroll) có thể bật/tắt.
  - Xuất logs ra file `vmos-logs-<timestamp>.txt`.
  - Xoá logs (gọi API `DELETE /api/logs` và xoá local store).

**Màu sắc theo level:**

| Level | Badge | Viền trái |
|-------|-------|-------------|
| `ERROR` | Đỏ (`rose`) | Đỏ |
| `WARN` | Vàng (`amber`) | Vàng |
| `DEBUG` | Muted | Trong suốt |
| `INFO` | Xanh (`sky`) | Xanh |

---

## 3. Chế độ chạy Auto / Manual

### 3.1 Cấu hình

Lưu trữ tại `localStorage`:

- `vmos.runMode`: `"auto"` hoặc `"manual"`.
- `vmos.autoIntervalMin`: số phút, tối thiểu `1`, mặc định `5`.

Cấu hình này nằm trong tab **"Chế độ chạy"** của trang Settings.

### 3.2 Hành vi Auto mode

Khi `runMode = "auto"`:

1. Frontend tự động gọi `POST /api/sheets/load` theo chu kỳ `autoIntervalMin` phút.
2. Sau khi tải, nếu có email mới (`loaded > 0`):
   - Hiển thị toast: `Auto: +{loaded} email từ Sheet`.
   - Gửi thông báo Telegram (nếu bật).
   - Kiểm tra xem có worker/job nào đang chạy không:
     - Qua `useAppStore` workers state.
     - Qua `GET /api/jobs`, tìm job có `status === "running"`.
   - Nếu không có worker/job đang chạy, tự động gọi `POST /api/run/start`.
   - Gửi Telegram khi tự động khởi chạy thành công hoặc thất bại.

### 3.3 Hành vi Manual mode

- Frontend **không** tự động gọi Sheet load hay start run.
- Người dùng phải bấm nút **Start** trên Dashboard hoặc **Tải Sheet** thủ công.

---

## 4. Google Sheet settings

### 4.1 Các field cấu hình

| Field | Type | Mô tả |
|-------|------|-------|
| `service_account_json` | string (JSON) | Nội dung file JSON Service Account |
| `spreadsheet_id` | string | ID Google Sheet |
| `sheet_name` | string | Tên sheet cụ thể |
| `data_start_row` | number | Dòng bắt đầu đọc dữ liệu, mặc định `2` |
| `skip_successful` | boolean | Bỏ qua các dòng đã đánh dấu `SUCCESS` |

Các field này là một phần của `AppSettings`, được lưu qua `POST /api/settings`.

### 4.2 Upload Service Account JSON

- Người dùng bấm nút **"Tải lên file JSON"** để chọn file `.json`.
- Frontend validate client-side:
  - File phải parse được thành JSON.
  - Phải có trường `client_email`.
  - Phải có `type === "service_account"`.
- Nếu hợp lệ, nội dung JSON được điền vào textarea `service_account_json`.

### 4.3 Test kết nối Sheet

- Nút **"Kiểm tra kết nối"** gọi `POST /api/sheets/test`.
- Trước khi gọi, frontend validate JSON có `client_email`.
- Frontend tự động lưu settings hiện tại (`POST /api/settings`) để backend dùng đúng cấu hình khi test.
- Nếu backend trả về `404` hoặc `405`, frontend fallback báo "Kết nối Sheet OK" (vì endpoint chưa tồn tại).

**Response mong đợi từ backend:**

```json
{
  "ok": true,
  "rows": 123,
  "title": "Sheet Name",
  "error": "optional error message"
}
```

---

## 5. Thông báo Telegram

### 5.1 Cấu hình

Lưu trữ tại `localStorage` key `vmos.telegram` dưới dạng JSON:

```typescript
interface TelegramConfig {
  bot_token: string;
  chat_id: string;
  thread_id: string;      // optional, dùng cho group topic
  enabled?: boolean;      // bật/tắt gửi thông báo
}
```

Cấu hình nằm trong tab **"Telegram"** của trang Settings.

### 5.2 Test kết nối Telegram

- Nút **"Kiểm tra kết nối"** gọi trực tiếp Telegram Bot API từ browser:

```text
POST https://api.telegram.org/bot<BOT_TOKEN>/sendMessage
```

Body:

```json
{
  "chat_id": "<CHAT_ID>",
  "text": "✅ <b>VMOS Changer</b>\nTest connection thành công.",
  "parse_mode": "HTML",
  "disable_web_page_preview": true,
  "message_thread_id": 123   // chỉ gửi nếu thread_id hợp lệ
}
```

- Nếu `thread_id` là số hợp lệ, frontend thêm `message_thread_id` vào body.
- Backend **không cần** proxy Telegram trừ khi muốn chuyển logic về server.

### 5.3 Toggle gửi Telegram trên Dashboard

- Switch **"Gửi Telegram"** trong card điều khiển ở Dashboard.
- Khi `enabled = true`, các sự kiện sau sẽ gửi thông báo:
  - Bấm Start run.
  - Bấm Stop run.
  - Thêm email thủ công thành công.
  - Tải email từ Google Sheet thành công.
  - Auto mode tải Sheet và tự động start/stop.

---

## 6. Hợp đồng API

### 6.1 REST endpoints

| Method | Path | Request Body | Response | Mô tả |
|--------|------|--------------|----------|-------|
| GET | `/api/stats` | - | `StatsResponse` | Thống kê tổng quan |
| GET | `/api/jobs` | - | `JobRow[] \| { jobs: JobRow[] }` | Danh sách job |
| GET | `/api/logs?limit=&pad=&level=` | - | `LogEntry[]` | Lấy logs |
| DELETE | `/api/logs` | - | `{ ok?: boolean }` | Xoá logs |
| POST | `/api/emails/validate` | `{ text: string }` | `ValidateResult` | Validate email hàng loạt |
| POST | `/api/emails/add` | `{ text: string }` | `AddResult` | Thêm email vào hàng đợi |
| POST | `/api/sheets/load` | - | `SheetLoadResult` | Tải email từ Google Sheet |
| POST | `/api/sheets/test` | - | `SheetTestResult` | Test kết nối Sheet |
| GET | `/api/pads` | - | `PadsResult` | Lấy danh sách PAD |
| POST | `/api/run/start` | `{ pad_codes?: string[] \| null }` | `{ ok?: boolean; error?: string }` | Bắt đầu chạy |
| POST | `/api/run/stop` | - | `{ ok?: boolean }` | Dừng chạy |
| POST | `/api/queue/clear` | - | `{ ok?: boolean }` | Xoá hàng đợi |
| GET | `/api/settings` | - | `AppSettings` | Lấy cài đặt |
| POST | `/api/settings` | `Partial<AppSettings>` | `{ ok?: boolean }` | Lưu cài đặt |
| GET | `/api/viewer/frame?pad=...&t=...` | - | image/jpeg/png | Frame hình ảnh thiết bị |

### 6.2 WebSocket (`/ws`)

Frontend mở kết nối WebSocket tại `/ws`. Nếu backend chạy khác origin, URL được chuyển đổi từ `http(s)` sang `ws(s)` dựa trên `vmos.backendBase`.

Frontend tự động reconnect sau ~3 giây nếu mất kết nối.

#### Các message type frontend xử lý

```typescript
interface WsMessage {
  type: "snapshot" | "worker_update" | "job_update" | "log";
  pad?: string;
  data?: unknown;
}
```

| Type | Mô tả | Dữ liệu mong đợi trong `data` |
|------|-------|------------------------------|
| `snapshot` | Toàn bộ state workers | `Record<string, WorkerState>` |
| `worker_update` | Cập nhật một worker | `Partial<WorkerState>` |
| `job_update` | Cập nhật job của một pad | `Partial<WorkerState>` |
| `log` | Log entry mới | `{ ts: string; level: string; message: string; }` |

Ví dụ message log:

```json
{
  "type": "log",
  "pad": "ACP251014801CT05Z",
  "data": {
    "ts": "2026-07-08T10:30:00.000Z",
    "level": "INFO",
    "message": "Bắt đầu xử lý email example@gmail.com"
  }
}
```

---

## 7. Các interface dữ liệu

### 7.1 JobRow

```typescript
interface JobRow {
  id: number;
  email: string;
  status: string;
  pad_code?: string | null;
  sheet_row?: number | null;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
}
```

### 7.2 StatsResponse

```typescript
interface StatsResponse {
  total?: number;
  success?: number;
  failed?: number;
  running?: number;
  pending?: number;
  queue_size?: number;
  workers?: number;
  [k: string]: unknown;
}
```

### 7.3 ValidateResult

```typescript
interface ValidateResult {
  valid: string[];
  invalid: { line: number; error: string }[];
  valid_count: number;
  invalid_count: number;
}
```

### 7.4 AddResult

```typescript
interface AddResult {
  added: number;
  skipped_duplicate: number;
  invalid_count: number;
  invalid: { line: number; error: string }[];
}
```

### 7.5 SheetLoadResult

```typescript
interface SheetLoadResult {
  loaded: number;
  skipped_duplicate: number;
  skipped_invalid: number;
  queue_size: number;
}
```

### 7.6 SheetTestResult

```typescript
interface SheetTestResult {
  ok: boolean;
  rows?: number;
  title?: string;
  error?: string;
}
```

### 7.7 PadsResult

```typescript
interface PadsResult {
  pads: string[];
  source: string;
  total?: number;
  error?: string;
}
```

### 7.8 AppSettings

```typescript
interface AppSettings {
  access_key: string;
  has_secret_key?: boolean;
  secret_key?: string;
  pad_mode: "auto" | "manual";
  manual_pad_codes: string[];
  service_account_json: string;
  spreadsheet_id: string;
  sheet_name: string;
  data_start_row: number;
  poll_interval: number;
  step_timeout: number;
  magisk_timeout: number;
  retry_count: number;
  worker_start_delay: number;
  step_delay: number;
  post_boot_settle: number;
  skip_successful: boolean;
  [k: string]: unknown;
}
```

### 7.9 LogEntry

```typescript
interface LogEntry {
  id: number;
  ts: string;
  level: string;
  pad?: string;
  message: string;
}
```

### 7.10 WorkerState

```typescript
interface WorkerState {
  pad_code: string;
  status?: string;
  step?: string;
  progress?: number;
  email?: string;
  started_at?: number;
  updated_at?: number;
  [k: string]: unknown;
}
```

---

## 8. Lưu ý quan trọng cho backend

1. **Bảo mật Service Account**: `service_account_json` được gửi nguyên văn trong `AppSettings`. Backend cần lưu trữ an toàn, **không log** ra console/file.

2. **Xử lý `skip_successful`**: Khi đọc Google Sheet, backend cần bỏ qua các dòng đã đánh dấu `SUCCESS` nếu `skip_successful = true`.

3. **Auto mode chạy ở frontend**: Backend không cần implement cron. Chỉ cần đảm bảo 3 endpoint hoạt động:
   - `POST /api/sheets/load`
   - `GET /api/jobs`
   - `POST /api/run/start`

4. **Telegram gọi từ browser**: Frontend gọi trực tiếp Telegram Bot API. Backend không cần proxy, trừ khi muốn tập trung logic hoặc tránh CORS (hiện tại Telegram API cho phép CORS).

5. **WebSocket reconnect**: Frontend tự động reconnect sau ~3 giây. Backend nên chấp nhận kết nối lại và gửi lại `snapshot` ngay sau `onopen`.

6. **Frame viewer**: Endpoint `/api/viewer/frame` nên trả về ảnh với `Content-Type: image/jpeg` hoặc `image/png`. Có thể trả về ảnh placeholder nếu thiết bị chưa có frame.

7. **Jobs response linh hoạt**: Frontend chấp nhận cả `JobRow[]` và `{ jobs: JobRow[] }` từ `GET /api/jobs`.

8. **Stats response**: Frontend sử dụng các key `total`, `success`, `failed`, `running`, `pending`, `queue_size`, `workers`. Các key khác được bỏ qua an toàn.

---

## 9. Các file frontend liên quan

| File | Mô tả |
|------|-------|
| `src/lib/theme.tsx` | Theme provider, lưu theme vào localStorage |
| `src/components/theme-toggle.tsx` | Nút toggle dark/light |
| `src/routes/viewer.tsx` | Màn hình thiết bị VMOS |
| `src/routes/logs.tsx` | Trang nhật ký logs |
| `src/lib/run-mode.ts` | Quản lý chế độ Auto/Manual |
| `src/hooks/useAutoMode.ts` | Logic tự động chạy Auto mode |
| `src/lib/telegram.ts` | Cấu hình và gửi Telegram |
| `src/routes/settings.tsx` | Trang cài đặt |
| `src/routes/index.tsx` | Dashboard |
| `src/lib/api.ts` | Các hàm gọi API và định nghĩa interface |
| `src/lib/store.ts` | Zustand store (workers, logs, WebSocket status) |
| `src/hooks/useBackendSocket.ts` | Kết nối và xử lý WebSocket |
| `src/lib/i18n.tsx` | Đa ngôn ngữ (VI/EN) |

---

## 10. Checklist tích hợp backend

- [ ] `GET /api/stats` trả về đúng các key thống kê.
- [ ] `GET /api/jobs` trả về `JobRow[]` hoặc `{ jobs: JobRow[] }`.
- [ ] `GET /api/logs` hỗ trợ query params `limit`, `pad`, `level`.
- [ ] `DELETE /api/logs` xoá logs.
- [ ] `POST /api/emails/validate` validate định dạng email.
- [ ] `POST /api/emails/add` thêm email vào queue, loại trùng, báo lỗi.
- [ ] `POST /api/sheets/load` đọc Sheet và trả về `SheetLoadResult`.
- [ ] `POST /api/sheets/test` test kết nối Sheet.
- [ ] `GET /api/pads` trả về danh sách PAD.
- [ ] `POST /api/run/start` nhận `pad_codes` tùy chọn.
- [ ] `POST /api/run/stop` dừng run.
- [ ] `POST /api/queue/clear` xoá queue.
- [ ] `GET /api/settings` và `POST /api/settings` lưu/lấy cài đặt.
- [ ] `GET /api/viewer/frame` trả về frame ảnh theo `pad`.
- [ ] WebSocket `/ws` hỗ trợ các message type: `snapshot`, `worker_update`, `job_update`, `log`.
- [ ] WebSocket tự động gửi `snapshot` khi client kết nối.
