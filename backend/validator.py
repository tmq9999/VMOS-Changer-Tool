"""Input validation cho email entries.

Format hợp lệ: email@domain|password|TOTP_SECRET
2FA Secret KEY là bắt buộc.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

import pyotp

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass
class EmailEntry:
    email: str
    password: str
    totp_secret: str
    raw: str


@dataclass
class ValidationResult:
    entry: Optional[EmailEntry]
    valid: bool
    error: str = ""


def validate_line(line: str) -> ValidationResult:
    """Validate một dòng email|pass|2fa_secret."""
    raw = line.strip()

    if not raw or raw.startswith("#"):
        return ValidationResult(entry=None, valid=False, error="SKIP")

    parts = raw.split("|")

    if len(parts) < 3:
        return ValidationResult(
            entry=None, valid=False,
            error="Thiếu 2FA Secret Key (format: email|password|2fa_secret)"
        )

    email, password, totp_secret = parts[0].strip(), parts[1].strip(), parts[2].strip()

    if not _EMAIL_RE.match(email):
        return ValidationResult(
            entry=None, valid=False,
            error=f"Email không hợp lệ: {email}"
        )

    if not password:
        return ValidationResult(
            entry=None, valid=False,
            error="Password không được để trống"
        )

    if not totp_secret:
        return ValidationResult(
            entry=None, valid=False,
            error="2FA Secret Key không được để trống"
        )

    # Kiểm tra TOTP secret có decode được không
    secret_clean = totp_secret.replace(" ", "").upper()
    try:
        totp = pyotp.TOTP(secret_clean)
        totp.now()  # Nếu secret sai format sẽ raise
    except Exception:
        return ValidationResult(
            entry=None, valid=False,
            error=f"Invalid TOTP secret: không decode được '{totp_secret}'"
        )

    return ValidationResult(
        entry=EmailEntry(
            email=email,
            password=password,
            totp_secret=secret_clean,
            raw=raw,
        ),
        valid=True,
    )


def validate_bulk(text: str) -> tuple[list[EmailEntry], list[tuple[int, str]]]:
    """Validate nhiều dòng cùng lúc.

    Returns:
        valid_entries: danh sách EmailEntry hợp lệ
        errors: list of (line_number, error_message)
    """
    valid: list[EmailEntry] = []
    errors: list[tuple[int, str]] = []

    for i, line in enumerate(text.splitlines(), start=1):
        result = validate_line(line)
        if result.error == "SKIP":
            continue
        if result.valid and result.entry:
            valid.append(result.entry)
        else:
            errors.append((i, result.error))

    return valid, errors
