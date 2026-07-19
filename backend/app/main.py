"""
Krypts DRM Platform — FastAPI application entry point.
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import init_db
from app.middleware.rate_limiter import RateLimiterMiddleware
from app.routers import admin, analytics, apikeys, auth, content, files, tokens, groups, inbox, invites, e2ee


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database tables on startup."""
    await init_db()
    yield


# ---------------------------------------------------------------------------
# API docs: only expose in development mode
# ---------------------------------------------------------------------------
_expose_docs = os.getenv("KRYPTS_ENV", "production").lower() in ("dev", "development", "local")

app = FastAPI(
    title="Krypts DRM API",
    description=(
        "Plug-and-play Digital Rights Management API with AES-256 encryption, "
        "signed access tokens, traceable watermarking, and security intelligence."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if _expose_docs else None,
    redoc_url="/redoc" if _expose_docs else None,
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

# CORS — allow only the Electron renderer and localhost dev server.
# The krypts:// protocol uses null origin in some Electron versions; we allow
# the localhost wildcard only.  Tighten further before deploying publicly.
_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_ALLOWED_ORIGIN_REGEX = r"^http://127\.0\.0\.1(:\d+)?$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_origin_regex=_ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

app.add_middleware(RateLimiterMiddleware)


# ---------------------------------------------------------------------------
# Security response headers middleware
# ---------------------------------------------------------------------------

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Cache-Control"] = "no-store"
    return response


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(files.router, tags=["File Management"])
app.include_router(tokens.router, tags=["Token Management"])
app.include_router(content.router, tags=["Secure Content"])
app.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
app.include_router(apikeys.router, prefix="/apikey", tags=["API Keys"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(groups.router, prefix="/groups", tags=["Groups"])
app.include_router(inbox.router, prefix="/inbox", tags=["Inbox"])
app.include_router(invites.router, prefix="/invites", tags=["Invites"])
app.include_router(e2ee.router, prefix="/e2ee", tags=["End-to-End Encryption"])


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["System"])
async def health():
    return {"status": "healthy", "version": "1.0.0"}


# ---------------------------------------------------------------------------
# Standalone entry point (PyInstaller-packaged backend-server.exe runs this
# module directly rather than via `uvicorn app.main:app`)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
