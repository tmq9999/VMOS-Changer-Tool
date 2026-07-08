"""Step 5 — Spoof Pixel 10 Pro props bằng resetprop."""
from __future__ import annotations

import asyncio

from backend.config import Settings
from backend.vmos_helper import VmosHelper

# ── Module props — Pixel 10 Pro "blazer" (Blazer_CP2A.260605.012) ─────────────
# Cập nhật module mới: chỉ cần sửa các hằng dưới đây.
BRAND = "google"
DEVICE = "blazer"
MODEL = "Pixel 10 Pro"
MANUFACTURER = "Google"

BUILD_ID = "CP2A.260605.012"
INCREMENTAL = "15430684"
RELEASE = "17"                       # ro.build.version.release
SDK = "37"                           # ro.build.version.sdk
SECURITY_PATCH = "2026-06-05"
DATE_UTC = "1778884555"
BUILD_DATE = "Fri May 15 15:35:55 PDT 2026"
BUILD_HOST = "8168aecbd96d"
FLAVOR = "blazer-user"
FIRST_API_LEVEL = "36"               # ro.product.first_api_level
DEVICE_FAMILY = "FL5BZ5MT5RG5"       # ro.build.device_family
SOC_MODEL = "Tensor G5"
SOC_MANUFACTURER = "Google"
OEM_ID = "00e0"

# ro.build.fingerprint = blazer (resetprop không có pihooks; module gốc đặt generic
# GSI và dựa vào pihooks để spoof Build.* — ở đây dùng blazer như cách đã chạy được).
FP = f"{BRAND}/{DEVICE}/{DEVICE}:{RELEASE}/{BUILD_ID}/{INCREMENTAL}:user/release-keys"
DESCRIPTION = f"{DEVICE}-user {RELEASE} {BUILD_ID} {INCREMENTAL} release-keys"

# ── Spoof batches (đồng bộ với scripts/spoof_resetprop.py) ────────────────────

BATCH1 = f"""#!/system/bin/sh
RP=/system/bin/resetprop
$RP ro.product.brand {BRAND}
$RP ro.product.manufacturer {MANUFACTURER}
$RP ro.product.model "{MODEL}"
$RP ro.product.device {DEVICE}
$RP ro.product.name {DEVICE}
$RP ro.product.board {DEVICE}
$RP ro.build.product {DEVICE}
$RP ro.hardware {DEVICE}
$RP ro.build.fingerprint "{FP}"
$RP ro.build.id {BUILD_ID}
$RP ro.build.display.id {BUILD_ID}
$RP ro.build.description "{DESCRIPTION}"
$RP ro.build.version.incremental {INCREMENTAL}
$RP ro.build.version.release {RELEASE}
$RP ro.build.version.release_or_codename {RELEASE}
$RP ro.build.version.sdk {SDK}
$RP ro.build.version.security_patch {SECURITY_PATCH}
$RP ro.build.version.codename REL
$RP ro.build.tags release-keys
$RP ro.build.type user
$RP ro.build.flavor {FLAVOR}
$RP ro.build.date.utc {DATE_UTC}
$RP ro.build.date "{BUILD_DATE}"
$RP ro.build.user android-build
$RP ro.build.host {BUILD_HOST}
$RP ro.build.device_family {DEVICE_FAMILY}
$RP ro.product.first_api_level {FIRST_API_LEVEL}
$RP ro.product.product.brand {BRAND}
$RP ro.product.product.device {DEVICE}
$RP ro.product.product.manufacturer {MANUFACTURER}
$RP ro.product.product.model "{MODEL}"
$RP ro.product.product.name {DEVICE}
$RP ro.product.build.fingerprint "{FP}"
$RP ro.product.build.id {BUILD_ID}
$RP ro.product.vendor.brand {BRAND}
$RP ro.product.vendor.device {DEVICE}
$RP ro.product.vendor.manufacturer {MANUFACTURER}
$RP ro.product.vendor.model "{MODEL}"
$RP ro.product.vendor.name {DEVICE}
$RP ro.vendor.build.fingerprint "{FP}"
$RP ro.vendor.build.id {BUILD_ID}
$RP ro.vendor.build.security_patch {SECURITY_PATCH}
$RP ro.vendor.build.version.incremental {INCREMENTAL}
$RP ro.product.odm.brand {BRAND}
$RP ro.product.odm.device {DEVICE}
$RP ro.product.odm.manufacturer {MANUFACTURER}
$RP ro.product.odm.model "{MODEL}"
$RP ro.product.odm.name {DEVICE}
$RP ro.odm.build.fingerprint "{FP}"
$RP ro.odm.build.id {BUILD_ID}
echo BATCH1_OK
"""

BATCH2 = f"""#!/system/bin/sh
RP=/system/bin/resetprop
$RP ro.product.system.brand {BRAND}
$RP ro.product.system.device {DEVICE}
$RP ro.product.system.manufacturer {MANUFACTURER}
$RP ro.product.system.model "{MODEL}"
$RP ro.product.system.name {DEVICE}
$RP ro.system.build.fingerprint "{FP}"
$RP ro.system.build.id {BUILD_ID}
$RP ro.product.system_ext.brand {BRAND}
$RP ro.product.system_ext.device {DEVICE}
$RP ro.product.system_ext.manufacturer {MANUFACTURER}
$RP ro.product.system_ext.model "{MODEL}"
$RP ro.product.system_ext.name {DEVICE}
$RP ro.system_ext.build.fingerprint "{FP}"
$RP ro.product.bootimage.brand {BRAND}
$RP ro.product.bootimage.device {DEVICE}
$RP ro.product.bootimage.manufacturer {MANUFACTURER}
$RP ro.product.bootimage.model "{MODEL}"
$RP ro.product.bootimage.name {DEVICE}
$RP ro.bootimage.build.fingerprint "{FP}"
$RP ro.product.brand_for_attestation {BRAND}
$RP ro.product.device_for_attestation {DEVICE}
$RP ro.product.manufacturer_for_attestation {MANUFACTURER}
$RP ro.product.model_for_attestation "{MODEL}"
$RP ro.product.name_for_attestation {DEVICE}
$RP ro.boot.hwname {DEVICE}
$RP ro.boot.hwdevice {DEVICE}
$RP ro.product.hardware.sku {DEVICE}
$RP ro.boot.product.hardware.sku {DEVICE}
$RP ro.soc.manufacturer {SOC_MANUFACTURER}
$RP ro.soc.model "{SOC_MODEL}"
$RP ro.com.google.clientidbase android-google
$RP ro.opa.eligible_device true
$RP ro.quick_start.device_id {DEVICE}
$RP ro.quick_start.oem_id {OEM_ID}
$RP ro.support_one_handed_mode true
$RP ro.hotword.detection_service_required false
$RP ro.incremental.enable true
setprop vendor.usb.product_string "{MODEL}"
setprop sys.oem_unlock_allowed 0
setprop net.tethering.noprovisioning true
settings delete global hidden_api_policy 2>/dev/null
settings delete global hidden_api_policy_pre_p_apps 2>/dev/null
settings delete global hidden_api_policy_p_apps 2>/dev/null
echo ""
echo model=$(getprop ro.product.model)
echo device=$(getprop ro.product.device)
echo fingerprint=$(getprop ro.build.fingerprint)
echo SPOOF_OK
"""

_EXPECTED_MODEL = MODEL
_EXPECTED_DEVICE = DEVICE


async def run(helper: VmosHelper, cfg: Settings, log) -> None:
    """Chạy 2 batch resetprop, verify kết quả."""
    max_retries = cfg.retry_count

    for attempt in range(1, max_retries + 1):
        log(f"Step 5: Spoof Pixel 10 Pro (lần {attempt}/{max_retries})...")

        # Batch 1
        out1 = await helper.run_shell(BATCH1)
        if "BATCH1_OK" not in (out1 or ""):
            log(f"Step 5: Batch1 không có BATCH1_OK: {out1!r}", "WARN")

        await asyncio.sleep(1)

        # Batch 2
        out2 = await helper.run_shell(BATCH2)

        # Verify
        if _EXPECTED_MODEL in (out2 or "") and _EXPECTED_DEVICE in (out2 or ""):
            log(f"Step 5: Spoof thành công ✓\n{out2.strip()}")
            return

        log(f"Step 5: Verify thất bại — output: {out2!r}", "WARN")
        if attempt < max_retries:
            await asyncio.sleep(3)

    raise RuntimeError(f"ERROR: Spoof thất bại sau {max_retries} lần retry")
