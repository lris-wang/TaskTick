from __future__ import annotations

from typing import Annotated
from uuid import UUID, uuid4

import anyio
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.api.deps import get_ai_user_id
from app.config import get_settings
from app.schemas.file import FileUploadResponse, PresignedUrlResponse
from app.storage.minio_store import (
    MinioStore,
    minio_configured,
    sanitize_filename,
    user_object_prefix,
)

router = APIRouter(prefix="/files", tags=["AI — 文件"])


def _require_store() -> MinioStore:
    settings = get_settings()
    if not minio_configured(settings):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="对象存储未配置，请设置 MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY",
        )
    return MinioStore.from_settings(settings)


def get_minio_store() -> MinioStore:
    """供依赖注入与测试 `dependency_overrides` 替换。"""
    return _require_store()


def _assert_owner(user_id: UUID, object_key: str) -> None:
    prefix = user_object_prefix(user_id)
    if ".." in object_key or not object_key.startswith(prefix):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="对象不存在")


@router.post("/upload", response_model=FileUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    user_id: Annotated[UUID, Depends(get_ai_user_id)],
    file: UploadFile = File(...),
    store: MinioStore = Depends(get_minio_store),
) -> FileUploadResponse:
    settings = get_settings()
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="空文件")
    max_bytes = settings.minio_max_upload_bytes
    if len(raw) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"文件超过限制（最大 {max_bytes} 字节）",
        )
    name = file.filename or "upload.bin"
    object_key = f"{user_object_prefix(user_id)}{uuid4().hex}_{sanitize_filename(name)}"

    def _put() -> int:
        return store.put_bytes(object_key, raw, file.content_type)

    size = await anyio.to_thread.run_sync(_put)
    return FileUploadResponse(object_key=object_key, size=size, content_type=file.content_type)


@router.get("/presign", response_model=PresignedUrlResponse)
async def presign_download(
    user_id: Annotated[UUID, Depends(get_ai_user_id)],
    object_key: str = Query(..., min_length=3, max_length=1024),
    store: MinioStore = Depends(get_minio_store),
) -> PresignedUrlResponse:
    _assert_owner(user_id, object_key)

    def _url() -> tuple[str, int]:
        return store.presigned_get_url(object_key)

    url, expires_in = await anyio.to_thread.run_sync(_url)
    return PresignedUrlResponse(url=url, expires_in=expires_in)


@router.delete("/{object_key:path}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    object_key: str,
    user_id: Annotated[UUID, Depends(get_ai_user_id)],
    store: MinioStore = Depends(get_minio_store),
) -> None:
    _assert_owner(user_id, object_key)

    def _rm() -> None:
        store.remove_object(object_key)

    await anyio.to_thread.run_sync(_rm)
