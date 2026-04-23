"""Add depends_on to tasks

Revision ID: 004_add_depends_on
Revises: 003_add_smart_lists
Create Date: 2026-04-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "004_add_depends_on"
down_revision: Union[str, Sequence[str], None] = "003_add_smart_lists"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("depends_on", sa.JSON(), nullable=True, server_default="[]"))


def downgrade() -> None:
    op.drop_column("tasks", "depends_on")
