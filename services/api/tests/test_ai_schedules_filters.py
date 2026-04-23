from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient


def test_ai_list_filter_from_to(client: TestClient, ai_token: str) -> None:
    headers = {"Authorization": f"Bearer {ai_token}"}
    t0 = datetime(2026, 6, 1, 10, 0, tzinfo=UTC)
    t1 = datetime(2026, 6, 15, 10, 0, tzinfo=UTC)
    t2 = datetime(2026, 7, 1, 10, 0, tzinfo=UTC)

    for title, start in (
        ("六月上旬", t0),
        ("六月中旬", t1),
        ("七月", t2),
    ):
        r = client.post(
            "/api/v1/ai/schedules",
            json={"title": title, "start_at": start.isoformat(), "timezone": "UTC"},
            headers=headers,
        )
        assert r.status_code == 201, r.text

    frm = (t0 - timedelta(days=1)).isoformat()
    to = (t1 + timedelta(days=1)).isoformat()
    res = client.get(
        "/api/v1/ai/schedules",
        params={"from": frm, "to": to},
        headers=headers,
    )
    assert res.status_code == 200
    titles = {x["title"] for x in res.json()}
    assert titles == {"六月上旬", "六月中旬"}
