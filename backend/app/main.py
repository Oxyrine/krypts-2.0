"""
Krypts DRM Platform — FastAPI application entry point.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.middleware.rate_limiter import RateLimiterMiddleware
from app.routers import admin, analytics, apikeys, auth, content, files, tokens


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database tables on startup."""
    await init_db()
    yield


app = FastAPI(
    title="Krypts DRM API",
    description=(
        "Plug-and-play Digital Rights Management API with AES-256 encryption, "
        "signed access tokens, traceable watermarking, and security intelligence."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RateLimiterMiddleware)

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


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["System"])
async def health():
    return {"status": "healthy", "version": "1.0.0"}
