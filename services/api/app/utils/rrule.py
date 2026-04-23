"""RRULE parsing and occurrence generation utilities (RFC 5545)."""

from datetime import datetime
from typing import Sequence

from rrule import RRuleStr


def is_recurring(repeat_rule: str | None, legacy_daily: bool) -> bool:
    """Return True if the task should be treated as recurring.

    Backward compat: treat null repeatRule + legacy_daily=True as daily recurring.
    """
    if repeat_rule:
        return True
    return legacy_daily


def generate_occurrences(
    repeat_rule: str | None,
    legacy_daily: bool,
    dtstart: datetime,
    before: datetime,
    limit: int = 1000,
) -> Sequence[datetime]:
    """Generate occurrences of a recurring task within [dtstart, before].

    Args:
        repeat_rule: RFC 5545 RRULE string (e.g. "FREQ=DAILY;COUNT=10")
        legacy_daily: True if legacy repeatDaily flag is set (backward compat)
        dtstart: start of the search window
        before: end of the search window (inclusive)
        limit: max occurrences to return

    Returns:
        Sorted list of occurrence datetimes in the window.
    """
    if not is_recurring(repeat_rule, legacy_daily):
        return []

    rule_str = repeat_rule
    if not rule_str and legacy_daily:
        rule_str = "FREQ=DAILY"

    if not rule_str:
        return []

    try:
        rule = RRuleStr(rule_str, dtstart=dtstart)
        occs = rule.between(dtstart, before, inc=True)
        return occs[:limit]
    except Exception:
        return []


def rrule_to_string(
    freq: str,
    interval: int = 1,
    count: int | None = None,
    until: datetime | None = None,
    byweekday: list[int] | None = None,
) -> str:
    """Build an RRULE string from components.

    Args:
        freq: FREQ value (DAILY, WEEKLY, MONTHLY, YEARLY)
        interval: every N periods (default 1)
        count: max occurrence count (mutually exclusive with until)
        until: end date (mutually exclusive with count)
        byweekday: list of weekday integers 0=Mon..6=Sun (for WEEKLY)

    Returns:
        RFC 5545 RRULE string.
    """
    parts = [f"FREQ={freq}"]
    if interval > 1:
        parts.append(f"INTERVAL={interval}")
    if count is not None and count > 0:
        parts.append(f"COUNT={count}")
    elif until is not None:
        until_str = until.strftime("%Y%m%dT%H%M%S")
        parts.append(f"UNTIL={until_str}")
    if byweekday and freq == "WEEKLY" and byweekday:
        day_codes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
        days = ",".join(day_codes[d] for d in byweekday)
        parts.append(f"BYDAY={days}")
    return ";".join(parts)
