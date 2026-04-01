"""
ChunkScope Configuration Settings
Uses pydantic-settings for environment variable parsing
"""
from functools import lru_cache
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # App
    app_name: str = "ChunkScope"
    app_version: str = "0.1.0"
    debug: bool = True
    environment: str = Field(default="development", description="development | staging | production")

    # Server
    host: str = "0.0.0.0"
    port: int = 8001

    # Database
    database_url: str = Field(
        default="sqlite:///./test.db",
        description="PostgreSQL connection string or SQLite for local dev"
    )
    db_pool_size: int = 5
    db_max_overflow: int = 10

    # Rate Limiting
    rate_limit_per_minute: int = 100

    # LiteLLM
    litellm_api_key: Optional[str] = Field(default=None, description="API key for LiteLLM proxy or provider")
    litellm_base_url: Optional[str] = Field(default=None, description="Base URL for LiteLLM proxy")

    # OpenAI (legacy, prefer LiteLLM)
    openai_api_key: Optional[str] = None

    # Cohere (legacy, prefer LiteLLM)
    cohere_api_key: Optional[str] = None

    # File Upload
    max_upload_size_mb: int = 100
    upload_dir: str = "./uploads"

    # CORS
    cors_origins: list[str] = [
        "http://localhost:8001",
        "http://127.0.0.1:8001",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://localhost:5173"
    ]

    @field_validator("database_url", mode="before")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if v.startswith("postgres://"):
            # Fix for SQLAlchemy 2.0 compatibility
            return v.replace("postgres://", "postgresql://", 1)
        return v


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()


settings = get_settings()
