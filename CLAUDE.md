# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (Next.js)
```bash
npm run dev          # Dev server on port 3000
npm run build        # Production build
npm run start        # Run production build
npm run lint         # ESLint
```

### Backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Docker (full stack)
```bash
docker-compose up --build   # Starts postgres, redis, backend, frontend
```

## Architecture

**Krypts** is a Digital Rights Management platform. Frontend is Next.js 16 (App Router, React 19, TypeScript). Backend is FastAPI with async SQLAlchemy. They communicate via REST with JWT Bearer tokens.

### Backend Structure (`backend/app/`)

- `main.py` — FastAPI app, middleware registration, router includes
- `config.py` — Pydantic Settings loaded from env vars
- `database.py` — Async SQLAlchemy engine + session factory; tables auto-created on startup via `init_db()`
- `middleware/auth.py` — JWT creation/verification, password hashing (salted SHA-256), `get_current_user` dependency
- `middleware/rate_limiter.py` — IP-based rate limiting (60 req/60s default)
- `models/` — SQLAlchemy ORM: User, ProtectedFile, UserActivityLog, SecurityAlert, ApiKey
- `routers/` — Route handlers (auth, files, tokens, content, analytics, apikeys, admin)
- `schemas/__init__.py` — All Pydantic v2 request/response DTOs in one file
- `utils/encryption.py` — AES-256-CBC envelope encryption with KEK wrapping
- `utils/storage.py` — Dual-mode storage: S3-compatible with local filesystem fallback (`backend/local_vault/`)
- `utils/watermark.py` — Server-side watermarking for images (Pillow) and PDFs (reportlab + pypdf)

### API Routes

| Prefix | Auth | Purpose |
|--------|------|---------|
| `/auth` | None (signup/login), Bearer (me) | Authentication |
| `/upload`, `/files`, `/file/{id}` | Bearer | File CRUD |
| `/generate-token`, `/validate-token` | Bearer | Content access token management |
| `/stream/video/{id}`, `/pdf/{id}/page/{n}`, `/image/{id}` | Token query param | Secure content delivery |
| `/analytics` | Bearer | Usage stats, security events |
| `/apikey` | Bearer | API key CRUD |
| `/admin` | Bearer (admin_email check) | User management, alerts |
| `/health` | None | Health check |

### Frontend Structure (`src/`)

- `lib/api.ts` — Typed API client with namespaced methods (`api.auth.*`, `api.files.*`, etc.). Auto-attaches Bearer token from localStorage.
- `lib/auth-context.tsx` — React context providing `user`, `login()`, `signup()`, `logout()`. Restores session on mount via `/auth/me`.
- `app/(marketing)/` — Public pages (landing, docs)
- `app/dashboard/` — Protected routes wrapped in `<AuthGuard>`. Sidebar layout with overview, upload, content, tokens, watermarks, analytics, API keys, admin.
- `app/view/` — Content viewers (PDF, video, image) that consume content access tokens via query params.
- `components/ui/` — shadcn/ui base components
- `components/marketing/` — Landing page sections
- Path alias: `@/*` maps to `src/*`

### Key Flows

**Envelope Encryption (file upload):** Generate random DEK + IV → encrypt file with AES-256-CBC → encrypt DEK with master KEK → store encrypted file in S3/local vault, encrypted DEK + IV in DB.

**Content Access Tokens:** JWTs with `type: "content_access"`, file_id, user_id, permissions, optional IP restriction. Generated via `/generate-token`, validated on every content stream request.

**Watermarking:** Applied server-side on every access. Images get transparent diagonal text overlay with user ID. PDFs get per-page watermark via reportlab merge. Videos stream without watermark (chunked, 64KB).

**Rapid Session Detection:** Redis tracks last login per user. Logins within 120s trigger escalating responses: warning → suspension → ban. Creates SecurityAlert records.

## Environment

Backend reads from `backend/.env`, frontend from `.env.local`.

Key backend vars: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET_KEY`, `MASTER_KEK`, `S3_*` (optional, falls back to local), `ADMIN_EMAIL`.

Frontend: `NEXT_PUBLIC_API_URL` (must match backend port, default 8000).

Default dev DB is SQLite (`sqlite+aiosqlite:///./krypts.db`). Production uses PostgreSQL via `asyncpg`.

## Conventions

- Backend uses async/await throughout (database, Redis, S3, file I/O)
- Auth dependency injection: `current_user=Depends(get_current_user)` and `db: AsyncSession = Depends(get_db)`
- Admin endpoints check `current_user.email == settings.admin_email`
- Frontend pages are `"use client"` components using `useAuth()` hook and `api.*` methods
- UI built with shadcn/ui + Tailwind CSS v4 + Framer Motion
- Storage keys follow `{owner_id}/{file_id}/{filename}.enc` pattern
