from __future__ import annotations

from fastapi.testclient import TestClient


def test_docs_available(client: TestClient) -> None:
    res = client.get("/docs")
    assert res.status_code == 200
    assert "swagger" in res.text.lower() or "openapi" in res.text.lower()


def test_openapi_json_contains_routes(client: TestClient) -> None:
    res = client.get("/openapi.json")
    assert res.status_code == 200
    data = res.json()
    paths = data.get("paths", {})
    assert "/health" in paths
    assert "/api/v1/ai/schedules" in paths
    assert "/api/v1/ai/files/upload" in paths
    assert "/api/v1/ai/files/presign" in paths
