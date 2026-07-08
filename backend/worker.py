"""Core worker engine — mỗi PAD chạy 1 asyncio Task xử lý email từ queue."""
from __future__ import annotations

import asyncio
import time
import traceback
from datetime import datetime
from typing import Callable, Optional

from backend import db
from backend.config import Settings
from backend.queue_manager import EmailQueue, PadPool, QueuedJob
from backend.vmos_helper import VmosHelper
from backend.steps import (
    step1_new_device,
    step2_login_google,
    step3_install_google_one,
    step4_magisk_on,
    step5_spoof,
    step6_get_offer,
)

# broadcast_fn: callable(pad_code, event_type, data_dict) → gửi qua WebSocket
BroadcastFn = Callable[[str, str, dict], None]

# Trạng thái worker toàn cục: pad_code → trạng thái hiện tại
_worker_states: dict[str, dict] = {}

# Đếm số batch đã chạy trong phiên hiện tại
_batch_counter: int = 0


def get_all_worker_states() -> dict[str, dict]:
    return dict(_worker_states)


def _set_state(pad: str, status: str, email: str = "", step: str = "",
               broadcast: Optional[BroadcastFn] = None) -> None:
    _worker_states[pad] = {"pad": pad, "pad_code": pad, "status": status,
                           "email": email, "step": step}
    if broadcast:
        broadcast(pad, "worker_update", _worker_states[pad])


async def run_worker(
    pad_code: str,
    queue: EmailQueue,
    settings: Settings,
    sheets_writer,          # sheets.SheetsWriter | None
    broadcast: Optional[BroadcastFn] = None,
    start_delay: float = 0.0,
) -> None:
    """Worker loop: lấy job từ queue, chạy full flow, ghi kết quả."""
    await asyncio.sleep(start_delay)
    _set_state(pad_code, "IDLE", broadcast=broadcast)

    helper = VmosHelper(
        access_key=settings.access_key,
        secret_key=settings.secret_key,
        pad_code=pad_code,
    )

    def log(msg: str, level: str = "INFO") -> None:
        db.add_log(msg, level=level, pad_code=pad_code,
                   job_id=current_job_id)
        if broadcast:
            broadcast(pad_code, "log", {"level": level, "message": msg, "pad": pad_code})

    current_job_id: Optional[int] = None

    try:
        while not queue.empty():
            job: QueuedJob = await queue.get()
            current_job_id = job.job_id
            entry = job.entry

            _set_state(pad_code, "RUNNING", email=entry.email,
                       step="start", broadcast=broadcast)
            db.update_job(current_job_id, status="RUNNING", pad_code=pad_code)

            offer_links: list[str] = []
            error_msg: str = ""
            severity: str = "ERROR"  # "SUCCESS" | "WARN" | "ERROR"

            try:
                # ── Step 1: New Device ────────────────────────────────────────
                _set_step(pad_code, "step1_new_device", current_job_id, broadcast)
                await step1_new_device.run(helper, log)
                await asyncio.sleep(settings.step_delay)

                # ── Step 2: Login Google ──────────────────────────────────────
                _set_step(pad_code, "step2_login_google", current_job_id, broadcast)
                await step2_login_google.run(helper, entry, settings, log)
                await asyncio.sleep(settings.step_delay)

                # ── Step 3: Install Google One ────────────────────────────────
                _set_step(pad_code, "step3_install_google_one", current_job_id, broadcast)
                await step3_install_google_one.run(helper, settings, log)
                await asyncio.sleep(settings.step_delay)

                # ── Step 4: Magisk ON ─────────────────────────────────────────
                _set_step(pad_code, "step4_magisk_on", current_job_id, broadcast)
                await step4_magisk_on.run(helper, settings, log)
                await asyncio.sleep(settings.step_delay)

                # ── Step 5: Spoof ─────────────────────────────────────────────
                _set_step(pad_code, "step5_spoof", current_job_id, broadcast)
                await step5_spoof.run(helper, settings, log)
                await asyncio.sleep(settings.step_delay)

                # ── Step 6: Get Offer ─────────────────────────────────────────
                _set_step(pad_code, "step6_get_offer", current_job_id, broadcast)
                offer_links = await step6_get_offer.run(helper, settings, log)

                severity = "SUCCESS"

            except RuntimeError as exc:
                msg = str(exc)
                error_msg = msg
                severity = "WARN" if msg.startswith("WARN:") else "ERROR"
                log(f"Job {current_job_id} failed: {msg}", level=severity)
            except Exception as exc:
                error_msg = f"ERROR: Unexpected — {exc}"
                severity = "ERROR"
                log(f"Job {current_job_id} unexpected error:\n{traceback.format_exc()}", "ERROR")

            # ── Ghi kết quả ──────────────────────────────────────────────────
            offer1 = offer_links[0] if len(offer_links) > 0 else None
            offer2 = offer_links[1] if len(offer_links) > 1 else None
            result_msg = "SUCCESS" if severity == "SUCCESS" else error_msg

            db.update_job(
                current_job_id,
                status=severity,
                step=None,
                offer1=offer1,
                offer2=offer2,
                result_msg=result_msg,
            )

            if sheets_writer and job.sheet_row:
                try:
                    await asyncio.to_thread(
                        sheets_writer.write_result,
                        row=job.sheet_row,
                        offer1=offer1,
                        offer2=offer2,
                        result=result_msg,
                        full_format=entry.raw,
                        severity=severity,
                    )
                except Exception as e:
                    log(f"Sheets write error: {e}", "WARN")

            if broadcast:
                broadcast(pad_code, "job_update", {
                    "job_id": current_job_id,
                    "email": entry.email,
                    "severity": severity,
                    "status": severity,
                    "offer1": offer1,
                    "offer2": offer2,
                    "result": result_msg,
                })

            _set_state(pad_code, "IDLE", broadcast=broadcast)
            queue.task_done()

    finally:
        helper.close()
        _set_state(pad_code, "STOPPED", broadcast=broadcast)


async def run_all_workers(
    pad_codes: list[str],
    queue: EmailQueue,
    settings: Settings,
    sheets_writer=None,
    broadcast: Optional[BroadcastFn] = None,
) -> None:
    """Khởi động tất cả worker tasks song song."""
    global _batch_counter
    _batch_counter += 1
    batch_num = _batch_counter
    started_at = time.time()

    # Chụp danh sách job thuộc batch này (đang QUEUED trước khi chạy)
    batch_job_ids = {
        j["id"] for j in db.get_all_jobs() if j.get("status") == "QUEUED"
    }

    tasks = []
    for i, pad in enumerate(pad_codes):
        delay = i * settings.worker_start_delay
        task = asyncio.create_task(
            run_worker(pad, queue, settings, sheets_writer, broadcast, start_delay=delay),
            name=f"worker-{pad}",
        )
        tasks.append(task)

    await asyncio.gather(*tasks, return_exceptions=True)

    if broadcast:
        _broadcast_batch_done(batch_num, batch_job_ids, started_at, broadcast)


def _broadcast_batch_done(batch_num: int, job_ids: set[int],
                          started_at: float, broadcast: BroadcastFn) -> None:
    """Tổng hợp kết quả batch và broadcast event batch_done cho frontend."""
    jobs = [j for j in db.get_all_jobs() if j.get("id") in job_ids]

    def _row_label(j: dict) -> str:
        return str(j.get("sheet_row") if j.get("sheet_row") else j.get("email", ""))

    success_rows: list[str] = []
    failed_rows: list[str] = []
    fail_reasons: list[str] = []
    for j in jobs:
        if j.get("status") == "SUCCESS":
            success_rows.append(_row_label(j))
        else:
            failed_rows.append(_row_label(j))
            reason = j.get("result_msg") or j.get("status") or "Unknown"
            fail_reasons.append(str(reason))

    duration_min = round((time.time() - started_at) / 60.0, 1)
    broadcast("", "batch_done", {
        "batch_num": batch_num,
        "total": len(jobs),
        "success": len(success_rows),
        "failed": len(failed_rows),
        "success_rows": success_rows,
        "failed_rows": failed_rows,
        "fail_reasons": fail_reasons,
        "duration_min": duration_min,
        "time": datetime.now().strftime("%H:%M:%S"),
    })


# ── Helpers ───────────────────────────────────────────────────────────────────

def _set_step(pad: str, step: str, job_id: Optional[int],
              broadcast: Optional[BroadcastFn]) -> None:
    if pad in _worker_states:
        _worker_states[pad]["step"] = step
    db.update_job(job_id, step=step)
    if broadcast:
        broadcast(pad, "worker_update", _worker_states.get(pad, {}))
