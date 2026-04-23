"""Add assignee_id to tasks

Revision ID: 009
Revises: 008
Create Date: 2026-04-21
"""

from typing import Sequence, Union

import alembic.op as op
import sqlalchemy as sa

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("assignee_id", sa.UUID(), nullable=True, index=True))


def downgrade() -> None:
    op.drop_column("tasks", "assignee_id")
