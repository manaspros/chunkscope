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
    # Earlier migrations never created `projects` (it was only made by
    # create_all at app startup), so a fresh database needs it created here.
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "projects" not in insp.get_table_names():
        op.create_table(
            "projects",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("total_files", sa.Integer(), nullable=True),
            sa.Column("total_chunks", sa.Integer(), nullable=True),
            sa.Column("dominant_doc_type", sa.String(50), nullable=True),
            sa.Column("corpus_config", sa.JSON(), nullable=True),
            sa.Column("analysis_result", sa.JSON(), nullable=True),
            sa.Column("content_profile", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(20), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    else:
        cols = {c["name"] for c in insp.get_columns("projects")}
        if "analysis_result" not in cols:
            op.add_column("projects", sa.Column("analysis_result", sa.JSON(), nullable=True))
        if "content_profile" not in cols:
            op.add_column("projects", sa.Column("content_profile", sa.JSON(), nullable=True))
    doc_cols = {c["name"] for c in insp.get_columns("documents")}
    if "project_id" not in doc_cols:
        op.add_column("documents", sa.Column("project_id", sa.Uuid(), nullable=True))
        op.create_index("ix_documents_project_id", "documents", ["project_id"])
        op.create_foreign_key(
            "fk_documents_project_id", "documents", "projects", ["project_id"], ["id"], ondelete="CASCADE"
        )


def downgrade() -> None:
    op.drop_column("projects", "content_profile")
    op.drop_column("projects", "analysis_result")
