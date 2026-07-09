const { app, BrowserWindow, globalShortcut, session } = require("electron");
const path = require("path");

// ─── Configuration ──────────────────────────────────────────────────────────
const DEV_MODE = process.env.NODE_ENV !== "production";
const DEV_URL = "http://localhost:3000";
const PROD_URL = `file://${path.join(__dirname, "out", "index.html")}`;

let mainWindow = null;

// ─── Deep Link URL → Next.js path converter ──────────────────────────────────
// Converts: krypts://view/image?file_id=xxx&token=yyy
//       to: http://localhost:3000/view/image?file_id=xxx&token=yyy
function kryptsUrlToLocal(rawUrl) {
  try {
    const parsed = new URL(rawUrl); // e.g. krypts://view/image?file_id=...&token=...
    const pathname = `/${parsed.host}${parsed.pathname}`.replace(/\/+/g, "/"); // view/image
    const search = parsed.search; // ?file_id=...&token=...
    return `${DEV_URL}${pathname}${search}`;
  } catch {
    return DEV_URL;
  }
}

// ─── Open a deep-linked URL in a new protected viewer window ─────────────────
function openProtectedViewer(localUrl) {
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

  // Block screenshots/screen recording on this viewer window too
  viewerWin.setContentProtection(true);
  viewerWin.setMenuBarVisibility(false);
  viewerWin.loadURL(localUrl);

  viewerWin.webContents.on("devtools-opened", () => {
    viewerWin.webContents.closeDevTools();
  });
}

// ─── Create Main Window ──────────────────────────────────────────────────────
function createWindow(deepLinkUrl) {
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
      devTools: false,
    },
  });

  // ─── CORE PROTECTION: Block all screenshot / screen-recording tools ───────
  mainWindow.setContentProtection(true);
  mainWindow.setMenuBarVisibility(false);

  // ─── Load the app (or deep link target directly) ──────────────────────────
  if (deepLinkUrl) {
    mainWindow.loadURL(deepLinkUrl);
  } else if (DEV_MODE) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadURL(PROD_URL);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── Custom Protocol: krypts:// ───────────────────────────────────────────────
// Registers this app to handle krypts:// links on Windows/macOS/Linux.
// When a user clicks krypts://view/image?file_id=xxx&token=yyy, Windows
// launches this executable and passes the URL in process.argv.
if (process.defaultApp) {
  // Running from source via `electron .` — register with full path to electron
  app.setAsDefaultProtocolClient("krypts", process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient("krypts");
}

// ─── Single Instance Lock (prevents double windows on protocol launch) ────────
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running — quit immediately.
  // The running instance will handle the deep link via second-instance event.
  app.quit();
} else {
  // Handle the deep link when the app is already open (second-instance event)
  app.on("second-instance", (_event, commandLine) => {
    // The deep link URL is the last item in commandLine on Windows
    const deepLink = commandLine.find((arg) => arg.startsWith("krypts://"));
    if (deepLink) {
      const localUrl = kryptsUrlToLocal(deepLink);
      openProtectedViewer(localUrl);
    }
    // Bring the main window to front
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // ─── App Lifecycle ─────────────────────────────────────────────────────────
  app.whenReady().then(() => {
    // Check if launched via a krypts:// deep link (cold start)
    const deepLink = process.argv.find((arg) => arg.startsWith("krypts://"));
    const startUrl = deepLink ? kryptsUrlToLocal(deepLink) : null;

    createWindow(startUrl);

    // Block every DevTools keyboard shortcut universally
    const blockedShortcuts = [
      "F12",
      "CommandOrControl+Shift+I",
      "CommandOrControl+Shift+J",
      "CommandOrControl+Shift+C",
      "CommandOrControl+U",
      "CommandOrControl+P",
      "CommandOrControl+S",
      "CommandOrControl+Shift+S",
    ];

    blockedShortcuts.forEach((shortcut) => {
      globalShortcut.register(shortcut, () => {});
    });

    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      callback({ requestHeaders: details.requestHeaders });
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(null);
    });
  });

  app.on("window-all-closed", () => {
    globalShortcut.unregisterAll();
    if (process.platform !== "darwin") app.quit();
  });

  // macOS: handle deep links when app is already running
  app.on("open-url", (event, url) => {
    event.preventDefault();
    const localUrl = kryptsUrlToLocal(url);
    if (mainWindow) {
      openProtectedViewer(localUrl);
    } else {
      createWindow(localUrl);
    }
  });
}

// ─── Handle new window requests ───────────────────────────────────────────────
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    const isLocalhost = url.startsWith("http://localhost:3000");
    const isVercel = url.includes("krypts.vercel.app");

    if (isLocalhost || isVercel) {
      const localUrl = isVercel
        ? url.replace("https://krypts.vercel.app", "http://localhost:3000")
        : url;

      setImmediate(() => {
        openProtectedViewer(localUrl);
      });

      return { action: "deny" };
    }

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

  contents.on("devtools-opened", () => {
    contents.closeDevTools();
  });
});
