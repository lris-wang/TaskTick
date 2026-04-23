from __future__ import annotations

from fastapi.testclient import TestClient


def test_ai_schedules_unauthorized(client: TestClient) -> None:
    res = client.get("/api/v1/ai/schedules")
    assert res.status_code == 401


def test_ai_schedules_crud(client: TestClient, ai_token: str) -> None:
    headers = {"Authorization": f"Bearer {ai_token}"}
    body = {
        "title": "测试会议",
        "description": "pytest",
        "start_at": "2026-04-11T12:00:00+00:00",
        "timezone": "UTC",
    }
    res = client.post("/api/v1/ai/schedules", json=body, headers=headers)
    assert res.status_code == 201, res.text
    row = res.json()
    assert row["title"] == "测试会议"
    sid = row["id"]

    res = client.get(f"/api/v1/ai/schedules/{sid}", headers=headers)
    assert res.status_code == 200
    assert res.json()["id"] == sid

    res = client.patch(
        f"/api/v1/ai/schedules/{sid}",
        json={"title": "已更新"},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["title"] == "已更新"

    res = client.get("/api/v1/ai/schedules", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 1

    res = client.delete(f"/api/v1/ai/schedules/{sid}", headers=headers)
    assert res.status_code == 204

    res = client.get("/api/v1/ai/schedules", headers=headers)
    assert res.status_code == 200
    assert res.json() == []
