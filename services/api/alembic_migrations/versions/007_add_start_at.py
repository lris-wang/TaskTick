"""Add start_at to tasks

Revision ID: 007_add_start_at
Revises: 006_add_is_markdown
Create Date: 2026-04-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "007_add_start_at"
down_revision: Union[str, Sequence[str], None] = "006_add_is_markdown"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("start_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "start_at")
