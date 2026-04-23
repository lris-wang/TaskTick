"""Add reminder_settings to tasks

Revision ID: 010
Revises: 009
Create Date: 2026-04-22
"""

from typing import Sequence, Union

import alembic.op as op
import sqlalchemy as sa

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("reminder_settings", sa.JSON(), nullable=True, server_default='null'),
    )


def downgrade() -> None:
    op.drop_column("tasks", "reminder_settings")
