"""
Redis-based sliding window rate limiter middleware.
"""
import json
from typing import Optional

import redis.asyncio as aioredis
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import settings

_redis_client: Optional[aioredis.Redis] = None


def _get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """Sliding window rate limiter: max N requests per window per IP."""

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health check
        if request.url.path in ("/health", "/docs", "/openapi.json", "/redoc"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        key = f"rate_limit:{client_ip}"

        try:
            r = _get_redis()
            pipe = r.pipeline()
            pipe.incr(key)
            pipe.expire(key, settings.rate_limit_window_seconds)
            results = await pipe.execute()
            count = results[0]

            if count > settings.rate_limit_requests:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests. Please slow down."},
                    headers={"Retry-After": str(settings.rate_limit_window_seconds)},
                )
        except Exception:
            # If Redis is unavailable, fail open (don't block the request)
            pass

        return await call_next(request)
