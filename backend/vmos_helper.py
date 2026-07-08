"""VMOS API helper — async-friendly wrapper dùng asyncio.to_thread."""
from __future__ import annotations

import asyncio
import functools
import re
import time
from typing import Optional

from vmos_sdk import VmosClient
from vmos_sdk.exceptions import VmosError
from backend import callback_bus


class VmosHelper:
    """Wrapper cho VmosClient, expose async methods.

    Mỗi PAD worker tạo 1 instance VmosHelper riêng.
    """

    USE_CALLBACK: bool = False  # Bật sau khi cấu hình webhook URL trên VMOS Console

    def __init__(self, access_key: str, secret_key: str, pad_code: str):
        self.pad = pad_code
        self._client = VmosClient(access_key=access_key, secret_key=secret_key)

    def close(self) -> None:
        self._client.close()

    # ── Sync internals ────────────────────────────────────────────────────────

    def _poll_task(self, task_id: int, interval: float, max_polls: int) -> str:
        for _ in range(max_polls):
            time.sleep(interval)
            tr = self._client.task.get_task_detail(task_ids=[task_id])
            if isinstance(tr.data, list) and tr.data:
                t = tr.data[0]
                status = t.get("taskStatus")
                result = t.get("taskResult") or t.get("errorMsg") or ""
                if status in (2, 3) or result:
                    return result
        return "TIMEOUT"

    def _async_cmd_get_task_id(self, script: str) -> Optional[int]:
        """Gọi async_cmd và trả về taskId, không chờ result."""
        r = self._client.instance.async_cmd(
            pad_codes=[self.pad], script_content=script
        )
        if not (isinstance(r.data, list) and r.data):
            return None
        return r.data[0].get("taskId")

    def _run_shell_sync(self, script: str, interval: float = 2.0,
                        max_polls: int = 25) -> str:
        """Fallback polling — dùng khi không có callback."""
        r = self._client.instance.async_cmd(
            pad_codes=[self.pad], script_content=script
        )
        if not (isinstance(r.data, list) and r.data):
            return ""
        tid = r.data[0].get("taskId")
        if not tid:
            return ""
        return self._poll_task(tid, interval, max_polls)

    def _get_pad_status_sync(self) -> Optional[int]:
        r = self._client.instance.get_list_info(pad_codes=[self.pad])
        pd = r.data.get("pageData", []) if isinstance(r.data, dict) else []
        return pd[0].get("padStatus") if pd else None

    def _clean_app_home_sync(self) -> None:
        """Về Home screen bằng shell keyevent."""
        self._client.instance.async_cmd(
            pad_codes=[self.pad],
            script_content="input keyevent KEYCODE_HOME 2>/dev/null"
        )

    # ── Async wrappers ────────────────────────────────────────────────────────

    async def _run_shell_once(self, script: str, interval: float,
                              max_polls: int, cb_timeout: float) -> str:
        """Thực thi shell một lần (không retry)."""
        if not VmosHelper.USE_CALLBACK:
            return await asyncio.to_thread(
                self._run_shell_sync, script, interval, max_polls
            )
        tid = await asyncio.to_thread(self._async_cmd_get_task_id, script)
        if not tid:
            return ""
        fut = callback_bus.register(tid)
        try:
            result = await asyncio.wait_for(fut, timeout=cb_timeout)
            return result or ""
        except (asyncio.TimeoutError, asyncio.CancelledError):
            callback_bus.cancel(tid)
            return await asyncio.to_thread(
                self._poll_task, tid, interval, max_polls
            )

    async def run_shell(self, script: str, interval: float = 2.0,
                        max_polls: int = 25, cb_timeout: float = 8.0) -> str:
        """Chạy shell với auto-retry khi gặp VmosInstanceError (110031)."""
        from vmos_sdk.exceptions import VmosInstanceError
        for _attempt in range(4):
            try:
                return await self._run_shell_once(script, interval, max_polls, cb_timeout)
            except VmosInstanceError:
                if _attempt >= 3:
                    raise
                wait = 10 * (2 ** _attempt)  # 10s, 20s, 40s
                await asyncio.sleep(wait)
        return ""  # unreachable

    async def get_pad_status(self) -> Optional[int]:
        return await asyncio.to_thread(self._get_pad_status_sync)

    async def clean_app_home(self) -> None:
        await asyncio.to_thread(self._clean_app_home_sync)

    async def wait_pad_ready(self, timeout: float = 180.0,
                              poll: float = 5.0) -> bool:
        """Chờ padStatus == 10 rồi verify async_cmd thực sự nhận lệnh."""
        elapsed = 0.0
        while elapsed < timeout:
            s = await self.get_pad_status()
            if s == 10:
                # Thêm bước verify: thử chạy lệnh echo đơn giản
                # Nếu instance chưa sẵn sàng sẽ raise VmosInstanceError → tiếp tục chờ
                for _attempt in range(6):  # thử tối đa 6 lần × 5s = 30s
                    try:
                        out = await self.run_shell("echo ready", interval=2.0, max_polls=8)
                        if "ready" in (out or ""):
                            await asyncio.sleep(3)  # buffer thêm 3s cho UI boot
                            return True
                    except Exception:
                        pass
                    await asyncio.sleep(5)
                # Nếu sau 30s vẫn không echo được, coi như chưa ready
            await asyncio.sleep(poll)
            elapsed += poll
        return False

    # ── UI helpers ────────────────────────────────────────────────────────────

    async def dump_xml(self) -> str:
        await self.run_shell("uiautomator dump /sdcard/window.xml >/dev/null 2>&1")
        await asyncio.sleep(0.5)
        return await self.run_shell("cat /sdcard/window.xml")

    @staticmethod
    def _shell_squote(s: str) -> str:
        """Escape chuỗi để nhúng an toàn trong single-quote shell ('...')."""
        return s.replace("'", "'\\''")

    async def grep_xml(self, *keywords: str) -> str:
        """Dump XML, tach tung node, grep keyword — trả phần node chứa keyword."""
        await self.run_shell("uiautomator dump /sdcard/window.xml >/dev/null 2>&1")
        await asyncio.sleep(0.5)
        pattern = "|".join(re.escape(k) for k in keywords)
        pattern = self._shell_squote(pattern)  # tránh vỡ quote khi có dấu '
        # Tach node, grep, cat /dev/stdin để giữ output ngắn
        cmd = (
            "sed 's/<node/\\n<node/g' /sdcard/window.xml 2>/dev/null"
            f" | grep -iE '{pattern}' | head -5"
        )
        return await self.run_shell(cmd)

    async def get_node_bounds(self, keyword: str) -> Optional[tuple[int, int]]:
        """Tìm bounds của node chứa keyword trong XML hiện tại — trả (cx, cy) hoặc None.

        Dung on-device sed+grep+grep-o để extract chỉ phần bounds, tránh truncation.
        """
        kw = self._shell_squote(re.escape(keyword))
        cmd = (
            "sed 's/<node/\\n<node/g' /sdcard/window.xml 2>/dev/null"
            f" | grep -iE '{kw}'"
            " | grep -o 'bounds=\"[^\"]*\"' | head -1"
        )
        out = await self.run_shell(cmd)
        return self.extract_bounds(out or "")

    async def grep_node_by_id(self, resource_id_suffix: str) -> str:
        """Lấy node đầy đủ theo resource-id suffix (không dump lại)."""
        rid = self._shell_squote(resource_id_suffix)
        cmd = (
            f"sed 's/<node/\\n<node/g' /sdcard/window.xml 2>/dev/null"
            f" | grep '{rid}' | head -1"
        )
        return await self.run_shell(cmd)

    async def tap(self, x: int, y: int) -> None:
        await self.run_shell(f"input tap {x} {y}")

    async def swipe(self, x1: int, y1: int, x2: int, y2: int,
                    duration_ms: int = 800) -> None:
        await self.run_shell(f"input swipe {x1} {y1} {x2} {y2} {duration_ms}")

    async def input_text(self, text: str) -> None:
        safe = text.replace("'", "'\\''")
        await self.run_shell(f"input text '{safe}'")

    async def press_enter(self) -> None:
        await self.run_shell("input keyevent 66")

    async def get_screen_size(self) -> tuple[int, int]:
        out = await self.run_shell("wm size")
        m = re.search(r"(\d+)x(\d+)", out or "")
        if m:
            return int(m.group(1)), int(m.group(2))
        return 1440, 3120

    @staticmethod
    def extract_bounds(xml_node: str) -> Optional[tuple[int, int]]:
        """Extract center (cx, cy) từ bounds="[x1,y1][x2,y2]"."""
        m = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml_node)
        if m:
            x1, y1, x2, y2 = map(int, m.groups())
            return (x1 + x2) // 2, (y1 + y2) // 2
        return None

    async def tap_element(self, xml_node: str) -> bool:
        """Click vào center của node XML. Returns True nếu thành công."""
        coords = self.extract_bounds(xml_node)
        if coords:
            await self.tap(*coords)
            return True
        return False

    async def poll_until(
        self,
        checks: list[tuple],  # list of (search_str, action_fn_or_None)
        timeout: float = 90.0,
        interval: float = 3.0,
    ) -> Optional[str]:
        """Poll dump XML cho đến khi 1 trong các điều kiện match.

        checks: list of (pattern_str, label)
          - pattern_str: chuỗi cần tìm trong XML dump
          - label: tên trả về khi match

        Returns: label của điều kiện match đầu tiên, hoặc None nếu timeout.
        """
        elapsed = 0.0
        while elapsed < timeout:
            xml = await self.dump_xml()
            for pattern, label in checks:
                if pattern in xml:
                    return label
            await asyncio.sleep(interval)
            elapsed += interval
        return None

    async def wait_pad_not_ready(self, timeout: float = 120.0,
                                  poll: float = 3.0) -> bool:
        """Chờ padStatus rời khỏi 10 (thiết bị bắt đầu reboot/replace).

        Dùng sau padReplaceNew để tránh detect nhầm trạng thái ready CŨ.
        Returns True nếu phát hiện rời ready, False nếu timeout (vẫn ready).
        """
        elapsed = 0.0
        while elapsed < timeout:
            s = await self.get_pad_status()
            if s != 10:
                return True
            await asyncio.sleep(poll)
            elapsed += poll
        return False

    async def new_device(self, template_id: int = 36) -> bool:
        """Gọi padReplaceNew 1 lần rồi chờ instance ready.
        Retry / rate-limit xử lý bởi caller (step1).
        """
        fn = functools.partial(
            self._client.instance.one_key_new_device_auto,
            [self.pad],
            real_phone_template_id=template_id,
            country_code="US",
            wipe_data=True,
            replacement_real_adi_flag=True,
        )
        await asyncio.to_thread(fn)
        # Chờ thiết bị bắt đầu reboot (rời trạng thái ready CŨ) trước
        # khi chờ ready lại — tránh detect nhầm instance cũ.
        await self.wait_pad_not_ready(timeout=120, poll=3)
        return await self.wait_pad_ready(timeout=360, poll=5)

    async def list_installed_apps(self) -> list[str]:
        out = await self.run_shell("pm list packages 2>/dev/null")
        return re.findall(r"package:(\S+)", out or "")

    # ── Root / switchRoot ─────────────────────────────────────────────────────

    async def switch_root(self, global_root: bool = True,
                          root_status: bool = True) -> bool:
        """Gọi switchRoot API. Trả True nếu không raise lỗi."""
        fn = functools.partial(
            self._client.instance.switch_root,
            [self.pad],
            global_root=global_root,
            root_status=root_status,
        )
        await asyncio.to_thread(fn)
        return True

    async def check_resetprop(self) -> bool:
        """Kiểm tra /system/bin/resetprop tồn tại. Trả True nếu có."""
        out = await self.run_shell(
            "test -f /system/bin/resetprop && echo HAS_RESETPROP || echo NO_RESETPROP"
        )
        return "HAS_RESETPROP" in (out or "")

    async def check_apmt(self) -> bool:
        """Kiểm tra lệnh apmt có sẵn trên device không. Trả True nếu có."""
        out = await self.run_shell(
            "which apmt 2>/dev/null && echo HAS_APMT || echo NO_APMT"
        )
        return "HAS_APMT" in (out or "")

    # ── Template / image change ───────────────────────────────────────────────

    async def modify_real_adi_template(
        self, template_id: int, wipe_data: bool = True
    ) -> bool:
        """Đổi ADI template real device. Trả True nếu không raise lỗi."""
        fn = functools.partial(
            self._client.instance.modify_real_adi_template,
            [self.pad],
            real_phone_template_id=template_id,
            wipe_data=wipe_data,
        )
        await asyncio.to_thread(fn)
        await self.wait_pad_not_ready(timeout=120, poll=3)
        return await self.wait_pad_ready(timeout=360, poll=5)

    async def upgrade_real_device_image(
        self,
        *,
        image_id: str | None = None,
        real_phone_template_id: int | None = None,
        device_android_props: dict | None = None,
        wipe_data: bool = True,
    ) -> bool:
        """virtualRealSwitch — nâng cấp/đổi image real device. Trả True khi ready."""
        fn = functools.partial(
            self._client.instance.upgrade_real_device_image,
            [self.pad],
            image_id=image_id,
            real_phone_template_id=real_phone_template_id,
            device_android_props=device_android_props,
            wipe_data=wipe_data,
        )
        await asyncio.to_thread(fn)
        await self.wait_pad_not_ready(timeout=120, poll=3)
        return await self.wait_pad_ready(timeout=360, poll=5)
