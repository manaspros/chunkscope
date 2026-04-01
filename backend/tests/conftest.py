"""
Pytest Configuration and Fixtures
"""
import asyncio
from typing import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import JSON

from app.config import Settings
from app.core.database import get_db
from app.main import create_app
from app.models import Base


# Patch the JSONB type for SQLite compatibility
def _patch_types_for_sqlite():
    """Register PostgreSQL-specific types for SQLite dialect."""
    from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler

    # JSONB -> JSON
    if not hasattr(SQLiteTypeCompiler, 'visit_JSONB'):
        SQLiteTypeCompiler.visit_JSONB = lambda self, type_, **kw: self.visit_JSON(type_, **kw)

    # Vector -> TEXT (for pgvector)
    if not hasattr(SQLiteTypeCompiler, 'visit_VECTOR'):
        SQLiteTypeCompiler.visit_VECTOR = lambda self, type_, **kw: "TEXT"

    # ARRAY -> TEXT (PostgreSQL arrays)
    if not hasattr(SQLiteTypeCompiler, 'visit_ARRAY'):
        SQLiteTypeCompiler.visit_ARRAY = lambda self, type_, **kw: self.visit_JSON(type_, **kw)

    # TSVECTOR -> TEXT (Full-text search)
    if not hasattr(SQLiteTypeCompiler, 'visit_TSVECTOR'):
        SQLiteTypeCompiler.visit_TSVECTOR = lambda self, type_, **kw: "TEXT"

_patch_types_for_sqlite()


# Test database URL (in-memory SQLite for speed)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# Create test app
app = create_app()



@pytest_asyncio.fixture
async def test_db() -> AsyncGenerator[AsyncSession, None]:
    """Create a fresh test database for each test."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_maker() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def client(test_db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create async test client with overridden dependencies."""

    async def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
def test_settings() -> Settings:
    """Test settings with safe defaults."""
    return Settings(
        environment="test",
        debug=True,
        database_url=TEST_DATABASE_URL,
    )
