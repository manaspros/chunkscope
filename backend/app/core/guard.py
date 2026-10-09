"""
Public-deployment guard: request body size cap + per-IP in-memory rate limit.

Meant for the hosted prototype where endpoints that call an LLM or accept uploads
are reachable by anyone. In-memory only: counters are per serverless instance, so
this is a best-effort brake, not a hard quota.
"""
import os
import time
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

MAX_BODY_BYTES = int(os.getenv("GUARD_MAX_BODY_MB", "4")) * 1024 * 1024  # Vercel caps bodies at 4.5 MB
LLM_PER_MIN = int(os.getenv("GUARD_LLM_PER_MIN", "10"))
WRITE_PER_MIN = int(os.getenv("GUARD_WRITE_PER_MIN", "120"))
LLM_PATH_HINTS = ("/query", "/suggestions", "/execute", "/rerank", "/evaluat", "/analyze")

_hits: dict[str, deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _allow(key: str, limit: int) -> bool:
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    if len(_hits) > 5000:  # keep memory bounded
        for k in [k for k, v in _hits.items() if not v or now - v[-1] > 60]:
            _hits.pop(k, None)
    return True


def add_public_guard(app: FastAPI) -> None:
    @app.middleware("http")
    async def guard(request: Request, call_next):
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            length = request.headers.get("content-length")
            if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
                return JSONResponse({"detail": f"Request too large (max {MAX_BODY_BYTES // (1024 * 1024)} MB in the hosted demo)."}, status_code=413)
            ip = _client_ip(request)
            is_llm = any(h in request.url.path for h in LLM_PATH_HINTS)
            if is_llm and not _allow(f"llm:{ip}", LLM_PER_MIN):
                return JSONResponse({"detail": "Rate limit: too many compute-heavy requests from this IP. Try again in a minute."}, status_code=429)
            if not _allow(f"w:{ip}", WRITE_PER_MIN):
                return JSONResponse({"detail": "Rate limit: too many write requests from this IP. Try again in a minute."}, status_code=429)
        return await call_next(request)
