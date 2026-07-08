import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "vi" | "en";

type Dict = Record<string, string>;

const vi: Dict = {
  "app.name": "VMOS Changer",
  "app.subtitle": "Bảng điều khiển",
  "app.tagline": "v1.0 · Công cụ Gemini Offer",

  "nav.workspace": "Không gian làm việc",
  "nav.dashboard": "Bảng điều khiển",
  "nav.emails": "Emails",
  "nav.logs": "Nhật ký",
  "nav.viewer": "Màn hình",
  "nav.settings": "Cài đặt",

  "ws.live": "Trực tiếp",
  "ws.connecting": "Đang kết nối",
  "ws.reconnecting": "Kết nối lại",
  "ws.offline": "Ngoại tuyến",

  "lang.label": "Ngôn ngữ",
  "lang.vi": "Tiếng Việt",
  "lang.en": "English",

  // Dashboard
  "dash.title": "Bảng điều khiển",
  "dash.subtitle": "Workers, hàng đợi và điều khiển chạy theo thời gian thực.",
  "kpi.total": "Tổng",
  "kpi.success": "Thành công",
  "kpi.failed": "Thất bại",
  "kpi.running": "Đang chạy",
  "kpi.queue": "Hàng đợi",
  "kpi.workers": "Workers",
  "dash.workers": "Workers",
  "dash.active": "đang hoạt động",
  "dash.noWorker": "Chưa có worker nào chạy. Bấm Start để xem tiến trình trực tiếp.",
  "dash.controls": "Điều khiển",
  "dash.start": "Chạy",
  "dash.stop": "Dừng",
  "dash.clearQueue": "Xoá hàng đợi",
  "dash.clearLogs": "Xoá nhật ký",
  "dash.padHint": "Bỏ trống PAD để dùng danh sách mặc định trong Cài đặt.",
  "dash.recent": "Job gần đây",
  "dash.noJobs": "Chưa có job nào.",
  "col.email": "Email",
  "col.status": "Trạng thái",
  "col.pad": "PAD",
  "col.updated": "Cập nhật",
  "col.sheetRow": "Dòng Sheet",
  "col.row": "Dòng",
  "toast.startedWorkers": "Đã khởi động workers",
  "toast.stopSent": "Đã gửi tín hiệu dừng",
  "toast.queueCleared": "Đã xoá hàng đợi",
  "toast.logsCleared": "Đã xoá nhật ký",

  // PadPicker
  "pad.auto": "Tự động (VMOS API)",
  "pad.manual": "Danh sách thủ công",
  "pad.list": "Danh sách PAD",
  "pad.available": "khả dụng",
  "pad.selectAll": "Chọn tất cả",
  "pad.clear": "Bỏ chọn",
  "pad.loading": "Đang tải PAD…",
  "pad.loadFail": "Không tải được PAD",
  "pad.none": "Không có PAD nào.",

  // Emails
  "emails.title": "Emails",
  "emails.subtitle": "Dán hàng loạt hoặc tải từ Google Sheet.",
  "emails.bulk": "Dán hàng loạt",
  "emails.validate": "Kiểm tra",
  "emails.add": "Thêm vào hàng đợi",
  "emails.valid": "hợp lệ",
  "emails.invalid": "không hợp lệ",
  "emails.line": "dòng",
  "emails.sheet": "Google Sheet",
  "emails.sheetDesc": "Đọc các dòng từ bảng tính đã cấu hình và thêm vào hàng đợi.",
  "emails.loadSheet": "Tải từ Sheet",
  "emails.loaded": "Đã tải",
  "emails.duplicate": "Trùng",
  "emails.queue": "Hàng đợi",
  "emails.noRows": "Không có dòng nào.",
  "emails.noSheetYet": "Chưa tải Sheet lần nào. Kết quả sẽ hiện ở đây sau khi bấm Tải.",
  "emails.current": "Hàng đợi hiện tại",
  "emails.emptyQueue": "Hàng đợi trống.",
  "emails.toastAdded": "Đã thêm {added} · Trùng {dup} · Lỗi {inv}",
  "emails.toastLoaded": "Đã tải {loaded} · Trùng {dup} · Lỗi {inv}",

  // Logs
  "logs.title": "Nhật ký",
  "logs.subtitle": "Live tail từ WebSocket backend.",
  "logs.live": "Live tail",
  "logs.allPads": "Tất cả PAD",
  "logs.search": "Tìm kiếm…",
  "logs.auto": "Tự cuộn",
  "logs.export": "Xuất",
  "logs.clear": "Xoá",
  "logs.waiting": "Đang chờ nhật ký…",

  // Viewer
  "viewer.title": "Màn hình thiết bị",
  "viewer.subtitle": "Xem trực tiếp các thiết bị VMOS (chỉ xem, không điều khiển).",
  "viewer.cols": "Số cột",
  "viewer.rows": "Số dòng",
  "viewer.refresh": "Tải lại danh sách",
  "viewer.noPads": "Không có PAD nào. Kiểm tra cấu hình VMOS trong Cài đặt.",
  "viewer.loading": "Đang tải danh sách PAD…",
  "viewer.connecting": "Đang kết nối…",
  "viewer.connected": "Đã kết nối",
  "viewer.error": "Lỗi",
  "viewer.disconnected": "Ngắt kết nối",
  "viewer.unsupported": "Trình duyệt không hỗ trợ WebRTC",
  "viewer.noLogs": "Chưa có log",
  "viewer.pageOf": "Trang {page}/{total}",
  "viewer.prev": "Trước",
  "viewer.next": "Sau",
  "viewer.reconnect": "Kết nối lại",
  "viewer.retrying": "Tự động thử lại…",
  "viewer.hint": "Mỗi ô là một thiết bị. Điều chỉnh số dòng/cột trong Cài đặt.",

  // Settings
  "set.title": "Cài đặt",
  "set.subtitle": "Cấu hình backend, VMOS API, Google Sheet và thời gian.",
  "set.save": "Lưu",
  "set.saved": "Đã lưu cài đặt",
  "set.tab.backend": "Backend",
  "set.tab.vmos": "VMOS API",
  "set.tab.sheet": "Google Sheet",
  "set.tab.timing": "Thời gian",
  "set.backend.title": "Kết nối backend",
  "set.backend.url": "URL backend (tuỳ chọn)",
  "set.backend.hint": "Bỏ trống để dùng cùng origin với trang này. Đổi nếu FastAPI backend chạy nơi khác.",
  "set.backend.saveReload": "Lưu & tải lại",
  "set.backend.test": "Kiểm tra kết nối",
  "set.backend.reachable": "Backend truy cập được",
  "set.backend.saved": "Đã lưu URL backend. Đang tải lại…",
  "set.vmos.title": "VMOS Cloud API",
  "set.vmos.access": "Access Key",
  "set.vmos.secret": "Secret Key",
  "set.vmos.secretConfigured": "(đã cấu hình)",
  "set.vmos.secretPh": "•••••••• (để trống để giữ nguyên)",
  "set.vmos.padMode": "Chế độ PAD",
  "set.vmos.padAuto": "Tự động (lấy từ VMOS API)",
  "set.vmos.padManual": "Danh sách thủ công",
  "set.vmos.manualList": "Danh sách PAD thủ công (phẩy hoặc xuống dòng)",
  "set.sheet.title": "Google Sheet",
  "set.sheet.saJson": "Service account JSON",
  "set.sheet.id": "Spreadsheet ID",
  "set.sheet.name": "Tên sheet",
  "set.sheet.startRow": "Dòng dữ liệu bắt đầu",
  "set.sheet.skip": "Bỏ qua các dòng đã đánh dấu SUCCESS",
  "set.timing.title": "Thời gian & thử lại",
  "set.timing.poll": "Poll interval (s)",
  "set.timing.step": "Step timeout (s)",
  "set.timing.magisk": "Magisk timeout (s)",
  "set.timing.retry": "Số lần thử lại",
  "set.timing.startDelay": "Delay khởi động worker (s)",
  "set.timing.stepDelay": "Delay giữa step (s)",
  "set.timing.settle": "Chờ sau khi boot (s)",

  "set.tab.viewer": "Màn hình",
  "set.viewer.title": "Cấu hình lưới xem",
  "set.viewer.rows": "Số dòng mặc định",
  "set.viewer.cols": "Số cột mặc định",
  "set.viewer.baseUrl": "Armcloud H5 base URL",
  "set.viewer.baseUrlHint": "Overseas: https://openapi-hk.armcloud.net",

  "worker.waiting": "Đang chờ job",

  "dash.liveLogs": "Nhật ký trực tiếp",
  "dash.viewAll": "Xem tất cả",
  "dash.quickAdd": "Thêm email nhanh",
  "dash.quickAddPh": "email|password|2FA_SECRET (mỗi dòng 1 tài khoản)",
  "dash.loadSheet": "Tải Sheet",
};

const en: Dict = {
  "app.name": "VMOS Changer",
  "app.subtitle": "Control Panel",
  "app.tagline": "v1.0 · Gemini Offer Tool",

  "nav.workspace": "Workspace",
  "nav.dashboard": "Dashboard",
  "nav.emails": "Emails",
  "nav.logs": "Logs",
  "nav.viewer": "Viewer",
  "nav.settings": "Settings",

  "ws.live": "Live",
  "ws.connecting": "Connecting",
  "ws.reconnecting": "Reconnecting",
  "ws.offline": "Offline",

  "lang.label": "Language",
  "lang.vi": "Tiếng Việt",
  "lang.en": "English",

  "dash.title": "Dashboard",
  "dash.subtitle": "Realtime workers, queue and run controls.",
  "kpi.total": "Total",
  "kpi.success": "Success",
  "kpi.failed": "Failed",
  "kpi.running": "Running",
  "kpi.queue": "Queue",
  "kpi.workers": "Workers",
  "dash.workers": "Workers",
  "dash.active": "active",
  "dash.noWorker": "No worker running. Start a run to see live progress here.",
  "dash.controls": "Run controls",
  "dash.start": "Start",
  "dash.stop": "Stop",
  "dash.clearQueue": "Clear queue",
  "dash.clearLogs": "Clear logs",
  "dash.padHint": "Leave PAD selection empty to use the default from Settings.",
  "dash.recent": "Recent jobs",
  "dash.noJobs": "No jobs yet.",
  "col.email": "Email",
  "col.status": "Status",
  "col.pad": "PAD",
  "col.updated": "Updated",
  "col.sheetRow": "Sheet row",
  "col.row": "Row",
  "toast.startedWorkers": "Workers started",
  "toast.stopSent": "Stop signal sent",
  "toast.queueCleared": "Queue cleared",
  "toast.logsCleared": "Logs cleared",

  "pad.auto": "Auto (VMOS API)",
  "pad.manual": "Manual list",
  "pad.list": "PAD list",
  "pad.available": "available",
  "pad.selectAll": "Select all",
  "pad.clear": "Clear",
  "pad.loading": "Loading PADs…",
  "pad.loadFail": "Failed to load PADs",
  "pad.none": "No PADs available.",

  "emails.title": "Emails",
  "emails.subtitle": "Paste bulk credentials or load them from your Google Sheet.",
  "emails.bulk": "Bulk paste",
  "emails.validate": "Validate",
  "emails.add": "Add to queue",
  "emails.valid": "valid",
  "emails.invalid": "invalid",
  "emails.line": "line",
  "emails.sheet": "Google Sheet",
  "emails.sheetDesc": "Reads rows from the configured spreadsheet and adds them to the queue.",
  "emails.loadSheet": "Load from Sheet",
  "emails.loaded": "Loaded",
  "emails.duplicate": "Duplicate",
  "emails.queue": "Queue",
  "emails.noRows": "No rows returned.",
  "emails.noSheetYet": "Sheet not loaded yet. Results will appear here after Load.",
  "emails.current": "Current queue",
  "emails.emptyQueue": "Queue is empty.",
  "emails.toastAdded": "Added {added} · Duplicate {dup} · Invalid {inv}",
  "emails.toastLoaded": "Loaded {loaded} · Duplicate {dup} · Invalid {inv}",

  "logs.title": "Logs",
  "logs.subtitle": "Live tail from the backend WebSocket.",
  "logs.live": "Live tail",
  "logs.allPads": "All PADs",
  "logs.search": "Search…",
  "logs.auto": "Auto-scroll",
  "logs.export": "Export",
  "logs.clear": "Clear",
  "logs.waiting": "Waiting for logs…",

  "viewer.title": "Device Viewer",
  "viewer.subtitle": "Live view of VMOS devices (view-only, no control).",
  "viewer.cols": "Columns",
  "viewer.rows": "Rows",
  "viewer.refresh": "Refresh list",
  "viewer.noPads": "No PADs available. Check VMOS config in Settings.",
  "viewer.loading": "Loading PAD list…",
  "viewer.connecting": "Connecting…",
  "viewer.connected": "Connected",
  "viewer.error": "Error",
  "viewer.disconnected": "Disconnected",
  "viewer.unsupported": "Browser does not support WebRTC",
  "viewer.noLogs": "No logs yet",
  "viewer.pageOf": "Page {page}/{total}",
  "viewer.prev": "Prev",
  "viewer.next": "Next",
  "viewer.reconnect": "Reconnect",
  "viewer.retrying": "Auto-retrying…",
  "viewer.hint": "Each cell is one device. Adjust rows/cols in Settings.",

  "set.title": "Settings",
  "set.subtitle": "Configure backend, VMOS API, Sheet and timing.",
  "set.save": "Save",
  "set.saved": "Settings saved",
  "set.tab.backend": "Backend",
  "set.tab.vmos": "VMOS API",
  "set.tab.sheet": "Google Sheet",
  "set.tab.timing": "Timing",
  "set.backend.title": "Backend connection",
  "set.backend.url": "Backend base URL (optional)",
  "set.backend.hint": "Leave empty to use the same origin as this page. Change it if the FastAPI backend runs elsewhere.",
  "set.backend.saveReload": "Save & reload",
  "set.backend.test": "Test connection",
  "set.backend.reachable": "Backend reachable",
  "set.backend.saved": "Backend URL saved. Reloading…",
  "set.vmos.title": "VMOS Cloud API",
  "set.vmos.access": "Access Key",
  "set.vmos.secret": "Secret Key",
  "set.vmos.secretConfigured": "(configured)",
  "set.vmos.secretPh": "•••••••• (leave empty to keep)",
  "set.vmos.padMode": "PAD mode",
  "set.vmos.padAuto": "Auto (fetch from VMOS API)",
  "set.vmos.padManual": "Manual list",
  "set.vmos.manualList": "Manual PAD codes (comma or newline separated)",
  "set.sheet.title": "Google Sheet",
  "set.sheet.saJson": "Service account JSON",
  "set.sheet.id": "Spreadsheet ID",
  "set.sheet.name": "Sheet name",
  "set.sheet.startRow": "Data start row",
  "set.sheet.skip": "Skip rows already marked as SUCCESS",
  "set.timing.title": "Timing & retries",
  "set.timing.poll": "Poll interval (s)",
  "set.timing.step": "Step timeout (s)",
  "set.timing.magisk": "Magisk timeout (s)",
  "set.timing.retry": "Retry count",
  "set.timing.startDelay": "Worker start delay (s)",
  "set.timing.stepDelay": "Step delay (s)",
  "set.timing.settle": "Post-boot settle (s)",

  "set.tab.viewer": "Viewer",
  "set.viewer.title": "Viewer grid config",
  "set.viewer.rows": "Default rows",
  "set.viewer.cols": "Default columns",
  "set.viewer.baseUrl": "Armcloud H5 base URL",
  "set.viewer.baseUrlHint": "Overseas: https://openapi-hk.armcloud.net",

  "worker.waiting": "Waiting for job",

  "dash.liveLogs": "Live logs",
  "dash.viewAll": "View all",
  "dash.quickAdd": "Quick add emails",
  "dash.quickAddPh": "email|password|2FA_SECRET (one per line)",
  "dash.loadSheet": "Load Sheet",
};

const dicts: Record<Lang, Dict> = { vi, en };

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "vmos.lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("vi");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (saved === "vi" || saved === "en") setLangState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang: (l) => {
        setLangState(l);
        try {
          localStorage.setItem(STORAGE_KEY, l);
        } catch {
          /* ignore */
        }
        if (typeof document !== "undefined") document.documentElement.lang = l;
      },
      t: (key, vars) => {
        const raw = dicts[lang][key] ?? dicts.vi[key] ?? key;
        if (!vars) return raw;
        return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
      },
    }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT() {
  return useI18n().t;
}