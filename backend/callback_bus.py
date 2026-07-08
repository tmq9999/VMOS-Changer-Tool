"""Callback bus — nhận VMOS webhook và phân phối cho các waiter."""
from __future__ import annotations

import asyncio
from typing import Dict, Optional

# task_id -> Future[cmdResult]
_pending: Dict[int, asyncio.Future] = {}


def register(task_id: int) -> asyncio.Future:
    """Tạo Future cho task_id, waiter sẽ await future này."""
    loop = asyncio.get_event_loop()
    fut: asyncio.Future = loop.create_future()
    _pending[task_id] = fut
    return fut


def resolve(task_id: int, result: str) -> None:
    """Gọi từ webhook handler khi callback đến."""
    fut = _pending.pop(task_id, None)
    if fut and not fut.done():
        fut.set_result(result)


def cancel(task_id: int) -> None:
    """Huỷ future nếu timeout."""
    fut = _pending.pop(task_id, None)
    if fut and not fut.done():
        fut.cancel()
