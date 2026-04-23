from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


class TeamMemberResponse(BaseModel):
    id: UUID
    team_id: UUID
    user_id: UUID
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class TeamMemberUpdate(BaseModel):
    role: str | None = None


class TeamMemberWithUser(TeamMemberResponse):
    user_email: str | None = None
    user_username: str | None = None
    user_avatar_url: str | None = None


class TeamInviteRequest(BaseModel):
    email: EmailStr
    role: str = "member"


class TeamInviteResponse(BaseModel):
    message: str
    invited_email: str


class TransferOwnershipRequest(BaseModel):
    target_user_id: UUID


class TransferOwnershipResponse(BaseModel):
    message: str
    new_owner_id: UUID
