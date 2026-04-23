"""
SSE（Server-Sent Events）实时推送端点。

GET /api/v1/events?token=<jwt>
  - 认证：token 通过 query 参数传入（EventSource 无法携带自定义 header）
  - 返回：text/event-stream，永久保持连接
  - 心跳：每 25 秒发送一条 comment，防止连接被中间件超时断开
  - 事件类型：task_created / task_updated / task_deleted /
              project_* / tag_* / notify

EventSource 示例（浏览器）：
  const es = new EventSource(
    '/api/v1/events?token=' + encodeURIComponent(accessToken)
  );
  es.addEventListener('task_created', (e) => {
    const data = JSON.parse(e.data);
    console.log('新任务:', data);
  });
  es.addEventListener('notify', (e) => {
    const { title, body } = JSON.parse(e.data);
    new Notification(title, { body });
  });
"""

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response, StreamingResponse

from app.api.deps import get_current_user, get_current_user_from_query
from app.events import sse_emitter
from app.models import User

router = APIRouter(prefix="/events", tags=["Events"])


@router.get("")
async def sse_connect(
    request: Request,
    token: str = Query(description="JWT access token"),
    user: User = Depends(get_current_user_from_query),
) -> Response:
    """
    打开 SSE 连接。

    注意：`get_current_user` 从 query token 解析 user（而非从 header），
    这允许 EventSource（仅支持 GET + 有限 header）完成认证。
    """
    emitter = await sse_emitter.connect(user.id)

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    entry = await asyncio.wait_for(emitter._queue.get(), timeout=25)
                    yield entry
                except asyncio.TimeoutError:
                    yield f": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await sse_emitter.disconnect(user.id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get("/status")
async def sse_status(
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """查询当前 SSE 连接状态（用于调试或前端判断连接是否在线）。"""
    return {
        "connected": sse_emitter.is_connected(user.id),
        "total_connections": sse_emitter.connection_count,
    }
