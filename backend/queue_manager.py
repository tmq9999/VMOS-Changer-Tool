"""Email queue và PAD pool manager."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Optional

from backend.validator import EmailEntry


@dataclass
class QueuedJob:
    entry: EmailEntry
    sheet_row: Optional[int] = None
    job_id: Optional[int] = None
    retry_count: int = 0


class EmailQueue:
    """Thread-safe async email queue."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue[QueuedJob] = asyncio.Queue()
        self._lock = asyncio.Lock()
        self._total = 0

    async def put(self, job: QueuedJob) -> None:
        await self._queue.put(job)
        self._total += 1

    async def put_many(self, jobs: list[QueuedJob]) -> None:
        for job in jobs:
            await self.put(job)

    async def get(self) -> QueuedJob:
        return await self._queue.get()

    def task_done(self) -> None:
        self._queue.task_done()

    def empty(self) -> bool:
        return self._queue.empty()

    def qsize(self) -> int:
        return self._queue.qsize()

    @property
    def total(self) -> int:
        return self._total


class PadPool:
    """Pool quản lý danh sách PAD codes sẵn sàng."""

    def __init__(self, pad_codes: list[str]) -> None:
        self._available: asyncio.Queue[str] = asyncio.Queue()
        self._all: list[str] = list(pad_codes)
        for p in pad_codes:
            self._available.put_nowait(p)

    async def acquire(self) -> str:
        """Lấy 1 PAD (block nếu không có PAD nào rảnh)."""
        return await self._available.get()

    async def release(self, pad_code: str) -> None:
        """Trả PAD về pool sau khi job xong."""
        await self._available.put(pad_code)

    def all_pads(self) -> list[str]:
        return list(self._all)

    def available_count(self) -> int:
        return self._available.qsize()
