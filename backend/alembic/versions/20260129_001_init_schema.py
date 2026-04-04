"""
Initial ChunkScope schema with pgvector support

Revision ID: 001_init_schema
Revises: 
Create Date: 2026-01-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision: str = '001_init_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    dialect = op.get_bind().dialect.name

    # PostgreSQL-only extensions and types
    if dialect == "postgresql":
        op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
        op.execute('CREATE EXTENSION IF NOT EXISTS "vector"')

        document_type = postgresql.ENUM(
            'pdf', 'txt', 'md', 'docx', 'html', 'code',
            name='document_type'
        )
        document_type.create(op.get_bind())

        pipeline_status = postgresql.ENUM(
            'draft', 'running', 'completed', 'failed',
            name='pipeline_status'
        )
        pipeline_status.create(op.get_bind())
    
    evaluation_status = postgresql.ENUM(
        'pending', 'running', 'completed', 'failed',
        name='evaluation_status'
    )
    evaluation_status.create(op.get_bind())
    
    chunking_method = postgresql.ENUM(
        'fixed_size', 'recursive', 'semantic', 'sentence',
        'paragraph', 'markdown', 'code', 'table', 'heading', 'agentic',
        name='chunking_method'
    )
    chunking_method.create(op.get_bind())
    
    # ========== USERS TABLE ==========
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), 
                  server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('email', sa.String(255), unique=True, nullable=False),
        sa.Column('name', sa.String(255)),
        sa.Column('password_hash', sa.String(255)),
        sa.Column('settings', postgresql.JSONB, server_default='{}'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('idx_users_email', 'users', ['email'])
    
    # ========== PIPELINES TABLE ==========
    op.create_table(
        'pipelines',
        sa.Column('id', postgresql.UUID(as_uuid=True), 
                  server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text),
        sa.Column('status', postgresql.ENUM('draft', 'running', 'completed', 'failed', 
                                            name='pipeline_status', create_type=False),
                  server_default='draft'),
        sa.Column('nodes', postgresql.JSONB, server_default='[]'),
        sa.Column('edges', postgresql.JSONB, server_default='[]'),
        sa.Column('settings', postgresql.JSONB, server_default='{}'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('idx_pipelines_user_id', 'pipelines', ['user_id'])
    op.create_index('idx_pipelines_nodes', 'pipelines', ['nodes'], postgresql_using='gin')
    
    # ========== PIPELINE VERSIONS TABLE ==========
    op.create_table(
        'pipeline_versions',
        sa.Column('id', postgresql.UUID(as_uuid=True), 
                  server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('pipeline_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('pipelines.id', ondelete='CASCADE'), nullable=False),
        sa.Column('version_number', sa.Integer, nullable=False),
        sa.Column('config', postgresql.JSONB, nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('NOW()')),
        sa.UniqueConstraint('pipeline_id', 'version_number', name='uq_pipeline_version'),
    )
    op.create_index('idx_pipeline_versions_pipeline_id', 'pipeline_versions', ['pipeline_id'])
    
    # ========== DOCUMENTS TABLE ==========
    op.create_table(
        'documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), 
                  server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('original_filename', sa.String(255), nullable=False),
        sa.Column('file_path', sa.String(512), nullable=False),
        sa.Column('file_type', postgresql.ENUM('pdf', 'txt', 'md', 'docx', 'html', 'code',
                                               name='document_type', create_type=False),
                  nullable=False),
        sa.Column('file_size_bytes', sa.BigInteger),
        sa.Column('metadata', postgresql.JSONB, server_default='{}'),
        sa.Column('extracted_text', sa.Text),
        sa.Column('is_processed', sa.Boolean, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('idx_documents_user_id', 'documents', ['user_id'])
    op.create_index('idx_documents_file_type', 'documents', ['file_type'])
    
    # ========== CHUNKS TABLE ==========
    op.create_table(
        'chunks',
        sa.Column('id', postgresql.UUID(as_uuid=True), 
                  server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('pipeline_version_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('pipeline_versions.id', ondelete='SET NULL')),
        sa.Column('text', sa.Text, nullable=False),
        sa.Column('chunk_index', sa.Integer, nullable=False),
        sa.Column('embedding', Vector(1536)),  # pgvector column
        sa.Column('chunking_method', postgresql.ENUM(
            'fixed_size', 'recursive', 'semantic', 'sentence',
            'paragraph', 'markdown', 'code', 'table', 'heading', 'agentic',
            name='chunking_method', create_type=False)),
        sa.Column('chunk_size', sa.Integer),
        sa.Column('chunk_overlap', sa.Integer),
        sa.Column('metadata', postgresql.JSONB, server_default='{}'),
        sa.Column('token_count', sa.Integer),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('idx_chunks_document_id', 'chunks', ['document_id'])
    op.create_index('idx_chunks_document_idx', 'chunks', ['document_id', 'chunk_index'])
    op.create_index('idx_chunks_metadata', 'chunks', ['metadata'], postgresql_using='gin')
    
    # HNSW index for vector similarity search
    op.execute('''
        CREATE INDEX idx_chunks_embedding ON chunks 
        USING hnsw (embedding vector_cosine_ops) 
        WITH (m = 16, ef_construction = 64)
    ''')
    
    # ========== TEST DATASETS TABLE ==========
    op.create_table(
        'test_datasets',
        sa.Column('id', postgresql.UUID(as_uuid=True), 
                  server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text),
        sa.Column('questions', postgresql.JSONB, server_default='[]'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('idx_test_datasets_user_id', 'test_datasets', ['user_id'])
    
    # ========== EVALUATIONS TABLE ==========
    op.create_table(
        'evaluations',
        sa.Column('id', postgresql.UUID(as_uuid=True), 
                  server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(255)),
        sa.Column('pipeline_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('pipelines.id', ondelete='CASCADE'), nullable=False),
        sa.Column('pipeline_version_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('pipeline_versions.id')),
        sa.Column('test_dataset_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('test_datasets.id', ondelete='SET NULL')),
        sa.Column('comparison_pipeline_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('pipelines.id', ondelete='SET NULL')),
        sa.Column('status', postgresql.ENUM('pending', 'running', 'completed', 'failed',
                                            name='evaluation_status', create_type=False),
                  server_default='pending'),
        sa.Column('aggregate_scores', postgresql.JSONB, server_default='{}'),
        sa.Column('total_queries', sa.Integer, server_default='0'),
        sa.Column('completed_queries', sa.Integer, server_default='0'),
        sa.Column('total_latency_ms', sa.BigInteger, server_default='0'),
        sa.Column('total_cost_usd', sa.Numeric(10, 6), server_default='0'),
        sa.Column('started_at', sa.TIMESTAMP(timezone=True)),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True)),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('idx_evaluations_user_id', 'evaluations', ['user_id'])
    op.create_index('idx_evaluations_pipeline_id', 'evaluations', ['pipeline_id'])
    op.create_index('idx_evaluations_status', 'evaluations', ['status'])
    op.create_index('idx_evaluations_pipeline_created', 'evaluations', 
                    ['pipeline_id', sa.text('created_at DESC')])
    
    # ========== EVALUATION RESULTS TABLE ==========
    op.create_table(
        'evaluation_results',
        sa.Column('id', postgresql.UUID(as_uuid=True), 
                  server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('evaluation_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('evaluations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('query', sa.Text, nullable=False),
        sa.Column('expected_answer', sa.Text),
        sa.Column('retrieved_chunk_ids', postgresql.ARRAY(postgresql.UUID(as_uuid=True)), 
                  server_default='{}'),
        sa.Column('generated_answer', sa.Text),
        sa.Column('scores', postgresql.JSONB, server_default='{}'),
        sa.Column('latency_ms', sa.Integer),
        sa.Column('cost_usd', sa.Numeric(10, 6)),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('idx_evaluation_results_evaluation_id', 'evaluation_results', ['evaluation_id'])
    
    # ========== EXECUTION LOGS TABLE ==========
    op.create_table(
        'execution_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), 
                  server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('pipeline_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('pipelines.id', ondelete='CASCADE'), nullable=False),
        sa.Column('pipeline_version_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('pipeline_versions.id')),
        sa.Column('node_id', sa.String(255)),
        sa.Column('node_type', sa.String(50)),
        sa.Column('level', sa.String(20), nullable=False),
        sa.Column('message', sa.Text, nullable=False),
        sa.Column('details', postgresql.JSONB, server_default='{}'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('idx_execution_logs_pipeline_id', 'execution_logs', ['pipeline_id'])
    op.create_index('idx_execution_logs_created_at', 'execution_logs', 
                    [sa.text('created_at DESC')])
    
    # ========== UPDATED_AT TRIGGERS ==========
    # Create trigger function
    op.execute('''
        CREATE OR REPLACE FUNCTION update_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    ''')
    
    # Apply triggers to tables with updated_at
    for table in ['users', 'pipelines', 'documents', 'test_datasets']:
        op.execute(f'''
            CREATE TRIGGER {table}_updated_at
            BEFORE UPDATE ON {table}
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        ''')


def downgrade() -> None:
    # Drop tables in reverse order (respecting foreign keys)
    op.drop_table('execution_logs')
    op.drop_table('evaluation_results')
    op.drop_table('evaluations')
    op.drop_table('test_datasets')
    op.drop_table('chunks')
    op.drop_table('documents')
    op.drop_table('pipeline_versions')
    op.drop_table('pipelines')
    op.drop_table('users')
    
    # Drop trigger function
    op.execute('DROP FUNCTION IF EXISTS update_updated_at CASCADE')
    
    # Drop ENUM types
    op.execute('DROP TYPE IF EXISTS chunking_method')
    op.execute('DROP TYPE IF EXISTS evaluation_status')
    op.execute('DROP TYPE IF EXISTS pipeline_status')
    op.execute('DROP TYPE IF EXISTS document_type')
