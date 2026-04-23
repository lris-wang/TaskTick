from __future__ import annotations

from fastapi.testclient import TestClient


def test_ai_create_validation_error(client: TestClient, ai_token: str) -> None:
    headers = {"Authorization": f"Bearer {ai_token}"}
    res = client.post(
        "/api/v1/ai/schedules",
        json={"title": "缺开始时间"},
        headers=headers,
    )
    assert res.status_code == 422
