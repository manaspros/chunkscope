"""
Rate Limiting with SlowAPI
Uses in-memory storage
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings


def get_request_key(request) -> str:
    """
    Rate limit key function.
    Uses IP address for rate limiting.
    """
    return f"ip:{get_remote_address(request)}"


def _create_limiter() -> Limiter:
    """Create limiter with in-memory storage."""
    return Limiter(
        key_func=get_request_key,
        default_limits=[f"{settings.rate_limit_per_minute}/minute"],
        storage_uri="memory://",
    )


# Global rate limiter instance
limiter = _create_limiter()
