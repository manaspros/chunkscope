"""
FastAPI Dependencies (Dependency Injection)
Provides reusable dependencies for routes
"""
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db


# Type aliases for dependency injection
DbSession = Annotated[AsyncSession, Depends(get_db)]
