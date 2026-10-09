"""
ChunkScope FastAPI Application Factory
"""
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api import api_router
from app.config import settings
from app.core.guard import add_public_guard
from app.core import close_db, configure_logging, configure_middleware, init_db


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan events."""
    # Startup
    configure_logging()
    await init_db()
    
    # Seed builtin presets
    from app.core.database import async_session_maker
    from app.services.preset_service import preset_service
    async with async_session_maker() as db:
        await preset_service.load_builtin_presets(db)
        
    yield
    # Shutdown
    await close_db()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Visual RAG pipeline builder and evaluator",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    
    # Configure middleware (CORS, error handling, logging)
    configure_middleware(app)
    add_public_guard(app)
    
    # Mount static files
    app.mount("/static", StaticFiles(directory=str(Path(__file__).resolve().parent.parent / "static")), name="static")
    
    # Include API routers
    app.include_router(api_router)
    
    @app.get("/")
    async def root():
        return {
            "name": settings.app_name,
            "version": settings.app_version,
            "status": "online",
            "docs": "/api/docs"
        }
    
    # Debug: Print all registered routes
    print("\n=== REGISTERED ROUTES ===", flush=True)
    for route in app.routes:
        if hasattr(route, "path"):
            methods = getattr(route, "methods", set())
            print(f"  {route.path} - {methods}", flush=True)
    print("=========================\n", flush=True)

    return app


# Application instance
app = create_app()
