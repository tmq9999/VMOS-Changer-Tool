"""Step 2 — Login Google Account với state machine linh hoạt."""
from __future__ import annotations

import asyncio
import re
from typing import Optional

import pyotp

from backend.config import Settings
from backend.validator import EmailEntry
from backend.vmos_helper import VmosHelper

_ACCOUNT_SETTINGS_ACTION = (
    "am start -a android.settings.ADD_ACCOUNT_SETTINGS "
    "-e 'account_types' 'com.google' 2>/dev/null"
)


def _generate_totp(secret: str) -> str:
    return pyotp.TOTP(secret).now()


async def _wait_and_tap(helper: VmosHelper, pattern: str, label: str,
                        timeout: float, interval: float) -> str:
    """Poll XML đến khi thấy pattern, rồi tap vào element đó."""
    elapsed = 0.0
    while elapsed < timeout:
        xml = await helper.dump_xml()
        if pattern in xml:
            m = re.search(
                r'(<node[^>]*' + re.escape(pattern.split("=", 1)[-1].strip('"')) + r'[^>]*>)',
                xml
            )
            node = m.group(1) if m else ""
            if node:
                await helper.tap_element(node)
            return label
        await asyncio.sleep(interval)
        elapsed += interval
    return "TIMEOUT"


async def run(helper: VmosHelper, entry: EmailEntry, cfg: Settings, log) -> None:
    """Login Google account.

    State machine xử lý các screen khác nhau có thể xuất hiện.
    """
    timeout = cfg.step_timeout
    interval = cfg.poll_interval

    # Chờ device ổn định sau reboot của step1 (Add Account/GMS load xong)
    # để tránh click SKIP quá sớm làm thoát về Home.
    settle = getattr(cfg, "post_boot_settle", 45.0)
    if settle and settle > 0:
        log(f"Step 2.0: Chờ device ổn định {settle:.0f}s trước khi login...")
        await asyncio.sleep(settle)

    # 2.1-2.3 Mở Add Account → (SKIP nếu cần) → chờ email input.
    # Robust với retry: ngay sau reboot step1 màn hình có thể chưa sẵn sàng,
    # click SKIP sớm có thể thoát về Home nên cần re-open + retry.
    found = await _open_and_reach_email_input(helper, timeout, interval, log)
    if not found:
        raise RuntimeError("Timeout chờ email input field")
    log(f"Step 2.3: Nhập {entry.email}...")
    await _type_into_field(helper, entry.email)
    await helper.press_enter()
    log("Step 2.3: Nhập email + Enter ✓")
    await asyncio.sleep(2)

    # 2.4 State machine sau khi nhập email
    log("Step 2.4: Chờ màn hình sau email...")
    email_retries = 0
    while True:
        state = await _detect_state(helper, timeout=timeout, interval=interval, checks=[
            ('password',                       "PASSWORD_FIELD"),
            ("Couldn't find",                 "EMAIL_NOT_FOUND"),
            ("couldn't find",                 "EMAIL_NOT_FOUND"),
            ('Try again',                     "TRY_AGAIN"),
        ])
        if state == "PASSWORD_FIELD":
            log("Step 2.4: Thấy password field ✓")
            break
        elif state == "EMAIL_NOT_FOUND":
            raise RuntimeError(f"ERROR: Email not found — {entry.email}")
        elif state == "TRY_AGAIN":
            email_retries += 1
            if email_retries >= 2:
                raise RuntimeError(f"ERROR: Email retry exhausted — {entry.email}")
            log(f"Step 2.4: Retry nhập email (lần {email_retries})...", "WARN")
            await _type_into_field(helper, entry.email)
            await helper.press_enter()
            await asyncio.sleep(2)
        else:
            raise RuntimeError("Timeout chờ state sau email input")

    # Nhập password
    log("Step 2.4: Nhập password...")
    await _type_into_field(helper, entry.password)
    await helper.press_enter()
    await asyncio.sleep(2)

    # 2.5 State machine sau password
    log("Step 2.5: Chờ màn hình sau password...")
    totp_retries = 0
    skip_totp = False
    while True:
        state = await _detect_state(helper, timeout=cfg.step_timeout, interval=interval, checks=[
            ('totpPin',              "TOTP_FIELD"),
            ('I agree',              "I_AGREE"),
            ('Wrong password',       "WRONG_PASS"),
            ('wrong password',       "WRONG_PASS"),
            ('verification code',    "SMS_OTP"),
            ('Verify it',            "VERIFY_YOU"),
            ('More options',         "MORE_OPTIONS"),
            ('TRY ANOTHER WAY',      "TRY_ANOTHER_WAY"),
        ])
        if state == "TOTP_FIELD":
            log("Step 2.5: Nhập TOTP...")
            code = _generate_totp(entry.totp_secret)
            log(f"Step 2.5: TOTP code = {code}")
            # Tap vào field trước khi type
            xml_t = await helper.grep_xml('totpPin')
            node_t = _find_node_by_text_or_id(xml_t, 'totpPin')
            if node_t:
                coords_t = VmosHelper.extract_bounds(node_t)
                if coords_t:
                    await helper.tap(*coords_t)
                    await asyncio.sleep(0.5)
            await _type_into_field(helper, code)
            await asyncio.sleep(0.5)
            # Tap NEXT (không dùng Enter)
            xml_n = await helper.grep_xml('NEXT')
            node_n = _find_node_by_text(xml_n, 'next')
            if node_n:
                coords_n = VmosHelper.extract_bounds(node_n)
                if coords_n:
                    await helper.tap(*coords_n)
            else:
                await helper.press_enter()
            await asyncio.sleep(2)
            break
        elif state == "I_AGREE":
            log("Step 2.5: 'I agree' hiện thẳng — bỏ qua TOTP", "WARN")
            skip_totp = True
            break
        elif state == "WRONG_PASS":
            raise RuntimeError("ERROR: Wrong password")
        elif state == "SMS_OTP":
            raise RuntimeError("ERROR: Google yêu cầu SMS/Email OTP — không hỗ trợ")
        elif state == "TRY_ANOTHER_WAY":
            log("Step 2.5: 'TRY ANOTHER WAY' — chọn Google Authenticator...", "WARN")
            # Click TRY ANOTHER WAY
            xml_t = await helper.grep_xml('TRY ANOTHER WAY')
            node_t = _find_node_by_text(xml_t, 'try another way')
            if node_t:
                coords_t = VmosHelper.extract_bounds(node_t)
                if coords_t:
                    await helper.tap(*coords_t)
                    await asyncio.sleep(3)
            # Chọn Google Authenticator option
            xml_a = await helper.grep_xml('Google Authenticator')
            node_a = _find_node_by_content_desc(xml_a, 'google authenticator')
            if node_a:
                coords_a = VmosHelper.extract_bounds(node_a)
                if coords_a:
                    await helper.tap(*coords_a)
                    await asyncio.sleep(2)
            else:
                raise RuntimeError("ERROR: Không tìm được Google Authenticator option")
        elif state in ("VERIFY_YOU", "MORE_OPTIONS"):
            log("Step 2.5: 'Verify it's you' — thử tìm TOTP option...", "WARN")
            xml = await helper.grep_xml('More options')
            node = _find_node_by_text(xml, 'more options')
            if node:
                coords = VmosHelper.extract_bounds(node)
                if coords:
                    await helper.tap(*coords)
                    await asyncio.sleep(2)
                else:
                    raise RuntimeError("ERROR: Verify screen — More options không có bounds")
            else:
                raise RuntimeError("ERROR: Verify screen — không tìm được TOTP option")
        else:
            raise RuntimeError("Timeout chờ state sau password")

    # 2.6 State machine sau TOTP
    if not skip_totp:
        log("Step 2.6: Chờ màn hình sau TOTP...")
        while True:
            state = await _detect_state(helper, timeout=60, interval=interval, checks=[
                ('I agree',      "I_AGREE"),
                ('Wrong code',   "WRONG_CODE"),
                ('wrong code',   "WRONG_CODE"),
                ('Code expired', "EXPIRED"),
                ('code expired', "EXPIRED"),
            ])
            if state == "I_AGREE":
                log("Step 2.6: TOTP accepted ✓")
                break
            elif state == "WRONG_CODE":
                totp_retries += 1
                if totp_retries >= cfg.retry_count:
                    raise RuntimeError("ERROR: TOTP wrong code retry exhausted")
                log(f"Step 2.6: Wrong code — retry {totp_retries}/{cfg.retry_count}...", "WARN")
                new_code = _generate_totp(entry.totp_secret)
                await _clear_and_type(helper, new_code)
                await helper.press_enter()
                await asyncio.sleep(2)
            elif state == "EXPIRED":
                log("Step 2.6: Code expired — chờ TOTP cycle mới (32s)...", "WARN")
                await asyncio.sleep(32)
                new_code = _generate_totp(entry.totp_secret)
                await _clear_and_type(helper, new_code)
                await helper.press_enter()
                await asyncio.sleep(2)
            else:
                raise RuntimeError("Timeout chờ state sau TOTP")

    # 2.7 Click "I agree" / "ACCEPT"
    log("Step 2.7: Click 'I agree'...")
    xml = await helper.grep_xml('I agree')
    node = _find_node_by_text(xml, 'i agree')
    if node:
        coords = VmosHelper.extract_bounds(node)
        if coords:
            await helper.tap(*coords)
            log("Step 2.7: Click I agree ✓")
    await asyncio.sleep(3)

    # 2.7b ACCEPT (xuất hiện sau I agree trên một số thiết bị)
    xml_acc = await helper.grep_xml('ACCEPT')
    node_acc = _find_node_by_text(xml_acc, 'accept')
    if node_acc:
        coords_acc = VmosHelper.extract_bounds(node_acc)
        if coords_acc:
            await helper.tap(*coords_acc)
            log("Step 2.7b: Click ACCEPT ✓")
        await asyncio.sleep(3)

    # 2.8 Clean app home
    log("Step 2.8: cleanAppHome...")
    await helper.clean_app_home()
    log("Step 2: Login Google hoàn thành ✓")


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _current_focus(helper: VmosHelper) -> str:
    out = await helper.run_shell(
        "dumpsys window 2>/dev/null | grep -o 'mCurrentFocus=[^}]*}' | head -1"
    )
    return out or ""


async def _open_and_reach_email_input(helper: VmosHelper, timeout: float,
                                      interval: float, log) -> bool:
    """Mở Add Account, click SKIP nếu cần, chờ email input (identifierId).

    Retry tối đa 3 lần: re-open ADD_ACCOUNT_SETTINGS nếu bị lạc về Home.
    Returns True nếu tới được email input.
    """
    for attempt in range(1, 4):
        log(f"Step 2.1: Mở Add Account Settings (lần {attempt}/3)...")
        await helper.run_shell(_ACCOUNT_SETTINGS_ACTION)
        await asyncio.sleep(4)

        # Chờ vào được MinuteMaid (Google sign-in) hoặc thấy sẵn email input
        reached_signin = False
        elapsed = 0.0
        while elapsed < 20:
            focus = await _current_focus(helper)
            if 'MinuteMaid' in focus or 'identifierId' in (await helper.grep_xml('identifierId')):
                reached_signin = True
                break
            await asyncio.sleep(interval)
            elapsed += interval
        if not reached_signin:
            log("Step 2.1: Chưa vào MinuteMaid, thử lại...", "WARN")
            continue

        # Nếu email input đã hiện luôn thì bỏ qua SKIP
        if 'identifierId' in (await helper.grep_xml('identifierId')):
            log("Step 2.2: Email input hiện sẵn — bỏ qua SKIP")
            return True

        # 2.2 Tìm + click SKIP (màn hình 'Sign in with ease')
        log("Step 2.2: Chờ nút SKIP...")
        xml = await _grep_poll_for_text(helper, "skip", timeout=20, interval=interval)
        if xml:
            node = _find_node_by_text(xml, "skip")
            coords = VmosHelper.extract_bounds(node) if node else None
            if coords:
                log(f"Step 2.2: Click SKIP bounds={coords}")
                await helper.tap(*coords)
                await asyncio.sleep(3)
            else:
                log("Step 2.2: SKIP không có bounds, bỏ qua", "WARN")
        else:
            log("Step 2.2: Không thấy SKIP, tiếp tục", "WARN")

        # 2.3 Chờ email input
        log("Step 2.3: Chờ email input...")
        if await _poll_xml_contains(helper, 'identifierId', timeout=20, interval=interval):
            return True

        # Không thấy email input — có thể click SKIP làm thoát về Home → retry
        log("Step 2.3: Không thấy email input sau SKIP — re-open Add Account", "WARN")
    return False


async def _poll_xml_contains(helper: VmosHelper, pattern: str,
                              timeout: float, interval: float) -> bool:
    """Dùng grep_xml để tìm pattern — không bị truncate."""
    elapsed = 0.0
    while elapsed < timeout:
        xml = await helper.grep_xml(pattern)
        if pattern in xml:
            return True
        await asyncio.sleep(interval)
        elapsed += interval
    return False


async def _grep_poll_for_text(helper: VmosHelper, text_lower: str,
                               timeout: float, interval: float) -> Optional[str]:
    """Poll bằng grep_xml cho đến khi tìm thấy text, trả về grep output."""
    elapsed = 0.0
    while elapsed < timeout:
        xml = await helper.grep_xml(text_lower)
        if xml and xml.strip():
            return xml
        await asyncio.sleep(interval)
        elapsed += interval
    return None


async def _detect_state(helper: VmosHelper, checks: list[tuple[str, str]],
                        timeout: float, interval: float) -> str:
    """Poll bằng grep_xml với tất cả keywords, trả về label match đầu tiên."""
    keywords = list({pat for pat, _ in checks})
    elapsed = 0.0
    while elapsed < timeout:
        xml = await helper.grep_xml(*keywords)
        for pattern, label in checks:
            if pattern in xml:
                return label
        await asyncio.sleep(interval)
        elapsed += interval
    return "TIMEOUT"


async def _type_into_field(helper: VmosHelper, text: str) -> None:
    """Nhập text an toàn (xử lý ký tự đặc biệt)."""
    # Escape single quotes cho shell
    escaped = text.replace("'", "'\\''")
    await helper.run_shell(f"input text '{escaped}'")


async def _clear_and_type(helper: VmosHelper, text: str) -> None:
    """Xoá field hiện tại và nhập text mới."""
    await helper.run_shell("input keyevent 123")    # KEYCODE_MOVE_END
    await helper.run_shell("input keyevent --longpress 67 67 67 67 67 67 67 67")
    await _type_into_field(helper, text)


def _find_node_by_text(xml: str, text_lower: str) -> Optional[str]:
    """Tìm node XML có text khớp (case-insensitive) và có bounds.

    Ưu tiên: clickable="true" + bounds.
    Fallback: bất kỳ node có bounds.
    """
    clickable: list[str] = []
    any_node: list[str] = []
    for m in re.finditer(r'<node\b[^>]*(?:/>|>)', xml, re.DOTALL):
        node = m.group(0)
        tm = re.search(r'\btext="([^"]*)"', node)
        if not tm or tm.group(1).lower() != text_lower:
            continue
        if 'bounds="' not in node:
            continue
        if 'clickable="true"' in node:
            clickable.append(node)
        else:
            any_node.append(node)
    return (clickable or any_node or [None])[0]


def _find_node_by_text_or_id(xml: str, resource_id: str) -> Optional[str]:
    """Tìm node có resource-id khớp và có bounds."""
    for m in re.finditer(r'<node\b[^>]*(?:/>|>)', xml, re.DOTALL):
        node = m.group(0)
        if f'resource-id="{resource_id}"' in node and 'bounds="' in node:
            return node
    return None


def _find_node_by_content_desc(xml: str, desc_lower: str) -> Optional[str]:
    """Tìm node có content-desc khớp (case-insensitive) và có bounds."""
    clickable: list[str] = []
    any_node: list[str] = []
    for m in re.finditer(r'<node\b[^>]*(?:/>|>)', xml, re.DOTALL):
        node = m.group(0)
        dm = re.search(r'\bcontent-desc="([^"]*)"', node)
        if not dm or desc_lower not in dm.group(1).lower():
            continue
        if 'bounds="' not in node:
            continue
        if 'clickable="true"' in node:
            clickable.append(node)
        else:
            any_node.append(node)
    return (clickable or any_node or [None])[0]
