
## Mục tiêu
Xóa toàn bộ frontend placeholder hiện tại, build một WebUI hiện đại theo phong cách Modern Light SaaS (nền trắng/`#f8fafc`, accent indigo `#4f46e5` + sky `#0ea5e9`), kết nối tới backend FastAPI (VMOS Changer Tool) qua REST `/api/*` và WebSocket `/ws`. Mặc định same-origin, cho phép override URL trong Settings.

## Kết nối backend
- Tạo `src/lib/api-config.ts` quản lý `apiBase` + `wsBase`:
  - Đọc từ `localStorage['vmos.backendBase']`. Rỗng → dùng same-origin (`''` cho REST, `ws(s)://host` cho WS).
  - Hàm `apiUrl(path)`, `wsUrl(path)`.
- `src/lib/api.ts` — port toàn bộ hàm từ `frontend/src/api.ts` cũ + bổ sung:
  - `getStats`, `getJobs`, `getLogs`, `validateEmails`, `addEmails`, `loadFromSheets`, `getPads`, `startRun`, `stopRun`, `clearLogs`, `clearQueue` (`POST /api/queue/clear`), `getSettings`, `saveSettings`.
- `src/hooks/useBackendSocket.ts` — WebSocket auto-reconnect, expose `{ status, lastEvent, workers, on(type, cb) }`. Nhận `snapshot`, `worker_update`, `log`, `job_update` … và cập nhật store.
- `src/lib/store.ts` — Zustand store cho: workers state, gần đây jobs, log buffer (ring buffer 500 dòng), connection status.

## Cấu trúc route (TanStack Start)
- `src/routes/__root.tsx` — layout SaaS với sidebar trái (Dashboard / Emails / Logs / Settings), header trên (logo VMOS Changer, chip trạng thái WS: Connected/Reconnecting, nút Start/Stop nhanh), meta title/description app-specific.
- `src/routes/index.tsx` → **Dashboard**
  - Hàng KPI: Total jobs, Success, Failed, Running, Queue size, Active workers.
  - Card **Workers realtime**: grid PAD card (padCode, step hiện tại, progress bar, email đang xử lý, elapsed) — update qua WS.
  - Bảng **Jobs gần đây**: email • status • pad • updated_at, filter theo status.
  - Panel **Controls**: nút Start (chọn PADs qua multi-select — tự load `/api/pads`), Stop, Clear queue, Clear logs. Toast confirm.
- `src/routes/emails.tsx` → **Emails**
  - Textarea bulk `email|password|totp` + nút Validate (hiện valid/invalid rõ ràng, badge số dòng, danh sách lỗi kèm số dòng).
  - Nút **Add to queue** → toast: added / skipped duplicate / invalid.
  - Nút **Load from Google Sheet** → sau khi load, **hiển thị danh sách email đã load** (bổ sung so với frontend cũ): bảng gồm email • sheet_row • trạng thái (added/duplicate/invalid) + tổng kết. Lưu kết quả lần load gần nhất trong store để user luôn xem lại được.
  - Panel Queue hiện tại (đọc từ `/api/jobs`) — có thể xóa từng email hoặc clear all.
- `src/routes/logs.tsx` → **Logs**
  - Live tail qua WS, auto-scroll (toggle được).
  - Filter: theo `pad_code` (dropdown lấy từ workers), theo `level` (INFO/WARN/ERROR/DEBUG), ô search text.
  - Nút Clear, Export .txt.
  - Màu badge level theo palette.
- `src/routes/settings.tsx` → **Settings** (form chia tab)
  - **Backend connection** (mới): input Backend URL override, nút Test connection (`GET /api/settings` → OK), Save (localStorage).
  - **VMOS API**: access_key, secret_key (password field, hiện `has_secret_key`), pad_mode (auto/manual), manual_pad_codes (chip input).
  - **Google Sheet**: service_account_json (textarea), spreadsheet_id, sheet_name, data_start_row, skip_successful (switch).
  - **Timing**: poll_interval, step_timeout, magisk_timeout, retry_count, worker_start_delay, step_delay, post_boot_settle.
  - Save → `POST /api/settings`, toast.

## Design system (Modern Light SaaS)
- Cập nhật `src/styles.css`:
  - `--background: oklch(1 0 0)`, `--muted: oklch(0.98 0.01 240)` (≈`#f8fafc`), `--foreground` gần `#0f172a`.
  - `--primary` = indigo `#4f46e5` (oklch), `--accent` = sky `#0ea5e9`.
  - `--sidebar` trắng, border xám nhạt.
  - Radius mềm (`--radius: 0.75rem`), shadow tinh gọn `--shadow-elegant`.
- Font: `@fontsource-variable/inter` cho body, `@fontsource/geist-mono` cho logs. Không dùng Google Fonts CDN.
- Components: dùng shadcn có sẵn (Button, Card, Badge, Table, Tabs, Dialog, Input, Textarea, Select, Switch, Sonner toast, Tooltip, Progress, ScrollArea). Cài thêm `zustand` cho state.
- Icons: `lucide-react`.

## Technical details
- Data fetching: TanStack Query đã có; dùng `useQuery` cho stats/jobs/pads/settings, `useMutation` cho actions. Không dùng loader server (backend là external — chỉ chạy trên client).
- WebSocket: khởi tạo trong `__root.tsx` (client-only, gate bằng `useHydrated`), đẩy events vào Zustand store; các trang subscribe qua selector.
- Không dùng `createServerFn`/server routes — không có backend nội bộ. Đây là pure SPA-like UI trên TanStack Start.
- Vite dev proxy (`vite.config.ts`): proxy `/api` → `http://localhost:8000`, `/ws` → `ws://localhost:8000` để same-origin dev thuận tiện (không phá build).
- Xóa/replace: `src/routes/index.tsx` placeholder. Giữ `__root.tsx` shell nhưng thay layout.

## Files sẽ tạo/sửa
- Sửa: `src/styles.css`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `vite.config.ts`, `src/main.tsx` (font imports).
- Tạo: `src/routes/emails.tsx`, `src/routes/logs.tsx`, `src/routes/settings.tsx`, `src/lib/api-config.ts`, `src/lib/api.ts`, `src/lib/store.ts`, `src/hooks/useBackendSocket.ts`, `src/components/app-sidebar.tsx`, `src/components/ws-status-chip.tsx`, `src/components/worker-card.tsx`, `src/components/kpi-card.tsx`, `src/components/pad-picker.tsx`.
- Cài thêm: `zustand`, `@fontsource-variable/inter`, `@fontsource/geist-mono`.

## Ngoài scope (cần user xác nhận sau nếu muốn)
- Auth/đăng nhập cho WebUI (backend hiện không có).
- Sửa/mở rộng backend Python.
- Đóng gói lại `frontend/dist` vào backend hiện tại (build TanStack Start ra static để backend FastAPI serve — có thể làm ở bước tiếp theo nếu cần).
