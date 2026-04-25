from contextlib import asynccontextmanager
import asyncio

import alembic.config
import anyio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import RateLimitMiddleware
from app.api.routes import ai_files, ai_schedules
from app.api.routes import auth, events, location_reminders, notes, notifications, pomodoros, project_groups, projects, push, schedules, smart_lists, sync, tags, tasks, teams, comments
from app.cache import close_redis, init_redis
from app.config import get_settings
from app.events import sse_emitter
from app.events.emitter import EVENT_NOTIFY
from app.models import ApiToken, Schedule, User  # noqa: F401
from app.storage.minio_store import ensure_bucket_for_app


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Startup: init Redis (no-op if REDIS_URL not set)
    settings = get_settings()
    if settings.is_redis:
        await init_redis(settings)
    # Auto-run Alembic migrations (handles table creation + schema changes)
    await anyio.to_thread.run_sync(_run_migrations)
    # MinIO bucket
    await anyio.to_thread.run_sync(ensure_bucket_for_app, settings)
    # Start due-task notification scheduler
    try:
        asyncio.create_task(_run_due_notification_scheduler())
    except Exception as e:
        print(f"Failed to start scheduler: {e}")
    yield
    # Shutdown: close Redis
    await close_redis()


async def _run_due_notification_scheduler() -> None:
    """Background task: check for due tasks every 60 seconds and send SSE + email reminders.

    Handles two reminder types:
    - Preset reminders: e.g. due_at - 5 min, due_at - 15 min (stored in reminder_settings.presets)
    - Due-time reminder: when due_at is reached (task is overdue)

    Deduplication: tracks notified (task_id, reminder_key) pairs in an in-memory set.
    """
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models import PushSubscription, Task, User
    from app.utils.email import send_task_reminder
    from app.utils.webpush import send_web_push
    from app.cache.redis import store_notification_failure

    # In-memory deduplication: already-notified (task_id, reminder_key) pairs
    # Key format: f"{task_id}:{preset_minutes}" or f"{task_id}:custom:{custom_time_iso}"
    _notified: set[str] = set()

    while True:
        await asyncio.sleep(60)
        try:
            now = datetime.now(timezone.utc)
            async with AsyncSessionLocal() as session:
                stmt = (
                    select(Task)
                    .join(User, User.id == Task.user_id)
                    .where(
                        Task.completed == 0,
                        Task.deleted_at.is_(None),
                        Task.notify_enabled == True,  # noqa: E712
                    )
                )
                result = await session.execute(stmt)
                tasks = result.scalars().all()

                for task in tasks:
                    user = await session.get(User, task.user_id)
                    if not user or not user.email:
                        continue

                    settings: dict | None = task.reminder_settings
                    presets: list[int] = settings.get("presets", [5, 15]) if settings else [5, 15]
                    custom_times: list[str] = (
                        settings.get("customTimes", []) if settings else []
                    )

                    reminders_to_fire: list[tuple[str, str | None]] = []

                    # 1) Preset advance reminders (e.g. 5 min, 15 min before due)
                    if task.due_at:
                        for minutes in presets:
                            fire_at = task.due_at - timedelta(minutes=minutes)
                            key = f"{task.id}:{minutes}"
                            if now >= fire_at and key not in _notified:
                                _notified.add(key)
                                reminders_to_fire.append((f"{minutes}分钟前", task.due_at.isoformat() if task.due_at else None))

                    # 2) Custom specific-time reminders
                    for ct_iso in custom_times:
                        try:
                            ct = datetime.fromisoformat(ct_iso.replace("Z", "+00:00"))
                            key = f"{task.id}:custom:{ct_iso}"
                            if now >= ct and key not in _notified:
                                _notified.add(key)
                                reminders_to_fire.append(("自定义时间", ct_iso))
                        except Exception:
                            pass  # Invalid ISO format, skip

                    # 3) Due-time reminder (once when due_at is reached)
                    if task.due_at:
                        key = f"{task.id}:due"
                        if now >= task.due_at and key not in _notified:
                            _notified.add(key)
                            reminders_to_fire.append(("到期", task.due_at.isoformat() if task.due_at else None))

                    # Send notifications
                    for label, due_label in reminders_to_fire:
                        await sse_emitter.emit(
                            task.user_id,
                            EVENT_NOTIFY,
                            {
                                "title": f"任务提醒 [{label}]",
                                "body": f'"{task.title}"',
                            },
                        )
                        # Email reminder with retry (inside scheduler, already retried by send_email)
                        email_ok = await send_task_reminder(
                            user.email,
                            task.title,
                            due_label,
                            int(task.priority) if task.priority else 0,
                        )
                        if not email_ok:
                            await store_notification_failure(
                                str(user.id),
                                "task_reminder",
                                f"任务提醒 [{label}]：{task.title}",
                                "邮件发送失败（SMTP 配置错误或服务不可用）",
                            )
                        # Also send Web Push notification if subscribed
                        sub_result = await session.execute(
                            select(PushSubscription).where(PushSubscription.user_id == user.id)
                        )
                        sub = sub_result.scalar_one_or_none()
                        if sub:
                            push_title = f"TaskTick 提醒 [{label}]"
                            push_body = f'"{task.title}"'
                            push_ok = await send_web_push(user, sub, push_title, push_body, tag=str(task.id))
                            if not push_ok:
                                await store_notification_failure(
                                    str(user.id),
                                    "task_reminder_push",
                                    f"TaskTick 提醒 [{label}]：{task.title}",
                                    "Web Push 推送失败（订阅可能已过期）",
                                )
        except Exception:
            pass  # Never crash the background scheduler


def _run_migrations() -> None:
    """Run pending Alembic migrations on startup; fall back to create_all if alembic dir missing."""
    import os
    base_dir = os.path.dirname(os.path.dirname(__file__))
    migrations_path = os.path.join(base_dir, "alembic_migrations")
    if not os.path.isdir(migrations_path):
        print(f"[WARN] alembic_migrations not found at {migrations_path}, using create_all instead")
        from sqlalchemy import create_engine
        from app.models.base import Base
        from app.config import get_settings
        settings = get_settings()
        sync_url = settings.database_url.replace("+aiosqlite", "").replace("+asyncpg", "")
        sync_engine = create_engine(sync_url, echo=False)
        Base.metadata.create_all(sync_engine)
        sync_engine.dispose()
        return
    alembic_cfg = alembic.config.Config(os.path.join(base_dir, "alembic.ini"))
    alembic_cfg.set_main_option("script_location", migrations_path)
    alembic.command.upgrade(alembic_cfg, "head")


app = FastAPI(
    title="TaskTick API",
    version="0.1.0",
    lifespan=lifespan,
    description=(
        "AI 集成：使用 `Authorization: Bearer <api_token>` 调用 `/api/v1/ai/schedules` "
        "系列接口读写当前 token 所属用户的日程。"
        "token 由运维脚本 `scripts/create_ai_token.py` 生成，仅展示一次。"
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting (must be the outermost middleware, so add first)
app.add_middleware(RateLimitMiddleware)

app.include_router(ai_schedules.router, prefix="/api/v1/ai")
app.include_router(ai_files.router, prefix="/api/v1/ai")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(project_groups.router, prefix="/api/v1")
app.include_router(tags.router, prefix="/api/v1")
app.include_router(notes.router, prefix="/api/v1")
app.include_router(sync.router, prefix="/api/v1")
app.include_router(teams.router, prefix="/api/v1")
app.include_router(schedules.router, prefix="/api/v1")
app.include_router(pomodoros.router, prefix="/api/v1")
app.include_router(smart_lists.router, prefix="/api/v1")
app.include_router(events.router, prefix="/api/v1")
app.include_router(location_reminders.router, prefix="/api/v1")
app.include_router(comments.router, prefix="/api/v1")
app.include_router(push.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

@app.get("/debug/email-config")
async def debug_email_config() -> dict:
    settings = get_settings()
    return {
        "email_smtp_host": settings.email_smtp_host,
        "email_smtp_host1": settings.email_smtp_host1,
        "email_smtp_port": settings.email_smtp_port,
        "email_smtp_port1": settings.email_smtp_port1,
        "email_smtp_user": settings.email_smtp_user,
        "email_smtp_user1": settings.email_smtp_user1,
        "email_smtp_password_set": bool(settings.email_smtp_password),
        "email_smtp_password1_set": bool(settings.email_smtp_password1),
    }
