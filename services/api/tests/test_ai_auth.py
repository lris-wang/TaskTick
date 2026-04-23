from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def test_ai_invalid_authorization_scheme(client: TestClient) -> None:
    res = client.get("/api/v1/ai/schedules", headers={"Authorization": "Basic xxx"})
    assert res.status_code == 401


def test_ai_invalid_token(client: TestClient) -> None:
    res = client.get(
        "/api/v1/ai/schedules",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert res.status_code == 401


def test_ai_schedule_not_found(client: TestClient, ai_token: str) -> None:
    headers = {"Authorization": f"Bearer {ai_token}"}
    rid = str(uuid.uuid4())
    res = client.get(f"/api/v1/ai/schedules/{rid}", headers=headers)
    assert res.status_code == 404
