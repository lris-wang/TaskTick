from uuid import UUID

from pydantic import BaseModel, EmailStr


class UserRegister(BaseModel):
    email: EmailStr
    password: str  # min 4 chars
    username: str = ""


class SendVerifyCodeRequest(BaseModel):
    email: EmailStr


class RegisterWithCodeRequest(BaseModel):
    email: EmailStr
    code: str
    password: str
    username: str = ""
    avatar_url: str = ""


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    id: str
    email: str
    username: str
    avatar_url: str = ""


class UserResponse(BaseModel):
    id: UUID
    email: str
    username: str
    avatar_url: str = ""

    model_config = {"from_attributes": True}


class ChangeUsernameRequest(BaseModel):
    username: str


class ChangeAvatarRequest(BaseModel):
    avatar_url: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class SendResetCodeRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str
