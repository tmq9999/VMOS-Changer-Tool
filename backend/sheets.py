"""Google Sheets integration — đọc email, ghi kết quả, highlight màu."""
from __future__ import annotations

import json
from typing import Optional

import gspread
from gspread.utils import rowcol_to_a1
from google.oauth2.service_account import Credentials

_SCOPES = [
    "https://spreadsheets.google.com/feeds",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# Màu highlight (RGB 0-1 float)
_COLOR_GREEN  = {"red": 0.204, "green": 0.659, "blue": 0.325}
_COLOR_ORANGE = {"red": 1.0,   "green": 0.596, "blue": 0.0}
_COLOR_RED    = {"red": 0.863, "green": 0.078, "blue": 0.235}
_COLOR_BLUE   = {"red": 0.263, "green": 0.627, "blue": 0.929}
_COLOR_WHITE  = {"red": 1.0,   "green": 1.0,   "blue": 1.0}

_SEVERITY_COLORS = {
    "SUCCESS": _COLOR_GREEN,
    "WARN":    _COLOR_ORANGE,
    "ERROR":   _COLOR_RED,
    "RUNNING": _COLOR_BLUE,
    "QUEUED":  _COLOR_WHITE,
}

# Cột mapping (1-indexed)
_COL_EMAIL    = 2   # B
_COL_PASSWORD = 3   # C
_COL_2FA      = 4   # D
_COL_FULL_FMT = 5   # E
_COL_OFFER1   = 6   # F
_COL_OFFER2   = 7   # G
_COL_RESULT   = 8   # H
_TOTAL_COLS   = 8   # A–H


class SheetsClient:
    """Kết nối và thao tác với Google Sheet."""

    def __init__(self, service_account_json: str, spreadsheet_id: str,
                 sheet_name: str = "Sheet1", data_start_row: int = 2):
        creds_dict = json.loads(service_account_json)
        creds = Credentials.from_service_account_info(creds_dict, scopes=_SCOPES)
        gc = gspread.authorize(creds)
        self._ss = gc.open_by_key(spreadsheet_id)
        self._ws = self._ss.worksheet(sheet_name)
        self._start_row = data_start_row

    def read_emails(self, skip_successful: bool = True) -> list[dict]:
        """Đọc toàn bộ dòng data từ Sheet.

        Returns list of dicts: {row, email, password, totp_secret, result}
        """
        all_values = self._ws.get_all_values()
        result = []
        for i, row in enumerate(all_values):
            row_num = i + 1
            if row_num < self._start_row:
                continue
            # Đảm bảo đủ cột
            while len(row) < _TOTAL_COLS:
                row.append("")

            email    = row[_COL_EMAIL - 1].strip()
            password = row[_COL_PASSWORD - 1].strip()
            totp     = row[_COL_2FA - 1].strip()
            current_result = row[_COL_RESULT - 1].strip()

            if not email:
                continue

            if skip_successful and current_result == "SUCCESS":
                continue

            result.append({
                "row": row_num,
                "email": email,
                "password": password,
                "totp_secret": totp,
                "result": current_result,
            })
        return result

    def write_result(
        self,
        row: int,
        offer1: Optional[str],
        offer2: Optional[str],
        result: str,
        full_format: str = "",
        severity: str = "ERROR",
    ) -> None:
        """Ghi F, G, H + highlight màu toàn dòng A–H — 1 batch call."""
        updates = [
            {
                "range": f"{rowcol_to_a1(row, _COL_OFFER1)}",
                "values": [[offer1 or ""]],
            },
            {
                "range": f"{rowcol_to_a1(row, _COL_OFFER2)}",
                "values": [[offer2 or ""]],
            },
            {
                "range": f"{rowcol_to_a1(row, _COL_RESULT)}",
                "values": [[result]],
            },
        ]

        self._ws.batch_update(updates)

        # Highlight màu toàn dòng A–H
        color = _SEVERITY_COLORS.get(severity, _COLOR_WHITE)
        self._ws.format(
            f"A{row}:{rowcol_to_a1(row, _TOTAL_COLS)}",
            {"backgroundColor": color},
        )

    def mark_running(self, row: int, step: str = "") -> None:
        """Đánh dấu dòng đang xử lý (xanh dương)."""
        self._ws.update_cell(row, _COL_RESULT, f"RUNNING: {step}")
        self._ws.format(
            f"A{row}:{rowcol_to_a1(row, _TOTAL_COLS)}",
            {"backgroundColor": _COLOR_BLUE},
        )

    def mark_queued(self, row: int) -> None:
        """Reset dòng lỗi về trạng thái chờ (trắng)."""
        self._ws.update_cell(row, _COL_RESULT, "")
        self._ws.format(
            f"A{row}:{rowcol_to_a1(row, _TOTAL_COLS)}",
            {"backgroundColor": _COLOR_WHITE},
        )
