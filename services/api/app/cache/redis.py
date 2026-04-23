"""
Redis 客户端 + 工具函数。

提供：
- `get_redis()` — 获取异步 Redis 客户端（懒加载，app 生命周期内单例）
- `rate_limit()` — 滑动窗口限流
- `blacklist_token()` / `is_token_blacklisted()` — JWT 黑名单（登出用）
- `cache_get()` / `cache_set()` — 简单 KV 缓存
"""

from __future__ import annotations

import json
import time
from typing import TYPE_CHECKING

import redis.asyncio as redis

if TYPE_CHECKING:
    from app.config import Settings

# 全局单例
_redis: redis.Redis | None = None


def _build_redis_url(settings: Settings) -> str:
    """从配置构造 redis-py 能识别的 URL。"""
    if settings.redis_url:
        return settings.redis_url
    pw = f":{settings.redis_password}@" if settings.redis_password else ""
    return f"redis://{pw}localhost:{6379}/{settings.redis_db}"


async def init_redis(settings: Settings) -> redis.Redis:
    """启动时调用，建立连接池。"""
    global _redis
    if _redis is not None:
        return _redis
    _redis = redis.from_url(
        _build_redis_url(settings),
        max_connections=settings.redis_max_connections,
        decode_responses=True,
    )
    return _redis


async def close_redis() -> None:
    """关闭时调用，释放连接池。"""
    global _redis
    if _redis is not None:
        await _redis.close()
        _redis = None


async def get_redis() -> redis.Redis:
    """获取当前 Redis 客户端，未配置时抛出异常。"""
    if _redis is None:
        raise RuntimeError("Redis 未初始化，请先调用 init_redis()")
    return _redis


# ---------------------------------------------------------------------------
# Rate Limiting（滑动窗口）
# ---------------------------------------------------------------------------

RATE_LIMIT_PREFIX = "ratelimit:"
RATE_LIMIT_AUTH_PREFIX = "ratelimit:auth:"


async def rate_limit(
    key: str,
    max_requests: int,
    window_seconds: int,
    is_auth: bool = False,
) -> tuple[bool, int, int]:
    """
    滑动窗口限流。

    返回 (是否通过, 剩余可用次数, 距下次重置秒数)
    """
    if _redis is None:
        return True, max_requests, window_seconds

    prefix = RATE_LIMIT_AUTH_PREFIX if is_auth else RATE_LIMIT_PREFIX
    now = time.time()
    window_start = now - window_seconds
    redis_key = f"{prefix}{key}"

    pipe = _redis.pipeline()
    # 删除窗口外的旧记录
    pipe.zremrangebyscore(redis_key, 0, window_start)
    # 当前窗口请求数
    pipe.zcard(redis_key)
    # 设置当前请求时间戳（分值 = 时间戳，成员 = 唯一标识）
    pipe.zadd(redis_key, {f"{now}": now})
    # 设置过期时间
    pipe.expire(redis_key, window_seconds + 1)
    results = await pipe.execute()

    current_count = results[1]

    if current_count >= max_requests:
        # 超限，取最老请求的过期时间
        oldest = await _redis.zrange(redis_key, 0, 0, withscores=True)
        reset_at = int(oldest[0][1] + window_seconds) if oldest else int(now + window_seconds)
        return False, 0, reset_at - int(now)

    return True, max_requests - current_count - 1, window_seconds


# ---------------------------------------------------------------------------
# JWT Token Blacklist（登出黑名单）
# ---------------------------------------------------------------------------

BLACKLIST_PREFIX = "token:blacklist:"
# JWT access token 默认有效期 1 天，黑名单缓存多留 1 小时
BLACKLIST_TTL_SECONDS = 60 * 60 * 25


async def blacklist_token(jti: str, exp: int) -> None:
    """将 token jti 加入黑名单（登出时调用）。"""
    if _redis is None:
        return
    ttl = max(exp - int(time.time()), 1)
    await _redis.setex(f"{BLACKLIST_PREFIX}{jti}", ttl, "1")


async def is_token_blacklisted(jti: str) -> bool:
    """检查 token jti 是否在黑名单中。"""
    if _redis is None:
        return False
    return await _redis.exists(f"{BLACKLIST_PREFIX}{jti}") == 1


# ---------------------------------------------------------------------------
# Generic Cache
# ---------------------------------------------------------------------------

CACHE_PREFIX = "cache:"


async def cache_get(key: str) -> dict | list | None:
    """读取缓存，返回 None 表示未命中或未配置 Redis。"""
    if _redis is None:
        return None
    val = await _redis.get(f"{CACHE_PREFIX}{key}")
    if val is None:
        return None
    try:
        return json.loads(val)
    except json.JSONDecodeError:
        return None


async def cache_set(key: str, value: dict | list, ttl_seconds: int = 300) -> None:
    """写入缓存（默认 5 分钟 TTL）。"""
    if _redis is None:
        return
    await _redis.setex(f"{CACHE_PREFIX}{key}", ttl_seconds, json.dumps(value))


# ---------------------------------------------------------------------------
# Failed Email Notification Store
# ---------------------------------------------------------------------------

NOTIFY_FAIL_PREFIX = "notify_fail:"
NOTIFY_FAIL_TTL_SECONDS = 60 * 60 * 24  # 24 hours


async def store_notification_failure(
    user_id: str,
    notification_type: str,
    subject: str,
    reason: str,
) -> None:
    """记录一次邮件发送失败，供前端在下次登录时查询并展示给用户。"""
    if _redis is None:
        return
    key = f"{NOTIFY_FAIL_PREFIX}{user_id}"
    entry = {
        "type": notification_type,
        "subject": subject,
        "reason": reason,
        "ts": __import__("time").time(),
    }
    # Append to a list (RPUSH), keep last 10
    pipe = _redis.pipeline()
    pipe.rpush(key, json.dumps(entry))
    pipe.ltrim(key, -10, -1)  # keep last 10
    pipe.expire(key, NOTIFY_FAIL_TTL_SECONDS)
    await pipe.execute()


async def get_notification_failures(user_id: str) -> list[dict]:
    """获取该用户所有未处理的邮件发送失败通知。"""
    if _redis is None:
        return []
    key = f"{NOTIFY_FAIL_PREFIX}{user_id}"
    raw = await _redis.lrange(key, 0, -1)
    return [json.loads(r) for r in raw]
