# Krypts — Feature & Architecture Reference

Snapshot of everything the platform does as of 2026-07-19. Covers three layers of code:

| Layer | Branch | Status |
|---|---|---|
| Core DRM platform | `master` | Live, oldest baseline |
| Groups / Invites / Inbox / security hardening | `worktree-backend-reconciliation` | PR open, not yet merged into `master` |
| End-to-end encryption (E2EE) | `e2ee-encryption` (built on the reconciliation branch) | Implemented and manually verified, **not yet committed** |

Everything below describes the full feature set once all three are merged — i.e. what's currently running in the built Electron app. Where something is branch-specific, it's called out.

---

## 1. What Krypts is

A desktop DRM (Digital Rights Management) platform for distributing files (images, PDFs, video) so that:
- only authorized users can open them,
- every view is traceably watermarked with the viewer's identity,
- access can be revoked, time-limited, or IP-locked via signed tokens,
- suspicious login behavior gets detected and throttled automatically,
- and — as of the E2EE branch — a user can opt into encryption the server itself cannot break.

It ships as an Electron desktop app: a Next.js frontend + a PyInstaller-packaged FastAPI backend (`backend-server.exe`), spawned as a child process by Electron's `main.js` on launch.

---

## 2. Tech stack

**Frontend**
- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS v4, shadcn/ui components, Framer Motion / GSAP for animation
- `next-themes` for theming (dashboard is currently forced dark-mode only — the light-mode toggle was removed from the sidebar; theming works on marketing pages)
- SWR, Recharts (analytics charts), Sonner (toasts)

**Backend**
- FastAPI, async SQLAlchemy 2.0, Pydantic v2 (Settings + DTOs)
- SQLite (`krypts.db`) for local/dev; PostgreSQL (`asyncpg`) for production
- Redis — rate limiting + rapid-session tracking (soft dependency: fails open if unreachable)
- `python-jose` for JWT, `passlib`/`bcrypt` for password hashing
- `cryptography` (AES-256-CBC) for server-side envelope encryption
- Pillow + reportlab + pypdf for watermarking
- Packaged to a single `backend-server.exe` via PyInstaller for distribution

**Desktop shell**
- Electron `main.js` — spawns the backend exe, serves the static Next.js export, opens `BrowserWindow`s, enforces CSP and anti-capture protections
- `electron-updater` for mandatory auto-updates in production builds

**Client-side crypto (E2EE only)**
- WebCrypto (`crypto.subtle`) — RSA-OAEP-2048 keypairs, AES-GCM-256 file encryption, PBKDF2 (310k iterations) key derivation

---

## 3. High-level architecture

```
┌─────────────────────────────┐
│  Electron main.js           │
│  - spawns backend-server.exe│
│  - serves static Next export│
│  - CSP / anti-capture rules │
└──────────────┬───────────────┘
               │ HTTP (localhost:8000)
┌──────────────▼───────────────┐        ┌────────────────────┐
│  FastAPI backend             │◄──────►│  Redis              │
│  - REST API, JWT auth        │        │  (rate limit,       │
│  - envelope encryption       │        │   rapid-session)     │
│  - watermarking              │        └────────────────────┘
└──────────────┬───────────────┘
               │ SQLAlchemy (async)
┌──────────────▼───────────────┐        ┌────────────────────┐
│  SQLite / PostgreSQL          │        │  Storage             │
│  users, files, keys, groups,  │        │  S3-compatible OR    │
│  shares, activity, alerts     │        │  local_vault/ (fs)   │
└───────────────────────────────┘        └────────────────────┘
```

Frontend and backend talk over plain REST with a Bearer JWT for user auth, and a **separate** short-lived JWT (different signing secret) for content access — see §6.

---

## 4. Backend structure (`backend/app/`)

| Path | Responsibility |
|---|---|
| `main.py` | FastAPI app; CORS lock-down (only `localhost`/`127.0.0.1`); security response headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, etc.); registers all routers; `/health`; standalone `uvicorn.run` entrypoint for the frozen exe |
| `config.py` | Pydantic `Settings` — env-driven, no insecure defaults for `jwt_secret_key`/`master_kek` (app refuses to start without them) |
| `database.py` | Async engine + session factory; `init_db()` creates tables and runs lightweight `ALTER TABLE ... ADD COLUMN` shims for schema evolution (no formal migration tool) |
| `middleware/auth.py` | Password hashing (bcrypt, with legacy SHA-256 verify-and-upgrade path), JWT create/decode for both access and content tokens, `get_current_user` / `get_current_user_optional` dependencies |
| `middleware/rate_limiter.py` | Redis sliding-window limiter, per-IP, 240 req/60s default; fails open if Redis is down; skips `/health`, `/docs`, `/openapi.json`, `/redoc` |
| `models/` | SQLAlchemy ORM (see §5) |
| `routers/` | Route handlers, one file per domain (see §6) |
| `schemas/__init__.py` | All Pydantic request/response DTOs in one file |
| `utils/encryption.py` | Server-side AES-256-CBC envelope encryption (DEK + KEK wrapping) |
| `utils/storage.py` | Dual-mode object storage — S3-compatible if configured, else local filesystem fallback at `backend/local_vault/`; `LOCAL_VAULT_PATH` env override |
| `utils/watermark.py` | Server-side watermarking: diagonal repeating text grid on images (auto light/dark text based on image brightness), per-page PDF watermark merge |

---

## 5. Data model

| Table | Key columns | Purpose |
|---|---|---|
| `users` | email, password_hash, security_token, account_status (active/suspended/banned), warning_count, suspension_count, rapid_session_count, risk_score, last_login_time, **public_key, encrypted_private_key, key_salt** (E2EE) | Account + risk state + E2EE key material |
| `protected_files` | owner_id, filename, content_type, size_bytes, s3_key, encryption_key_ref (wrapped DEK, null for E2EE), iv, allow_download, stream_only, watermark_enabled, **is_e2ee** | Every uploaded file and its DRM flags |
| `file_keys` (E2EE) | file_id, user_id, wrapped_dek, unique(file_id, user_id) | Per-recipient RSA-OAEP-wrapped DEK for E2EE files — server stores/relays but can never unwrap |
| `file_shares` | file_id, shared_by_id, target_user_id OR target_group_id | Records a share to an individual or a group |
| `groups` / `group_members` / `group_invites` | name, description, owner_id; role per member; invite status (pending/accepted/rejected) | Team/group sharing |
| `user_activity_logs` | event_type (signup/login/logout/failure/expired), session_id, ip_address, device_info, login_duration | Audit trail, feeds analytics + admin views |
| `security_alerts` | alert_type (rapid_session/failed_logins/suspended/banned/manual), status (unread/read), ip_address | Feeds the admin alerts inbox |
| `api_keys` | key_hash, key_prefix, label, scopes, is_active, expires_at | Programmatic API access |

---

## 6. API surface

| Prefix | Auth | Endpoints |
|---|---|---|
| `/auth` | none for signup/login | `POST /signup`, `POST /login` (brute-force lockout, rapid-session detection), `POST /logout`, `GET /me`, `GET /keys` / `POST /keys` (E2EE key bundle) |
| `/upload`, `/files`, `/file/{id}` | Bearer | Upload (envelope-encrypted or, if `is_e2ee`, ciphertext passthrough), list, delete |
| `/generate-token`, `/validate-token` | Bearer | Mint/validate short-lived content-access JWTs (separate signing secret from user auth) |
| `/stream/video/{id}`, `/pdf/{id}/page/{n}`, `/image/{id}`, `/download/{id}` | Content token (query param) | Streams decrypted + watermarked content. Returns 409 if the file is E2EE (must go through `/e2ee/blob` instead) |
| `/e2ee/pubkey`, `/e2ee/filekey/{id}`, `/e2ee/blob/{id}` | Bearer / content token | Recipient public key lookup, per-user wrapped DEK, raw ciphertext passthrough — zero server-side decryption |
| `/analytics/usage`, `/analytics/security-events`, `/analytics/telemetry` | Bearer | Usage stats, security event feed, client telemetry ingestion |
| `/apikey/create`, `/apikey/revoke`, `/apikey/list` | Bearer | API key lifecycle |
| `/admin/users`, `/admin/user/{id}/activity`, `/admin/user/{id}/ban`\|`suspend`\|`reactivate`, `/admin/security-alerts` | Bearer + admin-email check | User/account management, alert triage |
| `/groups` (POST/GET), `/groups/{id}/invite`, `/groups/{id}/members`, `/groups/{id}/files`, `DELETE /groups/{id}/files/{share_id}` | Bearer | Group CRUD, membership, group-shared files |
| `/inbox` (GET), `/inbox/share` (POST) | Bearer | Receive shared files; share a file to a user or group (E2EE files: individual-only, requires `wrapped_dek`) |
| `/invites` (GET), `/invites/{id}/accept`\|`reject` | Bearer | Respond to group invites |
| `/health` | none | Liveness check |

---

## 7. Security features

- **Password hashing:** bcrypt via passlib, with automatic upgrade-on-verify for any legacy SHA-256 hashes still in the DB.
- **Two separate JWT secrets:** user session tokens and content-access tokens are signed with different secrets, so leaking one token type never compromises the other.
- **Brute-force lockout:** failed login attempts tracked per email (Redis), independent of the rapid-session system.
- **Rapid-session detection:** if a user logs in again within `RAPID_SESSION_THRESHOLD_SECONDS` (120s default) of their last login, escalating response: 1st → warning + `SecurityAlert`, 2nd → account suspended, 3rd+ → account banned. Resets if the gap exceeds the threshold.
- **Rate limiting:** Redis sliding window, 240 req/60s per IP (raised from an original 60 after it was found to cause false-positive session drops during normal fast navigation — see §10).
- **Account states:** active / suspended / banned enforced both at login and on every subsequent authenticated request via `get_current_user`.
- **CORS lock-down:** only `localhost`/`127.0.0.1` origins allowed.
- **Security response headers** on every response: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `X-XSS-Protection`, `Cache-Control: no-store`.
- **No insecure defaults:** `JWT_SECRET_KEY` and `MASTER_KEK` have no fallback values — the app fails to start if they're unset.
- **Client-side session hygiene** (frontend): 401 from `/auth/me` logs the user out; 429 (rate-limited) does **not** — this was a real bug, fixed (see §10).

---

## 8. Watermarking

- Applied **server-side, on every access**, for non-E2EE content.
- **Images:** repeating diagonal text grid (e.g. containing the viewer's email/user ID), opacity and text color auto-adjusted (dark text on light images, light text on dark images) based on a fast luminance sample of the image.
- **PDFs:** per-page watermark generated with reportlab and merged onto each page via pypdf.
- **Video:** streamed in 64KB chunks without a server-rendered watermark; a client-side `FloatingWatermark` overlay renders on top of the `<video>` element instead.
- **E2EE files:** server-side watermarking is impossible (server never sees plaintext) — all E2EE viewers use the same client-side floating overlay.
- `/dashboard/watermarks` lets a user customize the overlay (text template, opacity, density, color scheme) — settings are stored in `localStorage`, not synced server-side.
- `/dashboard/scanner` ("Forensic Scanner", admin-only nav item) is a client-side canvas tool that applies aggressive contrast stretching to an uploaded image to reveal a faint/invisible watermark — a demo of how traceability holds up even against attempts to strip it visually.

---

## 9. Envelope encryption (non-E2EE files — the original/default path)

1. Random 256-bit DEK + 128-bit IV generated server-side per file.
2. File encrypted with AES-256-CBC using the DEK.
3. DEK itself encrypted ("wrapped") with a master KEK (from `MASTER_KEK` env var, padded/truncated to 32 bytes).
4. Ciphertext stored in S3/local vault; wrapped DEK + IV stored in the `protected_files` row.
5. On every authorized view, the server unwraps the DEK, decrypts the file in memory, watermarks it, and streams the result — the server is fully capable of reading file contents.

---

## 10. End-to-end encryption (E2EE) — opt-in per upload

Closes the gap in §9: for files uploaded with the E2EE toggle on, the server **never holds a usable key** and cannot decrypt content even in principle.

- **Keypair:** each user gets an RSA-OAEP-2048 keypair (WebCrypto, generated client-side). Public key stored in plaintext on the server (`users.public_key`); private key is exported, encrypted client-side with an AES-GCM key derived via PBKDF2 (310,000 iterations, SHA-256, per-user salt) from the user's password, and only that encrypted blob (`encrypted_private_key`) is stored server-side.
- **Provisioning:** happens at signup for new users; existing users get keys lazily generated and registered on their next login if `has_keys` is false.
- **Session key caching:** at login, the client decrypts the private key (password is in memory at that moment) and caches the decrypted key material in `localStorage` (cleared on logout) — needed because viewer windows are separate Electron `BrowserWindow`s with no shared JS memory. Tradeoff accepted for a desktop-app context; the core guarantee (server can never decrypt) holds regardless.
- **File encryption:** AES-GCM-256 with a random 12-byte IV, generated and applied entirely client-side before upload.
- **Key delivery:** the `file_keys` table maps `(file_id, user_id) → wrapped_dek`. The uploader's own key is wrapped with their own public key at upload time. Sharing = the sharer unwraps the DEK locally, re-wraps it with the recipient's public key, and only that wrapped blob is sent to the server.
- **Sharing scope (V1):** individual-user shares only — attempting to group-share an E2EE file returns a 400. (Wrapping the DEK for every group member is a known follow-up, not yet built.)
- **Server routes:** `GET /e2ee/pubkey` (recipient key lookup), `GET /e2ee/filekey/{id}` (caller's own wrapped DEK), `GET /e2ee/blob/{id}` (raw ciphertext passthrough — no decryption). The regular `/image`, `/pdf`, `/stream/video` routes return 409 for E2EE files to force the client onto this path.
- **Verified:** stored ciphertext in `local_vault/` is confirmed non-decryptable via the master KEK; end-to-end upload → share → cross-account view round-trip tested manually in the built Electron app with the floating watermark rendering correctly over the decrypted blob.

---

## 11. Frontend structure (`src/`)

| Path | Purpose |
|---|---|
| `lib/api.ts` | Typed API client, namespaced (`api.auth.*`, `api.files.*`, `api.e2ee.*`, `api.inbox.*`, etc.), auto-attaches Bearer token from `localStorage` |
| `lib/auth-context.tsx` | React context: `user`, `login()`, `signup()`, `logout()`; restores session via `/auth/me` on mount; handles E2EE key provisioning/unlock on login (fire-and-forget, not blocking login) |
| `lib/crypto.ts` | WebCrypto helper library — keypair generation, PBKDF2 derivation, private-key encrypt/decrypt, DEK generation, AES-GCM file encrypt/decrypt, RSA-OAEP wrap/unwrap, base64 utilities |
| `app/(marketing)/` | Public landing page + docs |
| `app/login`, `app/signup` | Auth pages (login page also has a dev-only quick-login widget, driven by local storage config) |
| `app/dashboard/` | Protected routes behind `<AuthGuard>`. Sidebar sections: Overview, Inbox, Groups, Upload, Content Manager, Token Generator, Watermark Settings, Forensic Scanner (admin-only), Analytics, API Keys, Admin Panel (admin-only) |
| `app/view/{image,pdf,video}` | Content viewers — consume content-access tokens via query params; for E2EE files, fetch ciphertext + wrapped key and decrypt client-side into a Blob URL before rendering |
| `components/ui/` | shadcn/ui primitives |
| `components/marketing/` | Landing page sections |
| Path alias `@/*` → `src/*` | |

**Dashboard nav map** (`src/app/dashboard/layout.tsx`): Overview → Inbox → Groups → Upload Content → Content Manager → Token Generator → Watermark Settings → Forensic Scanner (admin) → Analytics → API Keys → Admin Panel (admin). Sidebar is currently forced dark-mode (`dark` class hardcoded on the dashboard shell); the light-mode toggle was removed rather than re-themed, since the dashboard's color tokens are dark-only by design.

---

## 12. Electron desktop shell (`main.js`)

- Spawns the packaged `backend-server.exe` as a child process on launch; kills it on `will-quit`.
- Two window types: main app window and a separate protected viewer window, both with `devTools: false` and `setContentProtection(true)` (blocks screenshot/screen-recording capture at the OS compositor level).
- Blocks DevTools globally: registers global shortcuts for F12, Ctrl/Cmd+Shift+I/J/C, Ctrl/Cmd+U/P/S/Shift+S as no-ops; also force-closes DevTools if opened another way.
- Enforces a strict CSP via `onHeadersReceived`: `default-src 'self'`, scripts/styles self + inline (Next.js requirement), `connect-src`/`media-src` limited to `self` + `localhost`/`127.0.0.1` (both variants needed — `NEXT_PUBLIC_API_URL` bakes in whichever host was used at build time), `frame-src`/`object-src 'none'`.
- `krypts://` deep link protocol handling (cold start and already-running cases).
- `DEV_MODE` flag: when `false` (current default), always serves the static `next build && next export` output via a bundled local HTTP server — running `npm run dev` alone does **not** get picked up; you must `npm run build` first, then launch the desktop shell.
- Mandatory auto-updates in production builds via `electron-updater` — update-downloaded triggers a blocking dialog and forced restart-to-install.

---

## 13. Environment / configuration

- Backend reads `backend/.env`; frontend reads `.env.local`.
- Key backend vars: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET_KEY`, `CONTENT_TOKEN_SECRET` (falls back to `JWT_SECRET_KEY` if unset), `MASTER_KEK`, `S3_*` (optional), `ADMIN_EMAIL`, `RAPID_SESSION_THRESHOLD_SECONDS` (120), `RATE_LIMIT_REQUESTS` (240), `RATE_LIMIT_WINDOW_SECONDS` (60), `MAX_UPLOAD_SIZE_BYTES` (500MB), `LOCAL_VAULT_PATH` override.
- Frontend: `NEXT_PUBLIC_API_URL` (must match backend port, default 8000).
- Default dev DB: SQLite (`sqlite+aiosqlite:///./krypts.db`). Production: PostgreSQL via `asyncpg`.
- Admin access is a single check: `current_user.email == settings.admin_email` — no separate role table.

---

## 14. Known follow-ups / open items

- Reconciliation branch PR (`worktree-backend-reconciliation`) is not yet merged into `master`.
- E2EE branch has all its code (feature + bug fixes) uncommitted in the working tree of the `e2ee` worktree — nothing pushed yet.
- E2EE group-sharing is explicitly out of scope for V1 (400 response).
- No content-access-token registry — expired/used tokens aren't tracked, hidden, or deletable from any UI; they simply stop validating after expiry.
- Watermark settings and Forensic Scanner are local/client-only (localStorage), not persisted or enforced server-side.
