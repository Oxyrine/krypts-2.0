# Krypts Desktop DRM — Electron Wrapper

A desktop application wrapper for the Krypts DRM Platform. Wraps the existing Next.js web app in an Electron shell that adds OS-level content protection, disabling screenshots, screen recording, and developer tools.

---

## 🔒 What This Adds Over the Web Version

| Feature | Web Browser | Desktop App |
|---|---|---|
| Block Snipping Tool / PrintScreen | ❌ Not possible | ✅ Window shows as black |
| Block OBS / Zoom / Discord screen share | ❌ Not possible | ✅ Window shows as black |
| Disable F12 / DevTools | ❌ Browser allows it | ✅ Fully intercepted |
| Disable right-click / Inspect Element | ❌ Partial only | ✅ Blocked entirely |
| Disable Ctrl+P (Print) | ❌ Partial only | ✅ Blocked at OS level |

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **Backend**: FastAPI (Python) deployed on Railway
- **Desktop Shell**: Electron 36 with `setContentProtection(true)`

---

## 🚀 Running Locally

### Prerequisites
- Node.js 18+
- npm

### Steps

```bash
# 1. Install all dependencies (including Electron)
npm install

# 2. Launch the desktop app (starts Next.js + opens Electron window)
npm run desktop
```

The `npm run desktop` command:
1. Starts the Next.js development server on port 3000
2. Waits until the server is ready
3. Opens the Electron desktop window

---

## 🔑 Backend Connection

The desktop app connects to the same Railway-hosted FastAPI backend as the web app.
No separate backend setup is required. The API URL is configured in `src/lib/api.ts`.

---

## 📂 Key New Files

| File | Purpose |
|---|---|
| `main.js` | Electron main process — creates the window, enables content protection, blocks shortcuts |
| `electron-preload.js` | Secure bridge exposing `window.kryptsDesktop.isDesktopApp` to the UI |
| `electron-dev.js` | Development launcher that boots Next.js then opens Electron |
