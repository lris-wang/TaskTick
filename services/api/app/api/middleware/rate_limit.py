"""
限流中间件。

对所有请求进行全局限流（默认 60 req/min），
对 /auth/* 路径使用更严格的单独限制（10 req/min）。
超限返回 HTTP 429。
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.cache.redis import rate_limit
from app.config import get_settings

settings = get_settings()


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.rate_limit_enabled:
            return await call_next(request)

        # 提取客户端标识（优先用 X-Forwarded-For 头，否则用 client.host）
        client_ip = (
            request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or request.client.host
            if request.client
            else "unknown"
        )
        # 认证路径使用严格限制
        is_auth_path = request.url.path.startswith("/api/v1/auth")
        limit = (
            settings.rate_limit_auth_requests
            if is_auth_path
            else settings.rate_limit_requests
        )
        window = settings.rate_limit_window_seconds

        passed, remaining, retry_after = await rate_limit(
            key=client_ip,
            max_requests=limit,
            window_seconds=window,
            is_auth=is_auth_path,
        )

        if not passed:
            return JSONResponse(
                status_code=429,
                content={"detail": "请求过于频繁，请稍后再试"},
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
