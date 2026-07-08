"""Settings model — load/save từ settings.json."""
from __future__ import annotations

import json
import os
from typing import Literal

from pydantic import BaseModel, Field

_SETTINGS_PATH = os.path.join(os.path.dirname(__file__), "..", "settings.json")


class Settings(BaseModel):
    # VMOS API
    access_key: str = ""
    secret_key: str = ""
    pad_mode: Literal["auto", "manual"] = "auto"
    manual_pad_codes: list[str] = Field(default_factory=list)

    # Google Sheet
    service_account_json: str = ""   # raw JSON string
    spreadsheet_id: str = ""
    sheet_name: str = "Sheet1"       # tab name
    data_start_row: int = 2          # row đầu tiên chứa data (bỏ header)

    # Timing
    poll_interval: float = 3.0       # giây giữa mỗi poll dump
    step_timeout: float = 90.0       # timeout mỗi state machine (giây)
    magisk_timeout: float = 120.0    # timeout riêng cho Magisk download
    retry_count: int = 3
    worker_start_delay: float = 2.0  # delay giữa các worker khởi động
    step_delay: float = 1.5          # delay giữa các bước
    post_boot_settle: float = 45.0   # chờ device ổn định sau reboot trước khi login

    # Queue behaviour
    skip_successful: bool = True     # skip dòng đã SUCCESS


def load_settings() -> Settings:
    if os.path.exists(_SETTINGS_PATH):
        with open(_SETTINGS_PATH, encoding="utf-8") as f:
            return Settings(**json.load(f))
    return Settings()


def save_settings(s: Settings) -> None:
    with open(_SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(s.model_dump(), f, indent=2, ensure_ascii=False)
