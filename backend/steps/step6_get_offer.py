"""Step 6 — Mở Google One, verify offer eligibility, extract link."""
from __future__ import annotations

import asyncio
import re

from backend.config import Settings
from backend.vmos_helper import VmosHelper

GOOGLE_ONE_PKG = "com.google.android.apps.subscriptions.red"
OFFER_RE = re.compile(r'partner-eft-onboard/([A-Z0-9]{6,})')
REDEEM_RE = re.compile(r'https://one\.google\.com/(?:offer|partner-eft-onboard)/([A-Z0-9]{6,})')

_LAUNCH_CMD = (
    f"am start -n {GOOGLE_ONE_PKG}/com.google.android.apps.subscriptions.red.MainActivity"
    f" 2>/dev/null || am start -a android.intent.action.MAIN"
    f" -c android.intent.category.LAUNCHER"
    f" $(pm dump {GOOGLE_ONE_PKG} | grep -o 'android.intent.action.MAIN.*' | head -1 | awk '{{print $3}}')"
    f" 2>/dev/null || monkey -p {GOOGLE_ONE_PKG} -c android.intent.category.LAUNCHER 1 2>/dev/null"
)


async def run(helper: VmosHelper, cfg: Settings, log) -> list[str]:
    """Mở Google One, click Get Started, verify 'Start trial', extract offer links.

    Returns: list of offer URLs (1 hoặc 2 links)
    """
    timeout = cfg.step_timeout
    interval = cfg.poll_interval

    # 6.1 Mở Google One (dùng explicit LauncherActivity)
    log("Step 6.1: Mở Google One...")
    await helper.run_shell("input keyevent KEYCODE_HOME 2>/dev/null")
    await asyncio.sleep(1)
    await helper.run_shell(
        f"am start -n {GOOGLE_ONE_PKG}/.LauncherActivity 2>/dev/null"
        f" || am start -a android.intent.action.MAIN"
        f" -c android.intent.category.LAUNCHER -p {GOOGLE_ONE_PKG} 2>/dev/null"
    )
    await asyncio.sleep(5)

    # 6.2 Get screen size và click "Get Started" theo tỷ lệ
    # Google One Welcome dùng Compose UI — uiautomator dump KHÔNG đọc được,
    # nên tap theo tỷ lệ (0.885) và verify eligibility qua mCurrentFocus.
    log("Step 6.2: Lấy screen size và click Get Started...")
    width, height = await helper.get_screen_size()
    x = int(width * 0.5)
    y = int(height * 0.885)
    log(f"Step 6.2: Screen {width}x{height} — click ({x}, {y})")
    await helper.tap(x, y)
    await asyncio.sleep(3)

    # 6.3 Verify eligible qua mCurrentFocus == PartnerOnboardingActivity
    log("Step 6.3: Chờ PartnerOnboarding (xác nhận eligible)...")
    elapsed = 0.0
    found_trial = False
    while elapsed < timeout:
        focus = await helper.run_shell(
            "dumpsys window 2>/dev/null | grep -o 'mCurrentFocus=[^}]*}' | head -1"
        )
        if 'PartnerOnboarding' in (focus or ''):
            found_trial = True
            log("Step 6.3: PartnerOnboarding — device eligible ✓")
            break
        # Nếu vẫn ở Welcome, thử tap lại Get Started
        if 'Welcome' in (focus or '') and elapsed > 6:
            await helper.tap(x, y)
        await asyncio.sleep(interval)
        elapsed += interval

    if not found_trial:
        raise RuntimeError("WARN: Không vào được PartnerOnboarding — device có thể không eligible")

    # Chờ onboarding load xong để offer link được ghi vào cache
    await asyncio.sleep(5)

    # 6.4 Extract offer links
    log("Step 6.4: Extract offer links...")
    offers = await _extract_offer_links(helper, log)

    if not offers:
        raise RuntimeError("WARN: Không tìm thấy offer link")

    log(f"Step 6.4: Tìm thấy {len(offers)} link(s): {offers}")
    return [f"https://one.google.com/offer/{code}" for code in offers]


async def _extract_offer_links(helper: VmosHelper, log) -> list[str]:
    """Thử 4 phương pháp extract offer code."""
    all_codes: list[str] = []

    # Method 1: grep app data
    log("Step 6.4 [1/4]: grep app data...")
    out = await helper.run_shell(f"""#!/system/bin/sh
grep -roa 'partner-eft-onboard/[A-Z0-9]*' /data/data/{GOOGLE_ONE_PKG}/ 2>/dev/null
grep -roa 'one.google.com/offer/[A-Z0-9]*' /data/data/{GOOGLE_ONE_PKG}/ 2>/dev/null
""")
    all_codes.extend(_find_codes(out))

    # Method 2: strings on PartnerOffer DB
    log("Step 6.4 [2/4]: strings PartnerOffer DB...")
    out = await helper.run_shell(f"""#!/system/bin/sh
find /data/data/{GOOGLE_ONE_PKG} -name '*PartnerOffer*' 2>/dev/null | while read f; do
  strings "$f" 2>/dev/null
done
find /data/data/{GOOGLE_ONE_PKG} -name '*Cache*' 2>/dev/null | while read f; do
  strings "$f" 2>/dev/null
done
""")
    all_codes.extend(_find_codes(out))

    # Method 3: logcat
    log("Step 6.4 [3/4]: logcat search...")
    out = await helper.run_shell("""#!/system/bin/sh
logcat -d -s GoogleOne:* chromium:* | grep -o 'partner-eft-onboard/[A-Z0-9]*' 2>/dev/null
logcat -d | grep -o 'partner-eft-onboard/[A-Z0-9]*' 2>/dev/null | head -20
""")
    all_codes.extend(_find_codes(out))

    # Method 4: WebView cache
    log("Step 6.4 [4/4]: WebView cache...")
    out = await helper.run_shell(f"""#!/system/bin/sh
CACHE="/data/data/{GOOGLE_ONE_PKG}/cache/WebView/Default/HTTP Cache/Cache_Data"
if [ -d "$CACHE" ]; then
  strings "$CACHE"/* 2>/dev/null | grep -o 'partner-eft-onboard/[A-Z0-9]*'
fi
""")
    all_codes.extend(_find_codes(out))

    unique = list(dict.fromkeys(all_codes))
    return unique[:2]  # Tối đa 2 link


def _find_codes(text: str) -> list[str]:
    if not text:
        return []
    return list(dict.fromkeys(
        OFFER_RE.findall(text) + REDEEM_RE.findall(text)
    ))
