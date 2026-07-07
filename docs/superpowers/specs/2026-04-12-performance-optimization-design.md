# Performance Optimization Design — Krypts DRM Platform

**Date:** 2026-04-12
**Scope:** Dashboard and content list page load times (3-5s → <500ms)
**Approach:** Option B — Frontend SWR caching + backend query consolidation

---

## Problem

Dashboard (`/dashboard`) and content list pages (`/content`, `/tokens`, `/admin`) take 3-5 seconds to show data. The slowness is pure API wait time (loading spinners), not rendering. Two root causes:

1. **No client-side caching** — every page visit refetches all data from scratch, even if the user was just there.
2. **Backend does redundant sequential work** — analytics endpoint fires 5 DB queries one-after-another; dashboard frontend fires 2 API calls sequentially.

---

## Out of Scope

- File decryption streaming (video/PDF performance)
- Redis caching layer for backend aggregations
- Bundle size reduction (Recharts, tsparticles, three.js)
- Rate limiter optimization

These are real issues but not the source of the 3-5s waits on the pages the user cares about.

---

## Solution

### Frontend: SWR data caching

**Install:** `npm install swr` (4KB, zero config)

Replace the `useState` + `useEffect` + manual fetch pattern in all 5 dashboard pages with `useSWR`. SWR caches responses by key. On re-navigation, data is returned instantly from cache while SWR revalidates in the background.

**Pages to migrate (5 files):**

| File | Current API calls | Change |
|------|-------------------|--------|
| `src/app/dashboard/page.tsx` | `api.analytics.usage()` + `api.analytics.securityEvents(5)` | `Promise.all` wrapped in single SWR key |
| `src/app/dashboard/content/page.tsx` | `api.files.list()` | `useSWR` |
| `src/app/dashboard/tokens/page.tsx` | `api.tokens.*` list calls | `useSWR` |
| `src/app/dashboard/admin/page.tsx` | `api.admin.users()` | `useSWR` with pagination params |
| `src/app/dashboard/admin/alerts/page.tsx` | `api.admin.securityAlerts()` | `useSWR` |

**SWR config (global, in layout or provider):**
```ts
// Revalidate on window focus, dedupe requests within 5s
{ revalidateOnFocus: true, dedupingInterval: 5000 }
```

**Pattern:**
```ts
// Before
const [data, setData] = useState(null)
const [loading, setLoading] = useState(true)
useEffect(() => {
  api.analytics.usage().then(setData).finally(() => setLoading(false))
}, [])

// After
const { data, isLoading } = useSWR('analytics/usage', api.analytics.usage)
```

For the dashboard page where two calls are needed simultaneously:
```ts
const { data, isLoading } = useSWR('dashboard', () =>
  Promise.all([api.analytics.usage(), api.analytics.securityEvents(5)])
    .then(([analytics, events]) => ({ analytics, events }))
)
```

**Mark-all-alerts fix** — replace sequential loop with parallel calls:
```ts
// Before: N requests in series
for (const alert of unread) {
  await api.admin.markAlertRead(alert.alert_id)
}

// After: N requests in parallel
await Promise.all(unread.map(a => api.admin.markAlertRead(a.alert_id)))
// Then mutate SWR cache: mutate('admin/alerts')
```

---

### Backend: Consolidate analytics queries

**File:** `backend/app/routers/analytics.py`

The `/analytics/usage` endpoint runs 5 sequential `await db.execute()` calls. Replace with `asyncio.gather` so all run concurrently:

```python
import asyncio

async def usage_analytics(current_user, db):
    files_q    = db.execute(select(func.count(ProtectedFile.id)).where(...))
    bw_q       = db.execute(select(func.sum(ProtectedFile.file_size)).where(...))
    events_q   = db.execute(select(func.count(UserActivityLog.log_id)).where(...))
    failed_q   = db.execute(select(func.count(UserActivityLog.log_id)).where(..., EventType.failure))
    recent_q   = db.execute(select(UserActivityLog).where(...).order_by(...).limit(10))

    files_r, bw_r, events_r, failed_r, recent_r = await asyncio.gather(
        files_q, bw_q, events_q, failed_q, recent_q
    )
    # ... assemble response
```

Expected improvement: ~5× DB round-trip → ~1× (queries run in parallel).

---

### Backend: Add missing DB indexes

**Files:** `backend/app/models/`

Three columns are queried frequently with no index:

| Model file | Column | Index type | Used by |
|------------|--------|------------|---------|
| `activity_log.py` | `user_id` | `index=True` | analytics, admin activity view |
| `security_alert.py` | `user_id` | `index=True` | analytics security events |
| `protected_file.py` | `created_at` | `index=True` | file list ORDER BY |

SQLAlchemy creates indexes automatically on next `init_db()` startup. No migration needed for SQLite dev; for PostgreSQL, a `CREATE INDEX CONCURRENTLY` migration is preferred.

---

### Backend: Pagination on admin endpoints

**File:** `backend/app/routers/admin.py`

Add `skip` and `limit` query parameters to prevent full-table serialization:

```python
@router.get("/users")
async def list_users(skip: int = 0, limit: int = 50, ...):
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset(skip).limit(limit)
    )

@router.get("/security-alerts")
async def list_security_alerts(skip: int = 0, limit: int = 50, ...):
    result = await db.execute(
        select(SecurityAlert).order_by(SecurityAlert.timestamp.desc()).offset(skip).limit(limit)
    )
```

Frontend passes `?limit=50` on initial load. No UI pagination controls needed unless the user has 50+ users/alerts (can be added later).

---

## Files Changed

**Frontend:**
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/content/page.tsx`
- `src/app/dashboard/tokens/page.tsx`
- `src/app/dashboard/admin/page.tsx`
- `src/app/dashboard/admin/alerts/page.tsx`
- `package.json` (add `swr`)

**Backend:**
- `backend/app/routers/analytics.py`
- `backend/app/routers/admin.py`
- `backend/app/models/activity_log.py`
- `backend/app/models/security_alert.py`
- `backend/app/models/protected_file.py`

**Already fixed (not in plan):**
- `backend/app/main.py` — CORS wildcard+credentials bug (login was broken)

---

## Success Criteria

- Dashboard first load: <1s (down from 3-5s)
- Dashboard re-navigation: <100ms (instant from SWR cache)
- Mark-all-alerts: fires in parallel, completes in ~1 request-worth of time
- No regressions on existing auth, file upload, or content viewing flows
