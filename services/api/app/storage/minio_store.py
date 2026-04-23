from __future__ import annotations

import re
from datetime import timedelta
from io import BytesIO
from pathlib import PurePosixPath
from uuid import UUID

import urllib3
from minio import Minio
from minio.error import S3Error

from app.config import Settings

_SAFE_FILENAME = re.compile(r"[^a-zA-Z0-9._-]+")


def minio_configured(settings: Settings) -> bool:
    return bool(settings.minio_endpoint and settings.minio_access_key and settings.minio_secret_key)


def sanitize_filename(name: str) -> str:
    base = PurePosixPath(name).name
    cleaned = _SAFE_FILENAME.sub("_", base).strip("._")
    return (cleaned[:180] if cleaned else "file")


def user_object_prefix(user_id: UUID) -> str:
    return f"{user_id}/"


class MinioStore:
    """MinIO（S3 兼容）对象封装，按 `user_id/` 前缀隔离对象键。"""

    def __init__(self, client: Minio, bucket: str, presign_expiry_seconds: int) -> None:
        self._client = client
        self._bucket = bucket
        self._presign_expiry_seconds = presign_expiry_seconds

    @classmethod
    def from_settings(cls, settings: Settings) -> MinioStore:
        if not minio_configured(settings):
            msg = "MinIO 未完整配置（需要 endpoint / access_key / secret_key）"
            raise ValueError(msg)
        http_client = urllib3.PoolManager(timeout=urllib3.Timeout(connect=3.0, read=10.0))
        client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
            region=settings.minio_region or "",
            http_client=http_client,
        )
        return cls(
            client,
            settings.minio_bucket,
            settings.minio_presign_expiry_seconds,
        )

    def ensure_bucket(self) -> None:
        if not self._client.bucket_exists(self._bucket):
            self._client.make_bucket(self._bucket)

    def put_bytes(self, object_name: str, data: bytes, content_type: str | None) -> int:
        length = len(data)
        self._client.put_object(
            self._bucket,
            object_name,
            BytesIO(data),
            length,
            content_type=content_type or "application/octet-stream",
        )
        return length

    def remove_object(self, object_name: str) -> None:
        self._client.remove_object(self._bucket, object_name)

    def presigned_get_url(self, object_name: str) -> tuple[str, int]:
        seconds = self._presign_expiry_seconds
        url = self._client.presigned_get_object(
            self._bucket,
            object_name,
            expires=timedelta(seconds=seconds),
        )
        return url, seconds


def ensure_bucket_for_app(settings: Settings) -> None:
    """应用启动时确保桶存在；未配置 MinIO 或连接超时则跳过。"""
    import socket
    if not minio_configured(settings):
        return
    # Quick connectivity check before attempting bucket operation
    try:
        host, port_str = settings.minio_endpoint.split(":")
        port = int(port_str)
        sock = socket.socket()
        sock.settimeout(3)
        sock.connect((host, port))
        sock.close()
    except Exception:
        # MinIO not reachable — skip bucket creation, will be handled on first upload
        return
    store = MinioStore.from_settings(settings)
    try:
        store.ensure_bucket()
    except S3Error:
        # 并发启动或权限问题时由首次上传再暴露错误
        pass
