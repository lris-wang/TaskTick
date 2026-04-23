"""
SSE（Server-Sent Events）发射器。

负责：
- 管理所有活跃的 SSE 连接（按 user_id 索引）
- 向指定用户推送事件
- 广播（所有在线用户）
- 连接超时心跳保活

使用方式（Redis pub/sub 分布式版可 later 替换 transport 层）：
    from app.events import sse_emitter
    await sse_emitter.emit(user_id, "task_due", {"taskId": "...", "title": "..."})
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from starlette.responses import Response

# ---------------------------------------------------------------------------
# Event Types
# ---------------------------------------------------------------------------

EVENT_HEARTBEAT = "heartbeat"
EVENT_TASK_CREATED = "task_created"
EVENT_TASK_UPDATED = "task_updated"
EVENT_TASK_DELETED = "task_deleted"
EVENT_PROJECT_CREATED = "project_created"
EVENT_PROJECT_UPDATED = "project_updated"
EVENT_PROJECT_DELETED = "project_deleted"
EVENT_TAG_CREATED = "tag_created"
EVENT_TAG_UPDATED = "tag_updated"
EVENT_TAG_DELETED = "tag_deleted"
EVENT_NOTE_CREATED = "note_created"
EVENT_NOTE_UPDATED = "note_updated"
EVENT_NOTE_DELETED = "note_deleted"
EVENT_PROJECT_GROUP_CREATED = "project_group_created"
EVENT_PROJECT_GROUP_UPDATED = "project_group_updated"
EVENT_PROJECT_GROUP_DELETED = "project_group_deleted"
EVENT_NOTIFY = "notify"          # 桌面提醒（前端负责弹窗）


# ---------------------------------------------------------------------------
# SSE Emitter Manager
# ---------------------------------------------------------------------------

SSE_HEARTBEAT_INTERVAL = 25      # 秒（略短于大多数负载均衡器的 60s 超时）
SSE_EVENT_QUEUE_SIZE = 64       # 每个连接最大待发事件缓存


class SSEmitter:
    """
    单个客户端的 SSE 发射器。
    """

    def __init__(self, user_id: UUID):
        self.user_id = user_id
        self._queue: asyncio.Queue[str] = asyncio.Queue(maxsize=SSE_EVENT_QUEUE_SIZE)
        self._closed = False

    async def send(self, event: str, data: dict[str, Any]) -> None:
        """将事件加入发送队列（非阻塞）。"""
        if self._closed:
            return
        payload = json.dumps({"event": event, "data": data}, ensure_ascii=False, default=str)
        entry = f"event: {event}\ndata: {payload}\n\n"
        try:
            self._queue.put_nowait(entry)
        except asyncio.QueueFull:
            # 连接积压太多，丢弃最旧的
            try:
                self._queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                self._queue.put_nowait(entry)
            except asyncio.QueueFull:
                pass

    async def stream(self) -> Response:
        """
        启动 SSE 流。
        - 永不返回（除非客户端断开）
        - 每隔 SSE_HEARTBEAT_INTERVAL 秒发送一个 comment 心跳
        """
        async def event_generator() -> AsyncIterator[str]:
            while not self._closed:
                try:
                    entry = await asyncio.wait_for(self._queue.get(), timeout=SSE_HEARTBEAT_INTERVAL)
                    yield entry
                except asyncio.TimeoutError:
                    # 心跳 comment，保持连接活跃
                    yield f": heartbeat {datetime.now(timezone.utc).isoformat()}\n\n"
                except asyncio.CancelledError:
                    break

        return Response(
            content=event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",        # 禁用 nginx buffer
            },
        )

    def close(self) -> None:
        self._closed = True


class EmitterManager:
    """
    全局 SSE 连接管理器。
    单例模式，每个 user_id 最多一个活跃连接。
    """

    def __init__(self):
        self._connections: dict[UUID, SSEmitter] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: UUID) -> SSEmitter:
        """注册一个新的 SSE 连接（同一用户重复连接则关闭旧的）。"""
        async with self._lock:
            # 关闭旧连接
            old = self._connections.get(user_id)
            if old:
                old.close()
            emitter = SSEmitter(user_id)
            self._connections[user_id] = emitter
            return emitter

    async def disconnect(self, user_id: UUID) -> None:
        async with self._lock:
            emitter = self._connections.pop(user_id, None)
            if emitter:
                emitter.close()

    async def emit(self, user_id: UUID, event: str, data: dict[str, Any]) -> bool:
        """向指定用户推送一个事件。"""
        async with self._lock:
            emitter = self._connections.get(user_id)
        if emitter is None:
            return False
        await emitter.send(event, data)
        return True

    async def emit_all(self, event: str, data: dict[str, Any]) -> int:
        """广播事件给所有在线用户。"""
        sent = 0
        async with self._lock:
            emitters = list(self._connections.values())
        for emitter in emitters:
            await emitter.send(event, data)
            sent += 1
        return sent

    def is_connected(self, user_id: UUID) -> bool:
        return user_id in self._connections

    @property
    def connection_count(self) -> int:
        return len(self._connections)


# 全局单例
sse_emitter = EmitterManager()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

from collections.abc import AsyncIterator
