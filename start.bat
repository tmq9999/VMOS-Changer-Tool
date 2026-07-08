@echo off
REM ── VMOS Changer Tool — khởi động backend (FastAPI) + webUI_v2 (TanStack) ──
REM Mở 2 cửa sổ: backend :8000 và web UI :8080 (proxy /api + /ws sang :8000).
cd /d "%~dp0"

echo [1/2] Starting FastAPI backend on http://localhost:8000 ...
start "VMOS Backend (:8000)" cmd /k python run.py

echo [2/2] Starting webUI_v2 dev server on http://localhost:8080 ...
start "VMOS WebUI (:8080)" cmd /k "cd /d "%~dp0webUI_v2" && bun run dev"

echo.
echo Da khoi dong. Mo trinh duyet tai: http://localhost:8080
echo (Backend API: http://localhost:8000)
