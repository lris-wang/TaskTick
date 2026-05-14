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
    is_vip: bool = False


class UserResponse(BaseModel):
    id: UUID
    email: str | None
    username: str
    avatar_url: str = ""
    is_vip: bool = False

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


class PhoneLogin(BaseModel):
    phone: str
    password: str


class PhoneRegisterRequest(BaseModel):
    phone: str
    code: str
    password: str
    username: str = ""


class SendPhoneVerifyCodeRequest(BaseModel):
    phone: str


class SetVipRequest(BaseModel):
    user_id: str
    is_vip: bool
