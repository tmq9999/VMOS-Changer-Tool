"""Step 4 — Bật Kitsune Magisk qua Toolbox UI."""
from __future__ import annotations

import asyncio
import re

from backend.config import Settings
from backend.vmos_helper import VmosHelper

MAGISK_PKG = "io.github.huskydg.magisk"
_TOOLBOX_PKG = "com.android.expansiontools"
_MAGISK_TOGGLE_ID = f'{_TOOLBOX_PKG}:id/sb_magisk'
_MAGISK_CONTAINER_ID = f'{_TOOLBOX_PKG}:id/lay_xposed'
_MAGISK_TITLE_TEXT = 'Magisk (Mask)'


async def run(helper: VmosHelper, cfg: Settings, log) -> None:
    """Bật root/Magisk.

    Ưu tiên:
      1. switchRoot API (không cần UI) → nếu resetprop xuất hiện thì skip Toolbox.
      2. Fallback: bật Kitsune Magisk qua VMOS Toolbox UI (flow cũ đã xác nhận).
    """
    timeout = cfg.step_timeout
    magisk_timeout = cfg.magisk_timeout
    interval = cfg.poll_interval

    # ── Thử phương án A: switchRoot API ──────────────────────────────────────
    log("Step 4: Thử bật root qua switchRoot API trước...")
    try:
        from backend.steps.step4b_switch_root import run as try_switch_root
        got_resetprop = await try_switch_root(helper, cfg, log)
        if got_resetprop:
            log("Step 4: switchRoot cung cấp resetprop ✓ — bỏ qua Toolbox UI")
            return
        log("Step 4: switchRoot không cung cấp resetprop — fallback sang Toolbox UI")
    except RuntimeError as exc:
        log(f"Step 4: switchRoot thất bại ({exc}) — fallback sang Toolbox UI", "WARN")
    except Exception as exc:
        log(f"Step 4: switchRoot lỗi không xác định ({exc}) — fallback sang Toolbox UI", "WARN")

    # ── Fallback: bật Kitsune Magisk qua Toolbox UI ───────────────────────────
    log("Step 4: Bật Magisk qua Toolbox UI...")

    # 4.1 Tìm và click Toolbox
    log("Step 4.1: Tìm Toolbox icon...")
    await helper.run_shell("uiautomator dump /sdcard/window.xml >/dev/null 2>&1")
    await asyncio.sleep(0.5)
    coords = await helper.get_node_bounds('Toolbox')
    if not coords:
        raise RuntimeError("Không tìm thấy Toolbox icon trên Home")
    await helper.tap(*coords)
    log("Step 4.1: Click Toolbox ✓")
    # Poll cho den khi Toolbox load xong (XML > 5KB)
    for _ in range(10):
        await asyncio.sleep(2)
        await helper.run_shell("uiautomator dump /sdcard/window.xml >/dev/null 2>&1")
        await asyncio.sleep(0.5)
        sz_out = await helper.run_shell("wc -c /sdcard/window.xml 2>/dev/null")
        sz_m = re.search(r'(\d+)', sz_out or '')
        if sz_m and int(sz_m.group(1)) > 5000:
            break

    # 4.2 Tim sb_magisk (Toolbox load san o trang co Magisk, khong can scroll truoc)
    log("Step 4.2: Tìm Magisk toggle...")
    magisk_node, checked = await _find_magisk_toggle(helper, max_swipes=5, interval=interval)
    if not magisk_node:
        raise RuntimeError("Không tìm thấy Magisk toggle sau scroll")
    log("Step 4.2: Tìm thấy Magisk toggle ✓")

    # 4.3 Kiểm tra trạng thái và click ON nếu đang OFF
    if checked == 'true':
        log("Step 4.3: Magisk đã ON — bỏ qua click")
    else:
        coords = VmosHelper.extract_bounds(magisk_node)
        if not coords:
            raise RuntimeError("sb_magisk không có bounds")
        await helper.tap(*coords)
        log("Step 4.3: Click ON Magisk ✓")
        await asyncio.sleep(2)

    # 4.4 Poll "Confirm" dialog — Magisk download (~120s)
    log("Step 4.4: Chờ Confirm dialog (Magisk download)...")
    state = await _detect_state(helper, checks=[
        ('text="Confirm"',    "CONFIRM"),
        ('text="OK"',         "CONFIRM"),
        ('text="Restart"',    "RESTART"),
        ('text="Restart now"',"RESTART"),
    ], timeout=magisk_timeout, interval=interval)

    if state in ("CONFIRM", "OK"):
        await helper.run_shell("uiautomator dump /sdcard/window.xml >/dev/null 2>&1")
        await asyncio.sleep(0.5)
        coords = await helper.get_node_bounds('Confirm') or await helper.get_node_bounds('OK')
        if coords:
            await helper.tap(*coords)
            log("Step 4.4: Click Confirm ✓")
        await asyncio.sleep(2)

    # 4.5 Poll "Restart now?" dialog
    if state != "RESTART":
        log("Step 4.5: Chờ Restart dialog...")
        state2 = await _detect_state(helper, checks=[
            ('text="Restart"',     "RESTART"),
            ('text="Restart now"', "RESTART"),
            ('text="Reboot"',      "RESTART"),
        ], timeout=60, interval=interval)
        if state2 != "RESTART":
            raise RuntimeError("Timeout chờ Restart dialog sau Magisk confirm")

    await helper.run_shell("uiautomator dump /sdcard/window.xml >/dev/null 2>&1")
    await asyncio.sleep(0.5)
    coords = (await helper.get_node_bounds('Restart now')
              or await helper.get_node_bounds('Restart')
              or await helper.get_node_bounds('Reboot'))
    if coords:
        await helper.tap(*coords)
        log("Step 4.5: Click Restart — thiết bị đang reboot...")
    await asyncio.sleep(10)

    # 4.6 Chờ reboot xong (padStatus=10)
    log("Step 4.6: Chờ reboot xong...")
    ready = await helper.wait_pad_ready(timeout=180, poll=5)
    if not ready:
        raise RuntimeError("Timeout chờ reboot sau Magisk enable")
    log("Step 4.6: Reboot xong, instance ready ✓")
    await asyncio.sleep(5)

    # 4.7 Verify Magisk installed
    log("Step 4.7: Verify Magisk...")
    pkgs = await helper.list_installed_apps()
    if MAGISK_PKG not in pkgs:
        raise RuntimeError("Magisk không xuất hiện trong installed packages sau reboot")
    log("Step 4.7: Magisk verified ✓")

    await helper.clean_app_home()


async def _find_magisk_toggle(helper: VmosHelper, max_swipes: int,
                               interval: float) -> tuple[str | None, str]:
    """Tìm sb_magisk: lấy bounds và checked riêng để tránh truncation.
    Returns (fake_node_with_bounds, checked_value) hoặc (None, 'false').
    """
    for attempt in range(max_swipes):
        await asyncio.sleep(2)  # cho Toolbox load xong
        await helper.run_shell("uiautomator dump /sdcard/window.xml >/dev/null 2>&1")
        await asyncio.sleep(0.5)
        # Lấy bounds riêng (ngắn, không bị truncate)
        bounds_out = await helper.run_shell(
            "sed 's/<node/\\n<node/g' /sdcard/window.xml 2>/dev/null"
            " | grep 'sb_magisk'"
            " | grep -o 'bounds=\"[^\"]*\"' | head -1"
        )
        # Lấy checked riêng
        checked_out = await helper.run_shell(
            "sed 's/<node/\\n<node/g' /sdcard/window.xml 2>/dev/null"
            " | grep 'sb_magisk'"
            " | grep -o 'checked=\"[^\"]*\"' | head -1"
        )
        if bounds_out.strip():
            chk_m = re.search(r'checked="([^"]+)"', checked_out or '')
            checked = chk_m.group(1) if chk_m else 'false'
            fake_node = f'<node resource-id="sb_magisk" {bounds_out.strip()} />'
            return fake_node, checked
        if attempt < max_swipes - 1:
            # Scroll xuong tim (sb_magisk co the o duoi man hinh)
            await helper.swipe(540, 1600, 540, 700, 500)
            await asyncio.sleep(interval)
    return None, 'false'


async def _detect_state(helper: VmosHelper, checks: list[tuple[str, str]],
                        timeout: float, interval: float) -> str:
    elapsed = 0.0
    while elapsed < timeout:
        await helper.run_shell("uiautomator dump /sdcard/window.xml >/dev/null 2>&1")
        await asyncio.sleep(0.5)
        for pattern, label in checks:
            kw = pattern.split('"')[1] if '"' in pattern else pattern
            found = await helper.run_shell(
                f"grep -c '{kw}' /sdcard/window.xml 2>/dev/null"
            )
            if found.strip() not in ('', '0'):
                return label
        await asyncio.sleep(interval)
        elapsed += interval + 0.5
    return "TIMEOUT"


def _find_node_by_text(xml: str, text_lower: str):
    for m in re.finditer(r'<node\b[^>]*(?:/>|>)', xml, re.DOTALL):
        node = m.group(0)
        tm = re.search(r'\btext="([^"]*)"', node)
        if tm and tm.group(1).lower() == text_lower and 'bounds="' in node:
            return node
    return None
