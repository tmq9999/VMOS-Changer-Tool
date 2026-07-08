"""FastAPI backend — REST API + WebSocket realtime."""
from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend import db, callback_bus
from backend.config import Settings, load_settings, save_settings
from backend.queue_manager import EmailQueue, PadPool, QueuedJob
from backend.validator import EmailEntry, validate_bulk
from backend.worker import run_all_workers, get_all_worker_states

# ── State ─────────────────────────────────────────────────────────────────────

_settings: Settings = load_settings()
_queue: Optional[EmailQueue] = None
_pad_pool: Optional[PadPool] = None
_worker_task: Optional[asyncio.Task] = None
_ws_clients: list[WebSocket] = []
_sheets_client = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    db.reset_running_jobs()
    yield


app = FastAPI(title="VMOS Changer Tool", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")


# ── VMOS Webhook callback ────────────────────────────────────────────────────

@app.post("/api/vmos-callback")
async def vmos_callback(request: Request):
    """Nhận callback từ VMOS SDK (ADB cmd result, instance status, v.v.)"""
    body = await request.json()
    task_id = body.get("taskId")
    task_business_type = body.get("taskBusinessType", 0)
    # ADB command callback (1002) — dùng cmdResult thay taskResult
    if task_business_type == 1002 and task_id:
        cmd_result = body.get("cmdResult") or body.get("taskResult") or ""
        callback_bus.resolve(int(task_id), cmd_result)
    # Other task callbacks
    elif task_id:
        task_result = body.get("taskResult") or ""
        callback_bus.resolve(int(task_id), task_result)
    return {"ok": True}


# ── WebSocket broadcast ───────────────────────────────────────────────────────

def broadcast(pad_code: str, event_type: str, data: dict) -> None:
    """Gửi event tới tất cả WebSocket clients đang kết nối."""
    payload = json.dumps({"type": event_type, "pad": pad_code, "data": data})
    dead = []
    for ws in _ws_clients:
        try:
            asyncio.create_task(ws.send_text(payload))
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_clients.remove(ws)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    _ws_clients.append(ws)
    try:
        # Gửi snapshot trạng thái hiện tại
        states = get_all_worker_states()
        await ws.send_text(json.dumps({"type": "snapshot", "data": states}))
        while True:
            await ws.receive_text()  # keep-alive
    except WebSocketDisconnect:
        _ws_clients.remove(ws)


# ── Settings API ──────────────────────────────────────────────────────────────

@app.get("/api/settings")
async def get_settings():
    s = _settings.model_dump()
    s["has_secret_key"] = bool(s.pop("secret_key", ""))  # không expose raw key, chỉ báo đã có
    return s


@app.post("/api/settings")
async def update_settings(body: dict):
    global _settings
    current = _settings.model_dump()
    current.update(body)
    _settings = Settings(**current)
    save_settings(_settings)
    return {"ok": True}


# ── Emails / Queue API ────────────────────────────────────────────────────────

class EmailsPayload(BaseModel):
    text: str


@app.post("/api/emails/validate")
async def validate_emails(payload: EmailsPayload):
    """Validate bulk email text, trả về valid/invalid list."""
    valid, errors = validate_bulk(payload.text)
    return {
        "valid": [e.raw for e in valid],
        "invalid": [{"line": ln, "error": msg} for ln, msg in errors],
        "valid_count": len(valid),
        "invalid_count": len(errors),
    }


@app.post("/api/emails/add")
async def add_emails(payload: EmailsPayload):
    """Validate + add emails vào queue, bỏ qua trùng."""
    global _queue
    if _queue is None:
        _queue = EmailQueue()

    valid, errors = validate_bulk(payload.text)
    already_queued = db.get_active_emails()
    added, skipped_dup = 0, 0
    for entry in valid:
        if entry.email in already_queued:
            skipped_dup += 1
            continue
        already_queued.add(entry.email)  # prevent double-add trong cùng 1 batch
        job_id = db.create_job(entry.email)
        await _queue.put(QueuedJob(entry=entry, job_id=job_id))
        added += 1

    return {
        "added": added,
        "skipped_duplicate": skipped_dup,
        "invalid_count": len(errors),
        "invalid": [{"line": ln, "error": msg} for ln, msg in errors],
    }


@app.post("/api/sheets/load")
async def load_from_sheets():
    """Đọc email từ Google Sheet và add vào queue."""
    global _queue, _sheets_client
    if not _settings.spreadsheet_id or not _settings.service_account_json:
        return JSONResponse({"error": "Google Sheet chưa cấu hình"}, status_code=400)

    try:
        from backend.sheets import SheetsClient
        _sheets_client = SheetsClient(
            service_account_json=_settings.service_account_json,
            spreadsheet_id=_settings.spreadsheet_id,
            sheet_name=_settings.sheet_name,
            data_start_row=_settings.data_start_row,
        )
        rows = await asyncio.to_thread(
            _sheets_client.read_emails, _settings.skip_successful
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

    if _queue is None:
        _queue = EmailQueue()

    from backend.validator import validate_line
    already_queued = db.get_active_emails()
    added, skipped_invalid, skipped_dup = 0, 0, 0
    for row_data in rows:
        line = f"{row_data['email']}|{row_data['password']}|{row_data['totp_secret']}"
        result = validate_line(line)
        if result.valid and result.entry:
            if result.entry.email in already_queued:
                skipped_dup += 1
                continue
            already_queued.add(result.entry.email)
            job_id = db.create_job(result.entry.email, sheet_row=row_data["row"])
            await _queue.put(QueuedJob(
                entry=result.entry,
                sheet_row=row_data["row"],
                job_id=job_id,
            ))
            added += 1
        else:
            skipped_invalid += 1

    return {
        "loaded": added,
        "skipped_duplicate": skipped_dup,
        "skipped_invalid": skipped_invalid,
        "queue_size": _queue.qsize(),
    }


@app.post("/api/sheets/test")
async def test_sheets_connection():
    """Test kết nối Google Sheet, trả về số dòng và tiêu đề spreadsheet."""
    if not _settings.spreadsheet_id or not _settings.service_account_json:
        return {"ok": False, "error": "Google Sheet chưa cấu hình"}

    def _probe() -> dict:
        from backend.sheets import SheetsClient
        client = SheetsClient(
            service_account_json=_settings.service_account_json,
            spreadsheet_id=_settings.spreadsheet_id,
            sheet_name=_settings.sheet_name,
            data_start_row=_settings.data_start_row,
        )
        rows = client.read_emails(skip_successful=False)
        return {
            "ok": True,
            "rows": len(rows),
            "title": getattr(client._ss, "title", ""),
        }

    try:
        return await asyncio.to_thread(_probe)
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── PAD Management ────────────────────────────────────────────────────────────

@app.get("/api/pads")
async def get_pads():
    """Lấy danh sách PAD từ VMOS API hoặc manual list."""
    if _settings.pad_mode == "manual":
        return {"pads": _settings.manual_pad_codes, "source": "manual"}

    if not _settings.access_key or not _settings.secret_key:
        return JSONResponse({"error": "VMOS API chưa cấu hình"}, status_code=400)

    last_err = ""
    for _attempt in range(4):
        try:
            from vmos_sdk import VmosClient
            _c = VmosClient(access_key=_settings.access_key,
                            secret_key=_settings.secret_key)
            _r = await asyncio.to_thread(
                _c.instance.get_list_info, page=1, rows=100
            )
            _c.close()
            page_data = _r.data.get("pageData", []) if isinstance(_r.data, dict) else []
            pads = [p["padCode"] for p in page_data if p.get("padCode")]
            return {"pads": pads, "source": "auto", "total": len(pads)}
        except Exception as e:
            last_err = str(e)
            if "busy" in last_err.lower() and _attempt < 3:
                await asyncio.sleep(5 * (_attempt + 1))
                continue
            break
    return JSONResponse({"error": last_err}, status_code=500)


def _extract_token(data) -> Optional[str]:
    """Trích token từ response stsTokenByPadCode (data có thể là str hoặc dict)."""
    if isinstance(data, str):
        return data
    if isinstance(data, dict):
        for key in ("token", "stsToken", "access", "accessToken"):
            v = data.get(key)
            if isinstance(v, str) and v:
                return v
    return None


@app.get("/api/pads/{pad_code}/h5-token")
async def get_h5_token(pad_code: str):
    """Lấy token tạm cho Armcloud H5 SDK theo padCode (view-only live stream).

    Backend dùng access_key/secret_key gọi VMOS stsTokenByPadCode,
    không expose secret key ra client.
    """
    if not _settings.access_key or not _settings.secret_key:
        return JSONResponse({"error": "VMOS API chưa cấu hình"}, status_code=400)

    try:
        from vmos_sdk import VmosClient
        client = VmosClient(access_key=_settings.access_key,
                            secret_key=_settings.secret_key)
        r = await asyncio.to_thread(client.sdk_token.get_token_by_padcode, pad_code)
        client.close()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

    token = _extract_token(r.data)
    if not token:
        return JSONResponse(
            {"error": "Không lấy được token", "raw": r.data}, status_code=502
        )

    return {
        "token": token,
        "baseUrl": _settings.h5_base_url,
        "padCode": pad_code,
    }


# ── Runner API ────────────────────────────────────────────────────────────────

class RunPayload(BaseModel):
    pad_codes: Optional[list[str]] = None


@app.post("/api/queue/clear")
async def clear_queue():
    """Xóa toàn bộ queue và reset jobs về trạng thái sạch."""
    global _queue
    _queue = EmailQueue()  # tạo queue rỗng mới
    db.clear_jobs()
    return {"ok": True}


@app.post("/api/run/start")
async def start_run(payload: RunPayload):
    """Bắt đầu chạy workers."""
    global _worker_task, _queue

    if _worker_task and not _worker_task.done():
        return JSONResponse({"error": "Workers đang chạy"}, status_code=400)

    if _queue is None or _queue.empty():
        return JSONResponse({"error": "Queue trống"}, status_code=400)

    pad_codes = payload.pad_codes or _settings.manual_pad_codes
    if not pad_codes and _settings.pad_mode == "auto":
        r = await get_pads()
        pad_codes = r.get("pads", []) if isinstance(r, dict) else []

    if not pad_codes:
        return JSONResponse({"error": "Không có PAD code"}, status_code=400)

    _worker_task = asyncio.create_task(
        run_all_workers(
            pad_codes=pad_codes,
            queue=_queue,
            settings=_settings,
            sheets_writer=_sheets_client,
            broadcast=broadcast,
        )
    )
    return {"ok": True, "workers": len(pad_codes), "queue_size": _queue.qsize()}


@app.post("/api/run/stop")
async def stop_run():
    """Cancel worker tasks."""
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        return {"ok": True, "message": "Workers đang dừng..."}
    return {"ok": True, "message": "Không có worker nào đang chạy"}


# ── Jobs / Logs API ───────────────────────────────────────────────────────────

@app.get("/api/jobs")
async def get_jobs():
    return db.get_all_jobs()


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: int):
    job = db.get_job(job_id)
    if not job:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return job


@app.get("/api/logs")
async def get_logs(limit: int = 200, pad: Optional[str] = None,
                   level: Optional[str] = None):
    return db.get_logs(limit=limit, pad_code=pad, level=level)


@app.delete("/api/logs")
async def delete_logs():
    db.clear_logs()
    return {"ok": True}


@app.get("/api/stats", include_in_schema=True)
async def get_stats():
    jobs = db.get_all_jobs()
    counts = {"TOTAL": len(jobs), "QUEUED": 0, "RUNNING": 0,
              "SUCCESS": 0, "WARN": 0, "ERROR": 0}
    for j in jobs:
        s = j.get("status", "")
        if s in counts:
            counts[s] += 1
    return {
        "total": len(jobs),
        "success": counts["SUCCESS"],
        "failed": counts["ERROR"] + counts["WARN"],
        "running": counts["RUNNING"],
        "pending": counts["QUEUED"],
        "queue_size": _queue.qsize() if _queue else 0,
        "workers": len(get_all_worker_states()),
    }


# ── PAD — Direct Spoof / Root / Hook / Template endpoints ────────────────────

def _make_helper(settings: Settings, pad_code: str):
    """Factory: tạo VmosHelper dùng 1 lần cho các endpoint ad-hoc."""
    from backend.vmos_helper import VmosHelper
    return VmosHelper(
        access_key=settings.access_key,
        secret_key=settings.secret_key,
        pad_code=pad_code,
    )


@app.post("/api/pads/{pad_code}/switch-root")
async def pad_switch_root(pad_code: str):
    """Probe switchRoot API + kiểm tra resetprop / apmt.

    Trả về:
        switch_root_ok, has_resetprop, has_apmt, error
    """
    if not _settings.access_key or not _settings.secret_key:
        return JSONResponse({"error": "VMOS API chưa cấu hình"}, status_code=400)

    from backend.steps.step4b_switch_root import probe_only

    logs: list[str] = []

    def _log(msg: str, level: str = "INFO") -> None:
        logs.append(f"[{level}] {msg}")

    helper = _make_helper(_settings, pad_code)
    try:
        result = await probe_only(helper, _log)
    except Exception as exc:
        return JSONResponse({"error": str(exc), "logs": logs}, status_code=500)
    finally:
        helper.close()

    result["logs"] = logs
    return result


@app.post("/api/pads/{pad_code}/spoof-resetprop")
async def pad_spoof_resetprop(pad_code: str):
    """Chạy spoof Pixel 10 Pro bằng resetprop (giả định Magisk/switchRoot đã active).

    Trả về:
        ok (bool), output (str), error (str|None)
    """
    if not _settings.access_key or not _settings.secret_key:
        return JSONResponse({"error": "VMOS API chưa cấu hình"}, status_code=400)

    from backend.steps.step5_spoof import BATCH1, BATCH2, _EXPECTED_MODEL, _EXPECTED_DEVICE

    helper = _make_helper(_settings, pad_code)
    logs: list[str] = []

    def _log(msg: str, level: str = "INFO") -> None:
        logs.append(f"[{level}] {msg}")

    try:
        _log("Chạy batch1...")
        out1 = await helper.run_shell(BATCH1)
        if "BATCH1_OK" not in (out1 or ""):
            _log(f"Batch1 không có BATCH1_OK: {out1!r}", "WARN")

        _log("Chạy batch2...")
        out2 = await helper.run_shell(BATCH2)

        ok = _EXPECTED_MODEL in (out2 or "") and _EXPECTED_DEVICE in (out2 or "")
        _log("Spoof thành công ✓" if ok else f"Verify thất bại: {out2!r}", "INFO" if ok else "WARN")
        return {"ok": ok, "output": out2, "logs": logs}
    except Exception as exc:
        return JSONResponse({"error": str(exc), "logs": logs}, status_code=500)
    finally:
        helper.close()


@app.get("/api/pads/{pad_code}/hook-status")
async def pad_hook_status(pad_code: str):
    """Kiểm tra apmt availability + danh sách patch đang active.

    Trả về:
        has_apmt (bool), patch_list (list[str]), error (str|None)
    """
    if not _settings.access_key or not _settings.secret_key:
        return JSONResponse({"error": "VMOS API chưa cấu hình"}, status_code=400)

    from backend.steps.step4c_lsposed_check import probe

    logs: list[str] = []

    def _log(msg: str, level: str = "INFO") -> None:
        logs.append(f"[{level}] {msg}")

    helper = _make_helper(_settings, pad_code)
    try:
        result = await probe(helper, _log)
    except Exception as exc:
        return JSONResponse({"error": str(exc), "logs": logs}, status_code=500)
    finally:
        helper.close()

    result["logs"] = logs
    return result


class ChangeTemplatePayload(BaseModel):
    template_id: int
    wipe_data: bool = True


@app.post("/api/pads/{pad_code}/change-template")
async def pad_change_template(pad_code: str, payload: ChangeTemplatePayload):
    """Đổi ADI template real device (replaceRealAdiTemplate).

    Trả về:
        ok (bool), error (str|None)
    """
    if not _settings.access_key or not _settings.secret_key:
        return JSONResponse({"error": "VMOS API chưa cấu hình"}, status_code=400)

    helper = _make_helper(_settings, pad_code)
    try:
        ready = await helper.modify_real_adi_template(
            template_id=payload.template_id,
            wipe_data=payload.wipe_data,
        )
        return {"ok": ready, "pad_code": pad_code, "template_id": payload.template_id}
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)
    finally:
        helper.close()


# ── SPA Fallback — mount last so API routes take priority ────────────────────

if os.path.isdir(_frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(_frontend_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        from fastapi.responses import FileResponse
        index = os.path.join(_frontend_dist, "index.html")
        return FileResponse(index)
