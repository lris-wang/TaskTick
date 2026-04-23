"""Add is_markdown to notes

Revision ID: 006_add_is_markdown
Revises: 005_add_location_reminders
Create Date: 2026-04-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "006_add_is_markdown"
down_revision: Union[str, Sequence[str], None] = "005_add_location_reminders"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("notes", sa.Column("is_markdown", sa.Boolean(), nullable=True, server_default="0"))


def downgrade() -> None:
    op.drop_column("notes", "is_markdown")
