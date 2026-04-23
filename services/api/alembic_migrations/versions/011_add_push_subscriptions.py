"""Add push_subscriptions table

Revision ID: 011
Revises: 010
Create Date: 2026-04-22
"""

from typing import Sequence, Union

import alembic.op as op
import sqlalchemy as sa

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("endpoint", sa.String(length=1024), nullable=False),
        sa.Column("p256dh", sa.String(length=256), nullable=False),
        sa.Column("auth", sa.String(length=128), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(
        op.f("ix_push_subscriptions_user_id"),
        "push_subscriptions",
        ["user_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_push_subscriptions_user_id"),
        table_name="push_subscriptions",
    )
    op.drop_table("push_subscriptions")
