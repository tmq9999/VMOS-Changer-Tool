# VMOS Changer Tool

Công cụ đa luồng tự động nhận link ưu đãi **Gemini Pro 12 tháng** bằng thiết bị thật của VMOS Cloud (Pixel 7 Pro → spoof lên Pixel 10 Pro) qua giao diện web hiện đại.

> **Lưu ý:** Link ưu đãi chỉ áp dụng cho thiết bị **Pixel 10 Pro**, nhưng VMOS Cloud chỉ có template **Pixel 7 Pro**. Tool tạo instance Pixel 7 Pro, bật Magisk, dùng `resetprop` spoof lên Pixel 10 Pro để đủ điều kiện nhận offer.

---

## 📋 Mục lục

- [Tính năng chính](#tính-năng-chính)
- [Yêu cầu](#yêu-cầu)
- [Cài đặt](#cài-đặt)
- [Cấu hình](#cấu-hình)
- [Chạy tool](#chạy-tool)
- [Luồng hoạt động](#luồng-hoạt-động)
- [Chế độ Auto](#chế-độ-auto)
- [Telegram thông báo](#telegram-thông-báo)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [API backend](#api-backend)
- [Lỗi thường gặp](#lỗi-thường-gặp)
- [Bảo mật](#bảo-mật)
- [Hỗ trợ](#hỗ-trợ)

---

## ✨ Tính năng chính

- **Dashboard realtime** — KPI, worker states, queue, log streaming qua WebSocket.
- **Chế độ Auto / Manual** — Auto tự động quét Google Sheet theo chu kỳ và tự start khi có email mới.
- **Telegram thông báo** — Tự động gửi báo cáo kết quả batch (số mail thành công/thất bại, dòng sheet, lý do lỗi, thời gian).
- **Màn hình xem trực tiếp** — Xem device qua Armcloud RTC (realtime, chỉ xem không điều khiển).
- **Google Sheets integration** — Tải email từ Sheet, ghi kết quả offer lại Sheet.
- **Đa luồng** — Mỗi PAD chạy một worker song song.

---

## 🛠 Yêu cầu

- **Python 3.10+**
- **Windows** (ADB binary cho Windows đã có sẵn trong `adb/`)
- **Bun** (khuyến khích) hoặc **Node.js 20+** để chạy dev server `webUI_v2_Full`
- **Tài khoản VMOS Cloud** với:
  - `Access Key`
  - `Secret Key`
  - `PADCODE` (thiết bị còn hạn)
- **Tài khoản Google** để đăng nhập vào Play Store (format: `email|password|2FA_Secret`)
- **Google Service Account** (JSON) — tùy chọn, để đọc/ghi Google Sheets

---

## 📥 Cài đặt

1. **Clone repo**
   ```bash
   git clone https://github.com/tmq9999/VMOS-Changer-Tool.git
   cd VMOS-Changer-Tool
   ```

2. **Cài Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Cài frontend dependencies**
   ```bash
   cd webUI_v2_Full
   bun install
   cd ..
   ```

---

## ⚙️ Cấu hình

1. **Copy file mẫu**
   ```bash
   copy settings.example.json settings.json
   ```

2. **Chỉnh sửa `settings.json`**
   ```json
   {
     "access_key": "YOUR_VMOS_ACCESS_KEY",
     "secret_key": "YOUR_VMOS_SECRET_KEY",
     "pad_mode": "manual",
     "manual_pad_codes": ["ACP25101482CTO5Z"],
     "service_account_json": "{ \"type\": \"service_account\", ... }",
     "spreadsheet_id": "YOUR_SHEET_ID",
     "sheet_name": "Sheet1",
     "data_start_row": 2,
     "poll_interval": 5.0,
     "step_timeout": 90.0,
     "magisk_timeout": 120.0,
     "retry_count": 3,
     "worker_start_delay": 2.0,
     "step_delay": 1.5,
     "post_boot_settle": 45.0,
     "skip_successful": true
   }
   ```

   **Giải thích các trường quan trọng:**
   - `access_key`, `secret_key`: API key VMOS Cloud.
   - `pad_mode`: `"manual"` (dùng `manual_pad_codes`) hoặc `"auto"` (lấy từ VMOS API).
   - `manual_pad_codes`: Danh sách PADCODE dùng để chạy.
   - `service_account_json`: JSON Service Account để ghi Google Sheets (để trống nếu không dùng).
   - `spreadsheet_id`, `sheet_name`, `data_start_row`: Cấu hình Google Sheet.
   - `post_boot_settle`: Thời gian chờ device ổn định sau reboot (mặc định 45s).
   - `step_timeout`: Timeout mỗi bước (giây).
   - `retry_count`: Số lần thử lại khi lỗi.

3. **Chuẩn bị danh sách email trong Google Sheet**
   - Format mỗi dòng: `email|password|2FA_Secret`
   - Ví dụ:
     ```
     example@gmail.com|MyPassword|JBSWY3DPEHPK3PXP
     ```
   - Hoặc dán trực tiếp vào trang **Emails** trong UI.

---

## 🚀 Chạy tool

### Cách đơn giản nhất (Windows)

```bash
start.bat
```

`start.bat` mở 2 cửa sổ:
- **Backend** FastAPI tại `http://localhost:8000`
- **Frontend dev server** `webUI_v2_Full` tại `http://localhost:8080` (proxy `/api` và `/ws` về `:8000`)

Mở trình duyệt tại **http://localhost:8080**.

### Chạy thủ công

```bash
# Terminal 1: backend
python run.py

# Terminal 2: frontend dev server
cd webUI_v2_Full
bun run dev
```

Mở **http://localhost:8080**.

---

## 🔄 Luồng hoạt động (6 bước)

Mỗi worker chạy tuần tự cho một email trên một PAD:

1. **New Device** — `padReplaceNew` tạo instance mới từ template Pixel 7 Pro, chờ `padStatus=10`.
2. **Login Google** — Mở Add Account, nhập email/password, xử lý TOTP, accept.
3. **Install Google One** — Cài Google One từ Play Store.
4. **Magisk ON** — Bật Magisk trong Toolbox, chờ reboot.
5. **Spoof** — Dùng `resetprop` ghi đè props thành Pixel 10 Pro (model, fingerprint, soc, sdk, v.v.).
6. **Get Offer** — Mở Google One, trích xuất link offer và ghi kết quả lên Sheet.

Kết quả ví dụ: `https://one.google.com/offer/N4DEYVD9D4EE1D76250P`

---

## 🤖 Chế độ Auto

Vào **Settings → Chế độ chạy** → chọn **Tự động**, đặt chu kỳ (phút).

Frontend sẽ tự động:
1. Quét Google Sheet theo chu kỳ.
2. Nếu có email mới và không có worker/job đang chạy → tự động `Start Run`.
3. Gửi thông báo Telegram khi tải được email và khi auto start.

Không cần backend cron — toàn bộ logic nằm trong hook `useAutoMode` của frontend.

---

## 📬 Telegram thông báo

Telegram hoàn toàn **client-side** — không cần cấu hình backend.

**Cấu hình:** Settings → Telegram → nhập `bot_token`, `chat_id`, tùy chọn `thread_id`.

**Sự kiện tự động thông báo:**
- Bắt đầu / dừng run
- Thêm email thủ công / tải từ Sheet
- Auto mode tải Sheet + auto start
- **Kết thúc batch** — báo cáo chi tiết:
  ```
  📊 Batch #1: 12 mail — 120 phút
  ✅ Thành công: 10 (Dòng 2,3,4,5,6,7,8,9,10,11)
  ❌ Thất bại: 2 (Dòng 12,13)
  Lý do: Timeout OTP
  🕐 Time: 14:30:00
  ```

---

## 📁 Cấu trúc thư mục

```
VMOS-Changer-Tool/
├── backend/                 # FastAPI backend + worker engine
│   ├── main.py              # API endpoints + WebSocket
│   ├── worker.py            # Worker đa luồng
│   ├── queue_manager.py     # Queue & pad pool
│   ├── sheets.py            # Google Sheets
│   ├── steps/               # 6 bước xử lý VMOS
│   └── ...
├── webUI_v2_Full/             # React frontend (TanStack Router + shadcn/ui)
│   ├── src/
│   │   ├── routes/          # Dashboard, Emails, Logs, Viewer, Settings
│   │   ├── components/      # UI components
│   │   ├── lib/             # API, store, i18n, theme, Telegram, RTC
│   │   └── hooks/           # useAutoMode, useBackendSocket
│   ├── package.json
│   ├── vite.config.ts
│   └── bun.lock
├── adb/                       # ADB Windows binary
├── data/                      # Runtime SQLite (jobs.db) — gitignored
├── vmos_sdk/                  # Vendored VMOS SDK
├── run.py                     # Entry point backend
├── start.bat                  # Khởi động backend + frontend
├── requirements.txt
├── settings.example.json
└── README.md
```

---

## 🔌 API backend

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/stats` | Tổng hợp trạng thái jobs/workers |
| GET | `/api/jobs` | Danh sách tất cả jobs |
| GET | `/api/logs` | Logs có filter `limit`, `pad`, `level` |
| DELETE | `/api/logs` | Xóa logs |
| POST | `/api/emails/validate` | Validate bulk email text |
| POST | `/api/emails/add` | Thêm email hợp lệ vào queue |
| POST | `/api/sheets/load` | Tải email từ Google Sheet |
| POST | `/api/sheets/test` | Test kết nối Google Sheet |
| GET | `/api/pads` | Danh sách PAD |
| GET | `/api/pads/{pad}/h5-token` | Token xem RTC |
| POST | `/api/run/start` | Bắt đầu chạy workers |
| POST | `/api/run/stop` | Dừng workers |
| POST | `/api/queue/clear` | Xóa queue |
| GET | `/api/settings` | Lấy cấu hình |
| POST | `/api/settings` | Lưu cấu hình |
| WS | `/ws` | Real-time worker state, log, job update, batch_done |

---

## 🐛 Lỗi thường gặp

| Lỗi | Nguyên nhân | Giải pháp |
|-----|------------|-----------|
| `[110031]` sau step 1 | Instance chưa reboot xong | Tăng `post_boot_settle` (60–90s) |
| Click SKIP → về Home | GMS chưa load | Tăng `post_boot_settle` |
| `TRY ANOTHER WAY` không thấy | Xác thực khác | Kiểm tra 2FA secret |
| Magisk timeout | Mạng chậm | Tăng `magisk_timeout` |
| Không thấy offer | Device không eligible | Kiểm tra spoof props/fingerprint |
| RTC viewer không kết nối | Session đang bị chiếm | Đợi hoặc click reconnect |
| KPI hiển thị 0 | Frontend/backend chưa kết nối | Kiểm tra backend đã chạy và proxy `/api` |

---

## 🔐 Bảo mật

- **`settings.json` chứa secrets** — đã được `.gitignore` loại khỏi repo. **Không bao giờ commit.**
- Nếu lỡ commit `settings.json`, rotate lại API key / service account ngay.
- Google Service Account chỉ cần quyền **edit** trên sheet target.

---

## 📞 Hỗ trợ

- **Issues:** https://github.com/tmq9999/VMOS-Changer-Tool/issues
- **Author:** TMQ9999

---

## 📄 License

MIT License — xem file `LICENSE` (nếu có).

---

### 🎉 Chúc bạn nhận được nhiều link Gemini Pro!

Nếu tool hữu ích, hãy cho **⭐** trên repo!
