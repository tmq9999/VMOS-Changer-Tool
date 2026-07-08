"""Step 4B — Bật root qua switchRoot API, verify resetprop tồn tại.

Đây là phương án thay thế tự động cho step4_magisk_on (bật Magisk bằng tay).
Flow:
  1. Gọi switchRoot API (globalRoot=true, rootStatus=true).
  2. Chờ ngắn cho API áp dụng (5s).
  3. Kiểm tra /system/bin/resetprop có xuất hiện không.
  4. Nếu có → return True (caller dùng step5_spoof bình thường).
  5. Nếu không → raise RuntimeError để caller biết cần fallback sang Magisk UI.
"""
from __future__ import annotations

import asyncio

from backend.config import Settings
from backend.vmos_helper import VmosHelper

_SETTLE_WAIT: float = 5.0   # giây chờ sau switchRoot trước khi check
_MAX_ATTEMPTS: int = 3      # số lần thử gọi switchRoot


async def run(helper: VmosHelper, cfg: Settings, log) -> bool:
    """Thử bật root qua API.

    Returns:
        True  — resetprop xuất hiện, caller có thể chạy step5 ngay.
        False — switchRoot không cung cấp resetprop (device không phải VMOS
                native root hoặc API chỉ bật su cho app không phải Magisk).

    Raises:
        RuntimeError — nếu switchRoot API bị lỗi liên tục.
    """
    log("Step 4B: Thử bật root qua switchRoot API...")

    last_err: Exception | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            await helper.switch_root(global_root=True, root_status=True)
            log(f"Step 4B: switchRoot API thành công (lần {attempt})")
            break
        except Exception as exc:
            last_err = exc
            log(f"Step 4B: switchRoot lần {attempt} lỗi: {exc}", "WARN")
            if attempt < _MAX_ATTEMPTS:
                await asyncio.sleep(3)
    else:
        raise RuntimeError(
            f"WARN: switchRoot thất bại sau {_MAX_ATTEMPTS} lần: {last_err}"
        )

    log(f"Step 4B: Chờ {_SETTLE_WAIT}s cho API áp dụng...")
    await asyncio.sleep(_SETTLE_WAIT)

    has_resetprop = await helper.check_resetprop()
    if has_resetprop:
        log("Step 4B: /system/bin/resetprop tồn tại ✓ — có thể spoof mà không cần Magisk UI")
        return True

    log(
        "Step 4B: /system/bin/resetprop KHÔNG tồn tại sau switchRoot — "
        "switchRoot không cung cấp môi trường Magisk/resetprop",
        "WARN",
    )
    return False


async def probe_only(helper: VmosHelper, log) -> dict:
    """Probe-only: không raise, chỉ trả về dict trạng thái để debug/API endpoint.

    Returns dict với keys:
        switch_root_ok (bool), has_resetprop (bool), has_apmt (bool), error (str|None)
    """
    result = {
        "switch_root_ok": False,
        "has_resetprop": False,
        "has_apmt": False,
        "error": None,
    }
    try:
        await helper.switch_root(global_root=True, root_status=True)
        result["switch_root_ok"] = True
    except Exception as exc:
        result["error"] = str(exc)
        log(f"Step 4B probe: switchRoot lỗi: {exc}", "WARN")
        return result

    await asyncio.sleep(_SETTLE_WAIT)

    result["has_resetprop"] = await helper.check_resetprop()
    result["has_apmt"] = await helper.check_apmt()
    return result
