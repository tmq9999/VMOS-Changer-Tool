"""Step 3 — Install Google One từ Play Store."""
from __future__ import annotations

import asyncio
import re

from backend.config import Settings
from backend.vmos_helper import VmosHelper

GOOGLE_ONE_PKG = "com.google.android.apps.subscriptions.red"
_PLAY_INTENT = f"am start -a android.intent.action.VIEW -d 'market://details?id={GOOGLE_ONE_PKG}' 2>/dev/null"


async def run(helper: VmosHelper, cfg: Settings, log) -> None:
    """Mở Play Store và cài Google One."""
    timeout = cfg.step_timeout
    interval = cfg.poll_interval

    # 3.0 Kiểm tra đã installed chưa
    if await verify_installed(helper):
        log("Step 3: Google One đã installed — skip cài đặt ✓")
        await helper.clean_app_home()
        return

    # 3.1 Mở trang Play Store
    log("Step 3.1: Mở Play Store trang Google One...")
    await helper.run_shell(_PLAY_INTENT)
    await asyncio.sleep(4)

    # 3.2 Poll và click "Install"
    log("Step 3.2: Chờ nút Install...")
    found = await _poll_install_button(helper, timeout=timeout, interval=interval)
    if not found:
        raise RuntimeError("Timeout chờ Install button — Play Store không load được")
    log("Step 3.2: Click Install ✓")
    await asyncio.sleep(5)

    # 3.3 Dismiss Play Protect popup nếu có
    xml = await helper.grep_xml('Dismiss', 'Turn on Play Protect')
    if 'Turn on Play Protect' in xml or 'Turn on' in xml:
        node = _find_node_by_text(xml, 'dismiss') or _find_node_by_content_desc(xml, 'dismiss')
        if node:
            coords = VmosHelper.extract_bounds(node)
            if coords:
                await helper.tap(*coords)
                log("Step 3.3: Dismiss Play Protect ✓")
                await asyncio.sleep(1)

    # 3.4 Poll "Continue" — optional
    xml = await helper.grep_xml('Continue')
    node = _find_node_by_text(xml, 'continue')
    if node:
        coords = VmosHelper.extract_bounds(node)
        if coords:
            await helper.tap(*coords)
            log("Step 3.4: Click Continue ✓")
            await asyncio.sleep(2)

    # 3.5 Poll "Skip" — optional
    xml = await helper.grep_xml('Skip', 'skip')
    node = _find_node_by_text(xml, 'skip')
    if node:
        coords = VmosHelper.extract_bounds(node)
        if coords:
            await helper.tap(*coords)
            log("Step 3.5: Click Skip ✓")
            await asyncio.sleep(2)

    # Chờ install xong (poll "Open" hoặc package xuất hiện)
    log("Step 3: Chờ Google One cài xong...")
    installed = await _wait_for_install(helper, timeout=180, interval=5)
    if not installed:
        raise RuntimeError("Timeout chờ Google One cài xong (180s)")
    log("Step 3: Google One cài xong ✓")

    # 3.6 Clean app home
    await helper.clean_app_home()


async def verify_installed(helper: VmosHelper) -> bool:
    """Verify Google One đã cài — grep trực tiếp để tránh truncate."""
    out = await helper.run_shell(
        f"pm list packages 2>/dev/null | grep -c '{GOOGLE_ONE_PKG}'"
    )
    return (out or "").strip() not in ("", "0")


async def _poll_install_button(helper: VmosHelper, timeout: float,
                                interval: float) -> bool:
    """Tìm và click nút Install."""
    elapsed = 0.0
    while elapsed < timeout:
        xml = await helper.grep_xml('Install')
        node = _find_node_by_text(xml, 'install') or _find_node_by_content_desc(xml, 'install')
        if node:
            coords = VmosHelper.extract_bounds(node)
            if coords:
                await helper.tap(*coords)
                return True
        # Nếu đã có "Open" / "Uninstall" thì coi như installed rồi
        xml2 = await helper.grep_xml('Open', 'Uninstall')
        if 'Open' in xml2 or 'Uninstall' in xml2:
            return True
        await asyncio.sleep(interval)
        elapsed += interval
    return False


async def _wait_for_install(helper: VmosHelper, timeout: float,
                             interval: float) -> bool:
    """Chờ package installed bằng pm grep hoặc Open/Uninstall button."""
    elapsed = 0.0
    while elapsed < timeout:
        # Kiểm tra package trước (nhanh, không dump XML)
        if await verify_installed(helper):
            return True
        # Kiểm tra UI button
        xml = await helper.grep_xml('Open', 'Uninstall')
        if 'text="Open"' in xml or 'content-desc="Open"' in xml:
            return True
        if 'text="Uninstall"' in xml or 'content-desc="Uninstall"' in xml:
            return True
        await asyncio.sleep(interval)
        elapsed += interval
    return False


def _find_node_by_text(xml: str, text_lower: str):
    for m in re.finditer(r'<node\b[^>]*(?:/>|>)', xml, re.DOTALL):
        node = m.group(0)
        tm = re.search(r'\btext="([^"]*)"', node)
        if tm and tm.group(1).lower() == text_lower and 'bounds="' in node:
            return node
    return None


def _find_node_by_content_desc(xml: str, desc_lower: str):
    for m in re.finditer(r'<node\b[^>]*(?:/>|>)', xml, re.DOTALL):
        node = m.group(0)
        dm = re.search(r'\bcontent-desc="([^"]*)"', node)
        if dm and desc_lower in dm.group(1).lower() and 'bounds="' in node:
            return node
    return None
