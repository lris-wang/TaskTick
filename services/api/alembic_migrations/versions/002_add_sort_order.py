"""Add sort_order to tasks

Revision ID: 002_add_sort_order
Revises: 001_initial
Create Date: 2026-04-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "002_add_sort_order"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("sort_order", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "sort_order")
