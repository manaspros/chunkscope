"""
Alembic Migration Environment Configuration (Synchronous)
"""
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# Import your models' Base for autogenerate support
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.models.base import Base
from app.config import settings

# Alembic Config object
config = context.config

# Override sqlalchemy.url from our central settings (fixing the leak)
_sync_url = settings.database_url.replace("postgresql://", "postgresql+psycopg2://", 1).replace("+asyncpg", "+psycopg2")
config.set_main_option("sqlalchemy.url", _sync_url.replace("%", "%%"))

# Setup logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Model's MetaData for 'autogenerate' support
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, 
            target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
