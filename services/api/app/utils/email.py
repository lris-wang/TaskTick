"""
Email utilities using aiosmtplib.
Gracefully degrades when SMTP is not configured or aiosmtplib is not installed (development mode).
Supports retry with exponential backoff for production reliability.
"""

import asyncio
import logging
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

try:
    import aiosmtplib

    _HAS_AIOSMTPLIB = True
except ImportError:
    _HAS_AIOSMTPLIB = False
    aiosmtplib = None

# Default retry config
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 1.0  # seconds, will double each retry (exponential backoff)


async def send_email(
    to: str,
    subject: str,
    html_body: str,
    *,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_delay: float = DEFAULT_RETRY_DELAY,
) -> bool:
    """
    Send an email with retry. Returns True on success, False on all retries exhausted.
    """
    if not _HAS_AIOSMTPLIB:
        logger.warning("[email] aiosmtplib not installed, logging email content instead")
        logger.info("[email] To: %s | Subject: %s | Body (truncated): %s", to, subject, html_body[:200])
        return False

    # Hardcoded Resend SMTP for Render deployment (temporary fix for env var issue)
    host = "smtp.resend.com"
    port = 587
    user = "resend"
    password = "re_GBNiDoQV_CDTewe7WAr4U71G7Az1k8KSX"
    from_addr = "TaskTick <noreply@tasktick.asia>"

    message = MIMEText(html_body, "html", "utf-8")
    message["From"] = from_addr
    message["To"] = to
    message["Subject"] = subject

    last_error: Exception | None = None
    delay = retry_delay

    for attempt in range(1, max_retries + 1):
        try:
            use_tls = port == 465
            await aiosmtplib.send(
                message,
                hostname=host,
                port=port,
                username=user,
                password=password,
                start_tls=not use_tls,
                use_tls=use_tls,
            )
            logger.info("[email] Sent to %s (attempt %d): %s", to, attempt, subject)
            return True
        except Exception as exc:
            last_error = exc
            logger.warning(
                "[email] Failed to send to %s (attempt %d/%d): %s. Retrying in %.1fs...",
                to, attempt, max_retries, exc, delay,
            )
            if attempt < max_retries:
                await asyncio.sleep(delay)
                delay *= 2  # exponential backoff

    logger.error("[email] All %d retries exhausted for %s (%s): %s", max_retries, to, subject, last_error)
    return False


async def send_verification_code(to_email: str, code: str) -> bool:
    subject = "【TaskTick】您的注册验证码"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
        <h2 style="color: #fff; margin: 0;">TaskTick 注册验证码</h2>
      </div>
      <div style="background: #f9fafb; padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; font-size: 15px; margin: 0 0 16px;">您好，</p>
        <p style="color: #374151; font-size: 15px; margin: 0 0 24px;">您的 TaskTick 注册验证码为：</p>
        <div style="background: #fff; border: 2px dashed #d1d5db; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 36px; font-weight: bold; letter-spacing: 12px; color: #4f46e5;">{code}</span>
        </div>
        <p style="color: #6b7280; font-size: 13px; margin: 0;">验证码 <strong>10 分钟</strong>内有效，请勿告知他人。</p>
      </div>
    </div>
    """
    return await send_email(to_email, subject, html)


async def send_password_reset_code(to_email: str, code: str) -> bool:
    subject = "【TaskTick】您的密码重置验证码"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
        <h2 style="color: #fff; margin: 0;">TaskTick 密码重置</h2>
      </div>
      <div style="background: #f9fafb; padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; font-size: 15px; margin: 0 0 16px;">您好，</p>
        <p style="color: #374151; font-size: 15px; margin: 0 0 24px;">您正在重置 TaskTick 账号的密码，验证码为：</p>
        <div style="background: #fff; border: 2px dashed #d1d5db; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 36px; font-weight: bold; letter-spacing: 12px; color: #f5576c;">{code}</span>
        </div>
        <p style="color: #6b7280; font-size: 13px; margin: 0;">验证码 <strong>10 分钟</strong>内有效，请勿告知他人。如非本人操作，请忽略此邮件。</p>
      </div>
    </div>
    """
    return await send_email(to_email, subject, html)


async def send_task_reminder(to_email: str, task_title: str, due_at: str | None, priority: int) -> bool:
    priority_label = {3: "🔴 紧急", 2: "🟠 高", 1: "🟡 低", 0: "⚪ 普通"}.get(priority, "⚪ 普通")
    due_label = due_at[:16].replace("T", " ") if due_at else "未设置截止日期"
    subject = f"【TaskTick 任务到期提醒】{task_title}"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
        <h2 style="color: #fff; margin: 0;">⏰ TaskTick 任务到期提醒</h2>
      </div>
      <div style="background: #f9fafb; padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; font-size: 15px; margin: 0 0 16px;">您好，</p>
        <p style="color: #374151; font-size: 15px; margin: 0 0 24px;">您有一个任务已到期：</p>
        <div style="background: #fff; border: 2px dashed #d1d5db; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="font-size: 18px; font-weight: bold; color: #1f2937; margin: 0 0 12px;">{task_title}</p>
          <p style="color: #6b7280; font-size: 13px; margin: 0 0 8px;">📅 截止时间：{due_label}</p>
          <p style="color: #6b7280; font-size: 13px; margin: 0;">{priority_label}</p>
        </div>
        <p style="color: #6b7280; font-size: 13px; margin: 0;">请及时处理，或打开 TaskTick 应用查看详情。</p>
      </div>
    </div>
    """
    return await send_email(to_email, subject, html)
