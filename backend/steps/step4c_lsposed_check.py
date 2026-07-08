"""Step 4C — Kiểm tra LSPosed / apmt trên real device pad.

Chức năng:
  1. Probe apmt availability qua asyncCmd.
  2. Nếu apmt có sẵn, list các patch đang load.
  3. Trả về dict trạng thái để caller (API endpoint hoặc worker) quyết định.

NOTE: Bước này hiện chỉ là probe/info — KHÔNG tự động cài hook APK vì cần
      build APK trước. Caller dùng kết quả để quyết định có cần fallback không.
"""
from __future__ import annotations

import asyncio
import re

from backend.config import Settings
from backend.vmos_helper import VmosHelper

_APMT_HOOK_NAME = "pixel10_spoof"
_TARGET_PKG = "android"           # hook SystemServer để patch Build.*


async def probe(helper: VmosHelper, log) -> dict:
    """Kiểm tra apmt + liệt kê patch đang active.

    Returns dict:
        has_apmt (bool), patch_list (list[str]), error (str|None)
    """
    result: dict = {"has_apmt": False, "patch_list": [], "error": None}

    has_apmt = await helper.check_apmt()
    result["has_apmt"] = has_apmt

    if not has_apmt:
        log("Step 4C: apmt KHÔNG có sẵn trên device này", "WARN")
        return result

    log("Step 4C: apmt có sẵn ✓ — lấy danh sách patch...")
    raw = await helper.run_shell("apmt patch list 2>/dev/null")
    lines = [l.strip() for l in (raw or "").splitlines() if l.strip()]
    result["patch_list"] = lines
    log(f"Step 4C: apmt patch list → {lines}")
    return result


async def run(helper: VmosHelper, cfg: Settings, log) -> dict:
    """Public entry point cho worker (nếu cần gọi từ flow chính).

    Hiện chỉ probe — KHÔNG deploy APK.
    """
    return await probe(helper, log)


async def add_hook_apk(helper: VmosHelper, apk_url: str, log) -> bool:
    """Thêm hook APK từ URL vào apmt (SystemServer).

    1. Upload APK tới /sdcard/pixel10_hook.apk qua upload_file.
    2. Chạy apmt patch add -n pixel10_spoof -p android -f /sdcard/pixel10_hook.apk.
    3. Reboot để hook có hiệu lực.
    4. Chờ pad ready.

    NOTE: Hàm này chỉ chạy được nếu probe() cho has_apmt=True và apk_url hợp lệ.
    """
    import functools

    log(f"Step 4C: Upload hook APK từ {apk_url}...")
    try:
        fn = functools.partial(
            helper._client.instance.upload_file,
            [helper.pad],
            url=apk_url,
            auto_install=0,
            customize_file_path="/sdcard/pixel10_hook.apk",
            file_name="pixel10_hook.apk",
        )
        await asyncio.to_thread(fn)
    except Exception as exc:
        log(f"Step 4C: Upload APK lỗi: {exc}", "WARN")
        return False

    await asyncio.sleep(10)  # chờ upload xong

    out = await helper.run_shell(
        f"apmt patch add -n {_APMT_HOOK_NAME} -p {_TARGET_PKG} "
        "-f /sdcard/pixel10_hook.apk 2>&1"
    )
    log(f"Step 4C: apmt patch add → {out!r}")

    if "error" in (out or "").lower() or "fail" in (out or "").lower():
        log("Step 4C: apmt patch add có vẻ thất bại", "WARN")
        return False

    log("Step 4C: apmt patch add thành công — reboot để hook có hiệu lực...")
    await helper.run_shell("reboot 2>/dev/null &")
    await asyncio.sleep(15)
    ready = await helper.wait_pad_ready(timeout=300, poll=5)
    if not ready:
        log("Step 4C: Timeout chờ reboot sau apmt", "WARN")
        return False

    log("Step 4C: Hook APK loaded ✓")
    return True


def parse_apmt_list(raw: str) -> list[str]:
    """Parse output apmt patch list thành list tên patch."""
    return [l.strip() for l in (raw or "").splitlines() if re.search(r'\S', l)]
