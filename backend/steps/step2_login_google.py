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

# Google sign-in là WebView: ô email KHÔNG có resource-id 'identifierId',
# mà expose dưới dạng EditText với resource-id rỗng. Phải detect theo class.
_EDITTEXT_CLASS = "android.widget.EditText"


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
    # GMS có thể mất 3-5 phút để sẵn sàng (tắt về Home rồi tự mở lại).
    # Dùng email_reach_timeout riêng, ít nhất 360s để cover đủ trường hợp.
    email_reach_timeout = max(timeout, 360.0)
    found = await _open_and_reach_email_input(helper, email_reach_timeout, interval, log)
    if not found:
        raise RuntimeError("Timeout chờ email input field")
    log(f"Step 2.3: Nhập {entry.email}...")
    await _tap_email_field(helper)  # focus ô EditText trong WebView trước khi gõ
    await _type_into_field(helper, entry.email)
    await helper.press_enter()
    log("Step 2.3: Nhập email + Enter ✓")
    await asyncio.sleep(2)

    # 2.4 State machine sau khi nhập email
    log("Step 2.4: Chờ màn hình sau email...")
    email_retries = 0
    while True:
        state = await _detect_state(helper, timeout=timeout, interval=interval, checks=[
            ('password="true"',               "PASSWORD_FIELD"),
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
    await _tap_email_field(helper)  # focus ô EditText password trong WebView
    await _type_into_field(helper, entry.password)
    await helper.press_enter()
    await asyncio.sleep(2)

    # 2.5 State machine sau password
    log("Step 2.5: Chờ màn hình sau password...")
    totp_retries = 0
    skip_totp = False
    while True:
        state = await _detect_state_2fa(helper, timeout=cfg.step_timeout, interval=interval)
        if state == "TOTP_FIELD":
            log("Step 2.5: Nhập TOTP...")
            code = _generate_totp(entry.totp_secret)
            log(f"Step 2.5: TOTP code = {code}")
            # Tap vào EditText (WebView TOTP field không có totpPin resource-id)
            coords_t = await helper.get_node_bounds(_EDITTEXT_CLASS)
            if coords_t:
                await helper.tap(*coords_t)
                await asyncio.sleep(0.5)
            await _type_into_field(helper, code)
            await asyncio.sleep(0.5)
            # Tap NEXT
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
        elif state == "CHOOSE_2FA":
            log("Step 2.5: Màn hình chọn 2FA — click Google Authenticator...", "WARN")
            xml_a = await helper.grep_xml('Google Authenticator', 'Authenticator app')
            node_a = (_find_node_by_content_desc(xml_a, 'google authenticator')
                      or _find_node_containing_text(xml_a, 'google authenticator')
                      or _find_node_containing_text(xml_a, 'authenticator app'))
            if node_a:
                coords_a = VmosHelper.extract_bounds(node_a)
                if coords_a:
                    await helper.tap(*coords_a)
                    await asyncio.sleep(3)
                    continue
            raise RuntimeError("ERROR: CHOOSE_2FA — không tìm được Google Authenticator option")
        elif state == "SECURITY_KEY":
            log("Step 2.5: Màn hình Security Key (g.co/sc) — click TRY ANOTHER WAY...", "WARN")
            xml_t = await helper.grep_xml('TRY ANOTHER WAY', 'Try another way')
            node_t = _find_node_by_text(xml_t, 'try another way')
            if node_t:
                coords_t = VmosHelper.extract_bounds(node_t)
                if coords_t:
                    await helper.tap(*coords_t)
                    await asyncio.sleep(3)
                    continue  # loop lại → detect CHOOSE_2FA → chọn Authenticator
            raise RuntimeError("ERROR: Security Key screen — không tìm được 'Try another way'")
        elif state == "SMS_OTP":
            raise RuntimeError("ERROR: Google yêu cầu SMS OTP (số điện thoại) — không hỗ trợ")
        elif state == "TRY_ANOTHER_WAY":
            log("Step 2.5: 'TRY ANOTHER WAY' — click để mở danh sách 2FA...", "WARN")
            xml_t = await helper.grep_xml('TRY ANOTHER WAY', 'Try another way')
            node_t = _find_node_by_text(xml_t, 'try another way')
            if node_t:
                coords_t = VmosHelper.extract_bounds(node_t)
                if coords_t:
                    await helper.tap(*coords_t)
                    await asyncio.sleep(3)
                    continue  # loop lại → sẽ detect CHOOSE_2FA
            raise RuntimeError("ERROR: Không tìm được nút 'Try another way'")
        elif state in ("VERIFY_YOU", "MORE_OPTIONS"):
            log("Step 2.5: 'Verify it's you' — click More options...", "WARN")
            xml = await helper.grep_xml('More options')
            node = _find_node_by_text(xml, 'more options')
            if node:
                coords = VmosHelper.extract_bounds(node)
                if coords:
                    await helper.tap(*coords)
                    await asyncio.sleep(2)
                    continue  # loop lại → sẽ detect CHOOSE_2FA hoặc TOTP_FIELD
                raise RuntimeError("ERROR: Verify screen — More options không có bounds")
            raise RuntimeError("ERROR: Verify screen — không tìm được More options")
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
    """Mở Add Account, click SKIP nếu cần, chờ email input.

    Dùng một time-budget loop duy nhất theo timeout từ caller.
    Xử lý 3 trường hợp thực tế:
      (A) Email input (EditText/identifierId) xuất hiện ngay — bỏ qua SKIP.
      (B) GMS hiện màn SKIP → click → chờ WebView EditText.
      (C) GMS tắt về Home rồi tự mở lại (mất ~3–4 phút) → re-open nếu cần.
    """
    t_start = asyncio.get_event_loop().time()

    def remaining():
        return timeout - (asyncio.get_event_loop().time() - t_start)

    log("Step 2.1: Mở Add Account Settings...")
    await helper.run_shell(_ACCOUNT_SETTINGS_ACTION)
    await asyncio.sleep(4)

    last_reopen = asyncio.get_event_loop().time()
    skip_clicked = False

    while remaining() > 0:
        focus = await _current_focus(helper)
        in_gms = "com.google.android.gms" in focus or "MinuteMaid" in focus

        # Case A: email input đã hiện → done
        if await _email_input_present(helper):
            log("Step 2.3: Email input sẵn sàng ✓")
            return True

        if in_gms:
            # Case B: trong GMS — tìm SKIP nếu chưa click
            if not skip_clicked:
                skip_xml = await helper.grep_xml("skip")
                node = _find_node_by_text(skip_xml or "", "skip")
                coords = VmosHelper.extract_bounds(node) if node else None
                if coords:
                    log(f"Step 2.2: Click SKIP bounds={coords}")
                    await helper.tap(*coords)
                    skip_clicked = True
                    await asyncio.sleep(3)
                    continue
        else:
            # Case C: GMS về Home — re-open sau 5s không thấy GMS
            since_reopen = asyncio.get_event_loop().time() - last_reopen
            if since_reopen > 5:
                log("Step 2.1: GMS tắt — re-open Add Account Settings...", "WARN")
                await helper.run_shell(_ACCOUNT_SETTINGS_ACTION)
                await asyncio.sleep(4)
                last_reopen = asyncio.get_event_loop().time()
                skip_clicked = False  # có thể cần click SKIP lại
                continue

        await asyncio.sleep(interval)

    return False


async def _email_input_present(helper: VmosHelper) -> bool:
    """True nếu thấy ô nhập email.

    WebView Google sign-in expose ô email dưới dạng EditText (resource-id rỗng);
    một số biến thể native có 'identifierId'. Chấp nhận cả hai.
    """
    xml = await helper.grep_xml(_EDITTEXT_CLASS, "identifierId")
    return _EDITTEXT_CLASS in (xml or "") or "identifierId" in (xml or "")


async def _wait_email_input(helper: VmosHelper, timeout: float,
                             interval: float) -> bool:
    elapsed = 0.0
    while elapsed < timeout:
        if await _email_input_present(helper):
            return True
        await asyncio.sleep(interval)
        elapsed += interval
    return False


async def _tap_email_field(helper: VmosHelper) -> bool:
    """Tap vào ô EditText email để focus trước khi nhập. True nếu tap được."""
    await helper.grep_xml(_EDITTEXT_CLASS)  # đảm bảo /sdcard/window.xml mới
    coords = await helper.get_node_bounds(_EDITTEXT_CLASS)
    if coords:
        await helper.tap(*coords)
        await asyncio.sleep(1)
        return True
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


async def _detect_state_2fa(helper: VmosHelper, timeout: float,
                             interval: float) -> str:
    """Poll sau khi nhập password, phân biệt chính xác các màn hình 2FA.

    Màn hình có thể xuất hiện:
    - TOTP_FIELD    : "Authenticator" + EditText + NEXT — nhập TOTP code
    - CHOOSE_2FA    : "Choose how" — chọn phương thức 2FA
    - SECURITY_KEY  : "g.co/sc" hoặc "Get a code to sign in" — không hỗ trợ
    - TRY_ANOTHER_WAY: nút TRY ANOTHER WAY
    - I_AGREE       : đăng nhập thành công
    - WRONG_PASS    : sai mật khẩu
    - SMS_OTP       : OTP qua số điện thoại
    - VERIFY_YOU    : "Verify it's you"
    - MORE_OPTIONS  : "More options"
    """
    elapsed = 0.0
    while elapsed < timeout:
        xml = await helper.grep_xml(
            'I agree', 'Wrong password', 'wrong password',
            'Choose how', 'Verify it', 'More options', 'TRY ANOTHER WAY',
            'verification code at', 'g.co/sc', 'Get a code to sign in',
            'Authenticator', 'NEXT', _EDITTEXT_CLASS,
        )
        xml = xml or ""

        # Ưu tiên check các màn hình lỗi / unsupported trước
        if 'I agree'              in xml: return "I_AGREE"
        if 'Wrong password'       in xml: return "WRONG_PASS"
        if 'wrong password'       in xml: return "WRONG_PASS"
        if 'g.co/sc'              in xml: return "SECURITY_KEY"
        if 'Get a code to sign in' in xml: return "SECURITY_KEY"

        # TOTP_FIELD: PHẢI có "Authenticator" + EditText + NEXT
        # (phân biệt với Security Key cũng có EditText+NEXT)
        has_auth     = 'Authenticator' in xml
        has_edittext = _EDITTEXT_CLASS in xml
        has_next     = 'NEXT' in xml
        if has_auth and has_edittext and has_next:
            return "TOTP_FIELD"

        if 'Choose how'           in xml: return "CHOOSE_2FA"
        if 'verification code at' in xml: return "SMS_OTP"
        if 'Verify it'            in xml: return "VERIFY_YOU"
        if 'More options'         in xml: return "MORE_OPTIONS"
        if 'TRY ANOTHER WAY'      in xml: return "TRY_ANOTHER_WAY"

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


def _find_node_containing_text(xml: str, substring_lower: str) -> Optional[str]:
    """Tìm node XML có text CHỨA substring (case-insensitive) và có bounds."""
    clickable: list[str] = []
    any_node: list[str] = []
    for m in re.finditer(r'<node\b[^>]*(?:/>|>)', xml, re.DOTALL):
        node = m.group(0)
        tm = re.search(r'\btext="([^"]*)"', node)
        if not tm or substring_lower not in tm.group(1).lower():
            continue
        if 'bounds="' not in node:
            continue
        if 'clickable="true"' in node:
            clickable.append(node)
        else:
            any_node.append(node)
    return (clickable or any_node or [None])[0]


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
