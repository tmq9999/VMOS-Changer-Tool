"""Step 1 — New Device (padReplaceNew)."""
from __future__ import annotations

import asyncio

from vmos_sdk.exceptions import VmosError

from backend.vmos_helper import VmosHelper


TEMPLATE_ID = 36  # Google Pixel 7 Pro
_RATE_LIMIT_WAIT = 185  # giây chờ khi bị [1219]
_MAX_RETRIES = 3


async def run(helper: VmosHelper, log) -> None:
    """Thay thiết bị mới và chờ instance sẵn sàng.

    Args:
        helper: VmosHelper instance
        log: callable(message, level="INFO")
    """
    log("Step 1: New Device — gọi padReplaceNew...")
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            ready = await helper.new_device(template_id=TEMPLATE_ID)
            break
        except VmosError as e:
            if e.code == 1219 and attempt < _MAX_RETRIES:
                log(f"Step 1: Rate-limit [1219] — chờ {_RATE_LIMIT_WAIT}s rồi retry ({attempt}/{_MAX_RETRIES - 1})...", "WARN")
                await asyncio.sleep(_RATE_LIMIT_WAIT)
            else:
                raise RuntimeError(f"padReplaceNew thất bại [{e.code}]: {e}") from e
    else:
        raise RuntimeError("Step 1: Hết retry padReplaceNew")

    if not ready:
        raise RuntimeError("Timeout chờ instance ready sau padReplaceNew (360s)")
    log("Step 1: Instance sẵn sàng ✓")
