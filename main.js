const { app, BrowserWindow, globalShortcut, session } = require("electron");
const path = require("path");
const { execSync, spawn } = require("child_process");

// ─── Configuration ──────────────────────────────────────────────────────────
const DEV_MODE = process.env.NODE_ENV !== "production";
const DEV_URL = "http://localhost:3000";
const PROD_URL = `file://${path.join(__dirname, "out", "index.html")}`;

let mainWindow = null;

// ─── Create Window ───────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Krypts DRM",
    icon: path.join(__dirname, "public", "favicon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "electron-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false, // Disable DevTools entirely in production
    },
  });

  // ─── CORE PROTECTION: Block all screenshot / screen-recording tools ───────
  // On Windows and macOS this causes the window to show as solid black
  // in Snipping Tool, Win+Shift+S, OBS, Zoom, Teams, Discord screen share, etc.
  mainWindow.setContentProtection(true);

  // ─── Remove default menu bar (hides "View > Toggle DevTools") ────────────
  mainWindow.setMenuBarVisibility(false);

  // ─── Load the app ─────────────────────────────────────────────────────────
  if (DEV_MODE) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadURL(PROD_URL);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

  // Block every DevTools keyboard shortcut universally
  const blockedShortcuts = [
    "F12",
    "CommandOrControl+Shift+I",
    "CommandOrControl+Shift+J",
    "CommandOrControl+Shift+C",
    "CommandOrControl+U",         // View source
    "CommandOrControl+P",         // Print
    "CommandOrControl+S",         // Save page
    "CommandOrControl+Shift+S",
  ];

  blockedShortcuts.forEach((shortcut) => {
    globalShortcut.register(shortcut, () => {
      // Intercepted — do nothing
    });
  });

  // Block right-click context menu at the OS level
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: details.requestHeaders });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  globalShortcut.unregisterAll();
  if (process.platform !== "darwin") app.quit();
});

// Handle new window requests — open Krypts viewer URLs in a new protected window.
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    const isLocalhost = url.startsWith("http://localhost:3000");
    const isVercel   = url.includes("krypts.vercel.app");

    if (isLocalhost || isVercel) {
      // Rewrite Vercel → localhost if needed
      const localUrl = isVercel
        ? url.replace("https://krypts.vercel.app", "http://localhost:3000")
        : url;

      setImmediate(() => {
        // Create a new Electron window for the viewer with full protection
        const viewerWin = new BrowserWindow({
          width: 1280,
          height: 800,
          minWidth: 800,
          minHeight: 600,
          title: "Krypts Secure Viewer",
          webPreferences: {
            preload: path.join(__dirname, "electron-preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            devTools: false,
          },
        });

        // CRITICAL: block screenshots / screen recording on the viewer window too
        viewerWin.setContentProtection(true);
        viewerWin.setMenuBarVisibility(false);
        viewerWin.loadURL(localUrl);

        // Block DevTools on the viewer window's web contents
        viewerWin.webContents.on("devtools-opened", () => {
          viewerWin.webContents.closeDevTools();
        });
      });

      return { action: "deny" }; // prevent default browser-based new window
    }

    // Block all other external URLs
    return { action: "deny" };
  });

  // Intercept same-window navigation to Vercel URLs
  contents.on("will-navigate", (event, url) => {
    if (url.startsWith("https://krypts.vercel.app")) {
      event.preventDefault();
      const localUrl = url.replace("https://krypts.vercel.app", "http://localhost:3000");
      if (mainWindow) mainWindow.loadURL(localUrl);
    }
  });

  // Block DevTools from being opened programmatically
  contents.on("devtools-opened", () => {
    contents.closeDevTools();
  });
});
