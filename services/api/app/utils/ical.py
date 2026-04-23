"""
iCalendar (.ics) export utility.
Generates RFC 5545 compliant iCalendar format from tasks and schedules.
"""

from datetime import datetime, timezone
from typing import Any
import urllib.parse


def _escape_ical_text(text: str | None) -> str:
    """Escape special characters per RFC 5545."""
    if not text:
        return ""
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
        .replace("\r", "")
    )


def _format_dt(dt: datetime) -> str:
    """Format datetime as iCalendar DTSTART/DTEND (UTC)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.strftime("%Y%m%dT%H%M%SZ")


def _uid(entity_type: str, entity_id: str, domain: str = "tasktick") -> str:
    return f"{entity_type}-{entity_id}@{domain}"


def generate_ical_header(prod_id: str = "-//TaskTick//TaskTick//EN") -> str:
    return "\r\n".join([
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{prod_id}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:TaskTick",
    ]) + "\r\n"


def generate_ical_footer() -> str:
    return "END:VCALENDAR\r\n"


def task_to_vevent(task: dict[str, Any]) -> str:
    """
    Convert a task dict (from API response) to a VTODO or VEVENT.
    Tasks with due_at → VEVENT (due date as DTSTART)
    """
    task_id = task.get("id", "")
    title = _escape_ical_text(task.get("title"))
    description = _escape_ical_text(task.get("description"))
    due_at_str = task.get("due_at")
    start_at_str = task.get("start_at")
    completed = task.get("completed", False)
    priority_map = {3: "1", 2: "5", 1: "9", 0: "0"}
    priority = priority_map.get(task.get("priority", 0), "0")

    lines = [
        "BEGIN:VEVENT",
        f"UID:{_uid('task', task_id)}",
        f"DTSTAMP:{_format_dt(datetime.now(timezone.utc))}",
        f"SUMMARY:{title}",
    ]

    if description:
        lines.append(f"DESCRIPTION:{description}")

    if start_at_str:
        start = datetime.fromisoformat(start_at_str.replace("Z", "+00:00"))
        lines.append(f"DTSTART:{_format_dt(start)}")

    if due_at_str:
        due = datetime.fromisoformat(due_at_str.replace("Z", "+00:00"))
        lines.append(f"DUE:{_format_dt(due)}")

    lines.append(f"PRIORITY:{priority}")

    if completed:
        lines.append("STATUS:COMPLETED")
        lines.append(f"COMPLETED:{_format_dt(datetime.now(timezone.utc))}")
    else:
        lines.append("STATUS:NEEDS-ACTION")

    # Categories
    project_ids = task.get("project_ids") or []
    if project_ids:
        lines.append(f"CATEGORIES:{_escape_ical_text(','.join(str(p) for p in project_ids))}")

    lines.append("END:VEVENT")
    return "\r\n".join(lines) + "\r\n"


def schedule_to_vevent(schedule: dict[str, Any]) -> str:
    """Convert a schedule dict to a VEVENT."""
    schedule_id = schedule.get("id", "")
    title = _escape_ical_text(schedule.get("title"))
    description = _escape_ical_text(schedule.get("description"))
    location = _escape_ical_text(schedule.get("location"))
    start_at_str = schedule.get("start_at")
    end_at_str = schedule.get("end_at")

    lines = [
        "BEGIN:VEVENT",
        f"UID:{_uid('schedule', schedule_id)}",
        f"DTSTAMP:{_format_dt(datetime.now(timezone.utc))}",
        f"SUMMARY:{title}",
    ]

    if start_at_str:
        start = datetime.fromisoformat(start_at_str.replace("Z", "+00:00"))
        lines.append(f"DTSTART:{_format_dt(start)}")

    if end_at_str:
        end = datetime.fromisoformat(end_at_str.replace("Z", "+00:00"))
        lines.append(f"DTEND:{_format_dt(end)}")
    elif start_at_str:
        # Default 1 hour duration
        start = datetime.fromisoformat(start_at_str.replace("Z", "+00:00"))
        end = start.replace(hour=start.hour + 1)
        lines.append(f"DTEND:{_format_dt(end)}")

    if description:
        lines.append(f"DESCRIPTION:{description}")

    if location:
        lines.append(f"LOCATION:{location}")

    lines.append("STATUS:CONFIRMED")
    lines.append("END:VEVENT")
    return "\r\n".join(lines) + "\r\n"
