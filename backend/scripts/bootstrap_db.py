"""
Bootstrap a fresh Postgres (e.g. Neon) for ChunkScope.

Why not just `alembic upgrade head`? The migration chain has drifted from the ORM
models (user_id columns, enum columns, ...), and the app itself builds its schema with
`Base.metadata.create_all` at startup. This script does what the app does, plus the
pieces create_all cannot express (pgvector extension, tsvector trigger + GIN index),
then stamps Alembic at head so future migrations apply on top.

Usage:  DATABASE_URL=postgresql://... python scripts/bootstrap_db.py [--reset]
"""
import asyncio
import subprocess
import sys
from pathlib import Path

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import engine  # noqa: E402
from app.models import Base  # noqa: E402


async def main(reset: bool) -> None:
    async with engine.begin() as conn:
        if reset:
            await conn.execute(text("DROP SCHEMA public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_chunks_tsv ON chunks USING gin (tsv)"))
        await conn.execute(text("DROP TRIGGER IF EXISTS tsvectorupdate ON chunks"))
        await conn.execute(text(
            "CREATE TRIGGER tsvectorupdate BEFORE INSERT OR UPDATE ON chunks FOR EACH ROW "
            "EXECUTE FUNCTION tsvector_update_trigger(tsv, 'pg_catalog.english', text)"
        ))
    await engine.dispose()
    subprocess.run([sys.executable, "-m", "alembic", "stamp", "head"], check=True, cwd=Path(__file__).resolve().parent.parent)
    print("database ready")


if __name__ == "__main__":
    asyncio.run(main("--reset" in sys.argv))
