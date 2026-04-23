"""Add location_reminders table

Revision ID: 005_add_location_reminders
Revises: 004_add_depends_on
Create Date: 2026-04-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "005_add_location_reminders"
down_revision: Union[str, Sequence[str], None] = "004_add_depends_on"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "location_reminders",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("task_id", sa.UUID(), nullable=False),
        sa.Column("location_name", sa.String(length=200), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("radius", sa.Integer(), nullable=True),
        sa.Column("reminder_type", sa.String(length=20), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_location_reminders_user_id"), "location_reminders", ["user_id"], unique=False)
    op.create_index(op.f("ix_location_reminders_task_id"), "location_reminders", ["task_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_location_reminders_task_id"), table_name="location_reminders")
    op.drop_index(op.f("ix_location_reminders_user_id"), table_name="location_reminders")
    op.drop_table("location_reminders")
