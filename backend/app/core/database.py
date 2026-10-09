"""
Database Connection and Session Management
Async SQLAlchemy setup for PostgreSQL
"""
import ssl
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy import text

from app.config import settings


def get_async_database_url() -> str:
    """Convert standard postgres URL to async format and clean SSL params."""
    url = settings.database_url
    
    # Convert to asyncpg format
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("sqlite://") and "aiosqlite" not in url:
        url = url.replace("sqlite://", "sqlite+aiosqlite://", 1)
    
    # Drop libpq-only query params (sslmode, channel_binding, ...): asyncpg rejects
    # them. SSL for Neon is handled via connect_args below.
    url = url.split("?")[0]
    
    return url


# SSL context for Neon (cloud PostgreSQL requires SSL)
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# Engine configuration
engine_kwargs = {
    "echo": settings.debug,
    "future": True,
}

# Only add pooling parameters for non-sqlite databases
if not settings.database_url.startswith("sqlite"):
    engine_kwargs["pool_size"] = settings.db_pool_size
    engine_kwargs["max_overflow"] = settings.db_max_overflow

# Add SSL context for Neon/PostgreSQL if needed
if "neon.tech" in settings.database_url:
    # statement_cache_size=0: Neon's pooled endpoint is PgBouncer (transaction mode)
    engine_kwargs["connect_args"] = {"ssl": ssl_context, "statement_cache_size": 0}
    engine_kwargs["pool_pre_ping"] = True

# Create async engine
engine = create_async_engine(
    get_async_database_url(),
    **engine_kwargs
)

# Session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency that provides a database session.
    Automatically handles commit/rollback and cleanup.
    """
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


from app.models import Base

async def init_db() -> None:
    """Initialize database connection (call on startup)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Close database connections (call on shutdown)."""
    await engine.dispose()
