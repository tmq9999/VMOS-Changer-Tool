# VMOS Changer Tool

Công cụ đa luồng độc lập song song nhận link ưu đãi **Gemini Pro 12 tháng** bằng thiết bị thật của VMOS Cloud (Google Pixel 7 Pro → spoof lên Pixel 10 Pro).

> **Lưu ý:** Link ưu đãi chỉ áp dụng cho thiết bị **Pixel 10 Pro**, nhưng VMOS Cloud chỉ có template **Pixel 7 Pro**. Tool này sẽ tạo instance Pixel 7 Pro, spoof lên Pixel 10 Pro để đủ điều kiện nhận link.

---

## 📋 Mục lục

- [Yêu cầu](#yêu-cầu)
- [Cài đặt](#cài-đặt)
- [Cấu hình](#cấu-hình)
- [Chạy Tool](#chạy-tool)
- [Luồng hoạt động](#luồng-hoạt-động)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Tùy chỉnh](#tùy-chỉnh)
- [Lỗi thường gặp](#lỗi-thường-gặp)
- [Bảo mật](#bảo-mật)
- [Hỗ trợ](#hỗ trợ)

---

## 🛠 Yêu cầu

- **Python 3.10+**
- **Windows** (tool dùng ADB binary cho Windows)
- **Tài khoản VMOS Cloud** với:
  - `Access Key ID`
  - `Secret Access Key`
  - `PADCODE` (mã thiết bị đang còn hạn sử dụng)
- **Tài khoản Google** để đăng nhập vào Play Store (format: `email|password|2FA_Secret`)
- **Google Service Account** (JSON) để ghi kết quả lên Google Sheets (tùy chọn, có thể bỏ qua)

---

## 📥 Cài đặt

1. **Clone repo**
   ```bash
   git clone https://github.com/tmq9999/VMOS-Changer-Tool.git
   cd VMOS-Changer-Tool
   ```

2. **Cài đặt Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **(Tùy chọn) Cài đặt Node.js** nếu muốn build lại frontend
   ```bash
   cd frontend
   npm install
   npm run build   # frontend/dist/
   cd ..
   ```

   > **Lưu ý:** Repo đã chứa frontend build sẵn (`frontend/dist/`) nên không cần làm bước này nếu chỉ chạy tool.

---

## ⚙️ Cấu hình

1. **Copy file mẫu**
   ```bash
   copy settings.example.json settings.json
   ```

2. **Chỉnh sửa `settings.json`**
   ```json
   {
     "access_key": "R3ZAcmkLn0zu2RWyJCQYn5RHHW9j03G4",
     "secret_key": "vYeoL2mCuwLJIQoLXkXAUREO",
     "pad_mode": "manual",
     "manual_pad_codes": ["ACP25101482CTO5Z"],
     "service_account_json": "{\n  \"type\": \"service_account\",\n  \"project_id\": \"...\",\n  \"private_key\": \"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n\",\n  \"client_email\": \"...@...gserviceaccount.com\"\n}",
     "spreadsheet_id": "14T1AfMPSVFKj-erQgwztwzT3sjM9Qw3sk5PTfJw2J-k",
     "sheet_name": "Gemini",
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
   - `access_key`, `secret_key`: API key của VMOS Cloud.
   - `pad_mode`: `"manual"` (dùng `manual_pad_codes`) hoặc `"auto"` (lấy tự động).
   - `manual_pad_codes`: Danh sách PADCODE sẽ dùng.
   - `service_account_json`: JSON của Service Account để ghi Google Sheets (để trống nếu không dùng).
   - `spreadsheet_id`, `sheet_name`, `data_start_row`: Thông tin Google Sheet để ghi kết quả.
   - `post_boot_settle`: Thời gian (giây) chờ device ổn định sau reboot trước khi login (mặc định 45s).
   - `step_timeout`: Timeout mỗi bước (giây).
   - `retry_count`: Số lần thử lại khi lỗi.

3. **Chuẩn bị danh sách email**
   - Format mỗi dòng: `email@gmail.com|password|2FA_Secret`
   - Ví dụ:
     ```
     tranvangiang170626@gmail.com|myPassword|JBSWY3DPEHPK3PXP
     another@gmail.com|anotherPass|ABC123DEF456
     ```
   - Dán vào trang **Emails** trên web UI.

---

## 🚀 Chạy Tool

### Cách 1: Dùng Web UI (khuyến khích)

```bash
python run.py
```

- Mở trình duyệt: **http://localhost:8000**
- Trang **Dashboard**: xem số lượng instance đang chạy, đã hoàn thành, thất bại...
- Trang **Emails**: thêm danh sách email.
- Trang **Settings**: chỉnh lại `settings.json` qua giao diện.
- Trang **Logs**: xem log real-time.
- Nhấn **Start** trên Dashboard để bắt đầu.

### Cách 2: Dòng lệnh (debug)

```bash
# Test từng bước
python -m backend.steps.step1_new_device
python -m backend.steps.step5_spoof
# ... (cần cấu hình sys.path thủ công)
```

> **Lưu ý:** Web UI là cách chính thức, dễ quản lý đa luồng và theo dõi.

---

## 🔄 Luồng hoạt động (6 bước)

Tool thực hiện tuần tự cho mỗi email trên mỗi instance:

1. **Step 1 – New Device**
   - `padReplaceNew` → tạo instance mới từ template **Pixel 7 Pro** (ID=36)
   - Chờ instance ready (`padStatus=10`)
   - **Fix:** `wait_pad_not_ready` để đảm bảo reboot xong mới tiếp tục (tránh `[110031]`)

2. **Step 2 – Login Google**
   - **Settle:** chờ `post_boot_settle` (45s) để GMS/Add Account load xong
   - Mở **Add Account Settings**
   - **Retry logic:** nếu click SKIP bị lạc về Home → re-open (tối đa 3 lần)
   - Nhập email → password → xử lý **TRY ANOTHER WAY** → nhập TOTP
   - Click **I agree** → **ACCEPT** → cleanAppHome

3. **Step 3 – Install Google One**
   - Mở Play Store trang Google One
   - Click **Install** → dismiss Play Protect
   - Chờ cài xong

4. **Step 4 – Magisk ON**
   - Click **Toolbox** → tìm toggle **Magisk**
   - Click **ON** → Confirm → Restart
   - Chờ reboot xong → verify Magisk

5. **Step 5 – Spoof**
   - Dùng **resetprop** ghi đè toàn bộ props thành **Pixel 10 Pro "blazer"** (module `Blazer_CP2A.260605.012`, Android 17, SDK 37)
   - Props bao gồm: `ro.product.model=Pixel 10 Pro`, `ro.build.fingerprint=google/blazer/blazer:17/CP2A.260605.012/15430684:user/release-keys`, `ro.soc.model=Tensor G5`, v.v.
   - Verify: in ra `model`, `device`, `fingerprint`, `release`, `sdk`, `security_patch`, `soc`, `build_type`, `gpu`

6. **Step 6 – Get Offer**
   - Mở **Google One**
   - Click **Get Started** (dựa vào screen size)
   - Chờ màn hình **PartnerOnboarding** (xác nhận eligible)
   - Trích xuất link ưu đãi (regex `partner-eft-onboard/([A-Z0-9]{6,})`)
   - Ghi kết quả lên Google Sheets (nếu có cấu hình)

**Kết quả:** Link như `https://one.google.com/offer/N4DEYVD9D4EE1D76250P`

---

## 📁 Cấu trúc thư mục

```
VMOS Changer Tool/
├── backend/                 # FastAPI backend
│   ├── steps/              # 6 bước logic (step1_new_device.py, ...)
│   ├── main.py             # FastAPI app
│   ├── worker.py           # Worker đa luồng
│   ├── queue_manager.py    # Hàng đợi email & pad
│   ├── sheets.py           # Google Sheets integration
│   └── ...
├── frontend/               # React UI (build sẵn trong dist/)
│   ├── src/
│   ├── dist/               # Build sẵn (không cần npm)
│   └── ...
├── adb/                    # ADB binary Windows
├── data/                   # Runtime data (jobs.db)
├── vmos_sdk/               # **Vendored** VMOS SDK (độc lập)
├── run.py                  # Entry point
├── requirements.txt        # Python deps
├── settings.example.json   # Mẫu cấu hình
├── .gitignore              # Loại secrets & node_modules
└── README.md               # File này
```

> **Vendored SDK:** `vmos_sdk/` được copy vào tool để repo độc lập, không cần cài `VMOS SDK` bên ngoài.

---

## 🎛 Tùy chỉnh

### Thay đổi thời gian chờ sau reboot

Sửa `post_boot_settle` trong `settings.json` (giây). Giá trị mặc định 45s. Nếu device yếu, tăng lên 60–90s.

### Thay đổi template device

Mở `backend/steps/step1_new_device.py`, sửa `TEMPLATE_ID` (ID template VMOS Cloud). Mặc định `36` (Pixel 7 Pro).

### Thay đổi props spoof

Mở `backend/steps/step5_spoof.py`, sửa block constants ở đầu file (BRAND, DEVICE, MODEL, BUILD_ID, RELEASE, SDK, ...). Tool đã refactor dùng f-string nên chỉ cần sửa ở đó.

### Tắt Google Sheets

Để trống `service_account_json`, `spreadsheet_id`, `sheet_name`. Kết quả chỉ hiển thị trên UI.

### Chạy nhiều instance song song

- Trong `settings.json`, tăng `manual_pad_codes` (thêm nhiều PADCODE).
- Tool sẽ tự phân bổ mỗi PADCODE cho một worker (một thread).
- Dashboard hiển thị số lượng worker đang chạy.

---

## 🐛 Lỗi thường gặp

| Lỗi | Nguyên nhân | Giải pháp |
|-----|------------|-----------|
| `[110031]` sau step 1 | Instance chưa reboot xong đã chạy step 2 | Đã fix bằng `wait_pad_not_ready`. Nếu vẫn lỗi, tăng `post_boot_settle` (60–90s). |
| Click SKIP → về Home, kẹt chờ email | GMS chưa load, SKIP click quá sớm | Đã fix bằng retry logic + `post_boot_settle`. Nếu vẫn lỗi, tăng `post_boot_settle`. |
| `TRY ANOTHER WAY` không thấy | Google yêu cầu xác thực khác | Tool tự chọn Google Authenticator. Nếu vẫn lỗi, kiểm tra 2FA secret. |
| Magisk download timeout | Mạng chậm | Tăng `magisk_timeout` (mặc định 120s). |
| Không thấy link offer | Device không eligible | Kiểm tra props spoof (step 5) và đảm bảo fingerprint là `blazer`. |
| `padStatus != 10` | Instance chưa sẵn sàng | Chờ hoặc kiểm tra PADCODE còn hạn không. |
| `ImportError: No module named 'vmos_sdk'` | Chạy sai thư mục | Luôn chạy từ trong `VMOS Changer Tool/`. |

---

## 🔐 Bảo mật

- **`settings.json` chứa secrets** (API key, private key). File này đã được `.gitignore` loại khỏi repo.
- **Không bao giờ commit `settings.json`** lên Git. Nếu lỡ commit, hãy rotate lại API key.
- Repo **standalone** (vendored SDK) nên không lộ thông tin repo SDK khác.
- Google Service Account chỉ cần quyền **edit** trên sheet target.

---

## 📞 Hỗ trợ

- **Issues:** https://github.com/tmq9999/VMOS-Changer-Tool/issues
- **Discord/Telegram:** (nếu có)
- **Author:** TMQ9999

---

## 📄 License

MIT License — xem file `LICENSE` (nếu có).

---

### 🎉 Chúc bạn nhận được nhiều link Gemini Pro!

Nếu tool hữu ích, hãy cho **⭐** trên repo!
