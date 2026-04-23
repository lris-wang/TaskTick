from pydantic import BaseModel, Field


class FileUploadResponse(BaseModel):
    object_key: str
    size: int
    content_type: str | None = None


class PresignedUrlResponse(BaseModel):
    url: str
    expires_in: int = Field(..., description="预签名 URL 有效秒数")
