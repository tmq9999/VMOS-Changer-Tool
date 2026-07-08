"""SQLite persistence — jobs và log lines."""
from __future__ import annotations

import os
import sqlite3
import threading
from datetime import datetime
from typing import Optional

_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "jobs.db")
_lock = threading.Lock()


def _conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    c = sqlite3.connect(_DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    with _lock, _conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS jobs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            email       TEXT NOT NULL,
            pad_code    TEXT,
            sheet_row   INTEGER,
            status      TEXT NOT NULL DEFAULT 'QUEUED',
            step        TEXT,
            offer1      TEXT,
            offer2      TEXT,
            result_msg  TEXT,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id      INTEGER,
            pad_code    TEXT,
            level       TEXT NOT NULL DEFAULT 'INFO',
            message     TEXT NOT NULL,
            created_at  TEXT NOT NULL
        );
        """)


# ── Jobs ──────────────────────────────────────────────────────────────────────

def create_job(email: str, sheet_row: Optional[int] = None) -> int:
    now = datetime.utcnow().isoformat()
    with _lock, _conn() as c:
        cur = c.execute(
            "INSERT INTO jobs (email, sheet_row, status, created_at, updated_at) VALUES (?,?,?,?,?)",
            (email, sheet_row, "QUEUED", now, now),
        )
        return cur.lastrowid


def update_job(job_id: int, **kwargs) -> None:
    kwargs["updated_at"] = datetime.utcnow().isoformat()
    cols = ", ".join(f"{k}=?" for k in kwargs)
    vals = list(kwargs.values()) + [job_id]
    with _lock, _conn() as c:
        c.execute(f"UPDATE jobs SET {cols} WHERE id=?", vals)


def get_job(job_id: int) -> Optional[dict]:
    with _lock, _conn() as c:
        row = c.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        return dict(row) if row else None


def get_all_jobs() -> list[dict]:
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM jobs ORDER BY id DESC").fetchall()
        return [dict(r) for r in rows]


def get_active_emails() -> set[str]:
    """Trả về set email đang trong queue (QUEUED hoặc RUNNING) — dùng để dedup."""
    with _lock, _conn() as c:
        rows = c.execute(
            "SELECT email FROM jobs WHERE status IN ('QUEUED','RUNNING')"
        ).fetchall()
        return {r['email'] for r in rows}


def clear_jobs() -> None:
    with _lock, _conn() as c:
        c.execute("DELETE FROM jobs")


def reset_running_jobs() -> None:
    """Khi restart tool, reset các job đang RUNNING → QUEUED."""
    now = datetime.utcnow().isoformat()
    with _lock, _conn() as c:
        c.execute(
            "UPDATE jobs SET status='QUEUED', step=NULL, updated_at=? WHERE status='RUNNING'",
            (now,),
        )


# ── Logs ──────────────────────────────────────────────────────────────────────

def add_log(message: str, level: str = "INFO",
            job_id: Optional[int] = None, pad_code: Optional[str] = None) -> None:
    now = datetime.utcnow().isoformat()
    with _lock, _conn() as c:
        c.execute(
            "INSERT INTO logs (job_id, pad_code, level, message, created_at) VALUES (?,?,?,?,?)",
            (job_id, pad_code, level, message, now),
        )


def clear_logs() -> None:
    with _lock, _conn() as c:
        c.execute("DELETE FROM logs")


def get_logs(limit: int = 200, pad_code: Optional[str] = None,
             level: Optional[str] = None) -> list[dict]:
    clauses, params = [], []
    if pad_code:
        clauses.append("pad_code=?")
        params.append(pad_code)
    if level:
        clauses.append("level=?")
        params.append(level)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    with _lock, _conn() as c:
        rows = c.execute(
            f"SELECT * FROM logs {where} ORDER BY id DESC LIMIT ?",
            params + [limit],
        ).fetchall()
        return [dict(r) for r in rows]
