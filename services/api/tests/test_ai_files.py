from __future__ import annotations

import pytest
from app.api.routes import ai_files
from app.main import app
from fastapi.testclient import TestClient


class _FakeMinioStore:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def put_bytes(self, object_name: str, data: bytes, content_type: str | None) -> int:
        self.objects[object_name] = data
        return len(data)

    def remove_object(self, object_name: str) -> None:
        self.objects.pop(object_name, None)

    def presigned_get_url(self, object_name: str) -> tuple[str, int]:
        return f"https://fake.invalid/{object_name}", 3600


@pytest.fixture
def fake_minio_store() -> _FakeMinioStore:
    fake = _FakeMinioStore()
    app.dependency_overrides[ai_files.get_minio_store] = lambda: fake
    yield fake
    app.dependency_overrides.pop(ai_files.get_minio_store, None)


def test_file_upload_503_when_minio_not_configured(client: TestClient, ai_token: str) -> None:
    headers = {"Authorization": f"Bearer {ai_token}"}
    files = {"file": ("a.txt", b"hello", "text/plain")}
    res = client.post("/api/v1/ai/files/upload", headers=headers, files=files)
    assert res.status_code == 503


def test_file_upload_presign_delete_with_fake_store(
    client: TestClient,
    ai_token: str,
    fake_minio_store: _FakeMinioStore,
) -> None:
    headers = {"Authorization": f"Bearer {ai_token}"}
    files = {"file": ("note.txt", b"hello-minio", "text/plain")}
    res = client.post("/api/v1/ai/files/upload", headers=headers, files=files)
    assert res.status_code == 201, res.text
    data = res.json()
    key = data["object_key"]
    assert data["size"] == len(b"hello-minio")
    assert key in fake_minio_store.objects

    res = client.get(
        "/api/v1/ai/files/presign",
        params={"object_key": key},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["expires_in"] == 3600
    assert key in body["url"]

    res = client.delete(f"/api/v1/ai/files/{key}", headers=headers)
    assert res.status_code == 204
    assert key not in fake_minio_store.objects


def test_file_presign_other_user_prefix_404(
    client: TestClient,
    ai_token: str,
    fake_minio_store: _FakeMinioStore,
) -> None:
    headers = {"Authorization": f"Bearer {ai_token}"}
    bad_key = "00000000-0000-0000-0000-000000000001/not-mine.txt"
    res = client.get(
        "/api/v1/ai/files/presign",
        params={"object_key": bad_key},
        headers=headers,
    )
    assert res.status_code == 404
