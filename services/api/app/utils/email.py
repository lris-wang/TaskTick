"""Email utilities using Resend HTTP API."""

import logging

logger = logging.getLogger(__name__)

try:
    import httpx
    _HAS_HTTPX = True
except ImportError:
    _HAS_HTTPX = False
    httpx = None

DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 1.0


async def send_email(to, subject, html_body, *, max_retries=DEFAULT_MAX_RETRIES, retry_delay=DEFAULT_RETRY_DELAY) -> bool:
    if not _HAS_HTTPX:
        logger.warning("[email] httpx not installed, logging email content instead")
        logger.info("[email] To: %s | Subject: %s", to, subject)
        return False

    from_addr = "TaskTick <noreply@tasktick.asia>"
    api_key = "re_GBNiDoQV_CDTewe7WAr4U71G7Az1k8KSX"

    last_error = None
    delay = retry_delay

    for attempt in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"from": from_addr, "to": [to], "subject": subject, "html": html_body},
                    timeout=30.0
                )
                if response.status_code < 400:
                    logger.info("[email] Sent to %s (attempt %d): %s", to, attempt, subject)
                    return True
                logger.warning("[email] Failed to send to %s (attempt %d/%d): status=%d", to, attempt, max_retries, response.status_code)
        except Exception as exc:
            last_error = exc
            logger.warning("[email] Failed to send to %s (attempt %d/%d): %s", to, attempt, max_retries, exc)
            if attempt < max_retries:
                import asyncio
                await asyncio.sleep(delay)
                delay *= 2
            continue

    logger.error("[email] All %d retries exhausted for %s (%s)", max_retries, to, subject)
    return False


async def send_verification_code(to_email, code) -> bool:
    subject = "[TaskTick] Your verification code"
    html = f"""<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;"><div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; text-align: center; border-radius: 8px 8px 0 0;"><h2 style="color: #fff; margin: 0;">TaskTick Verification Code</h2></div><div style="background: #f9fafb; padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;"><p style="color: #374151; font-size: 15px; margin: 0 0 16px;">Your verification code is:</p><div style="background: #fff; border: 2px dashed #d1d5db; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;"><span style="font-size: 36px; font-weight: bold; letter-spacing: 12px; color: #4f46e5;">{code}</span></div><p style="color: #6b7280; font-size: 13px; margin: 0;">Code expires in <strong>10 minutes</strong>.</p></div></div>"""
    return await send_email(to_email, subject, html)


async def send_password_reset_code(to_email, code) -> bool:
    subject = "[TaskTick] Password Reset Code"
    html = f"""<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;"><div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 24px; text-align: center; border-radius: 8px 8px 0 0;"><h2 style="color: #fff; margin: 0;">TaskTick Password Reset</h2></div><div style="background: #f9fafb; padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;"><p style="color: #374151; font-size: 15px; margin: 0 0 16px;">Your password reset code is:</p><div style="background: #fff; border: 2px dashed #d1d5db; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;"><span style="font-size: 36px; font-weight: bold; letter-spacing: 12px; color: #f5576c;">{code}</span></div><p style="color: #6b7280; font-size: 13px; margin: 0;">Code expires in <strong>10 minutes</strong>.</p></div></div>"""
    return await send_email(to_email, subject, html)


async def send_task_reminder(to_email, task_title, due_at, priority) -> bool:
    subject = f"[TaskTick] Task Reminder: {task_title}"
    html = f"""<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;"><div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 24px; text-align: center; border-radius: 8px 8px 0 0;"><h2 style="color: #fff; margin: 0;">TaskTick Reminder</h2></div><div style="background: #f9fafb; padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;"><p style="color: #374151; font-size: 15px; margin: 0 0 16px;">A task is due:</p><div style="background: #fff; border: 2px dashed #d1d5db; border-radius: 8px; padding: 20px; margin-bottom: 24px;"><p style="font-size: 18px; font-weight: bold; color: #1f2937; margin: 0 0 12px;">{task_title}</p></div></div></div>"""
    return await send_email(to_email, subject, html)
