"""
Add analysis_result and content_profile to projects

Revision ID: a1b2c3d4e5f6
Revises: b3d9f1e7a2b0
Create Date: 2026-04-04 00:01:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "b3d9f1e7a2b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("analysis_result", sa.JSON(), nullable=True))
    op.add_column("projects", sa.Column("content_profile", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "content_profile")
    op.drop_column("projects", "analysis_result")
