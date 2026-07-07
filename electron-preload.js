/**
 * Electron Preload Script
 *
 * This file runs in an isolated context between the Electron main process
 * and the renderer (the Next.js web page). It is the only safe bridge
 * for exposing any native capabilities to the frontend.
 *
 * We intentionally expose NOTHING here — the app is purely a viewer.
 * Having an empty preload with contextIsolation=true is the safest
 * possible configuration.
 */

const { contextBridge } = require("electron");

// Expose a minimal API to the renderer — just enough to know we are
// running inside Electron (useful for hiding "Download" buttons in the UI).
contextBridge.exposeInMainWorld("kryptsDesktop", {
  isDesktopApp: true,
  platform: process.platform, // "win32" | "darwin" | "linux"
});
