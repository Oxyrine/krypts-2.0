const { app, BrowserWindow, globalShortcut, session, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const http = require("http");
const fs = require("fs");
const url = require("url");
const { spawn, execSync } = require("child_process");

// ─── Configuration ──────────────────────────────────────────────────────────
const DEV_MODE = false; // FORCE PROD MODE FOR DEBUGGING
const DEV_URL = "http://localhost:3000";

let PROD_URL = ""; // Will be set once the local server starts
let mainWindow = null;
let backendProcess = null;

// ─── Free a port by killing any process using it ─────────────────────────────
function killProcessOnPort(port) {
  try {
    const result = execSync(`netstat -ano | findstr ":${port} "`, { encoding: "utf8" });
    const lines = result.trim().split("\n");
    const pids = new Set();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      // parts: [Proto, LocalAddress, ForeignAddress, State, PID]
      if (parts.length >= 5) {
        const localAddr = parts[1] || "";
        if (localAddr.endsWith(`:${port}`)) {
          const pid = parts[4];
          if (pid && pid !== "0") pids.add(pid);
        }
      }
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { encoding: "utf8" });
        console.log(`[port-cleanup] Killed PID ${pid} which was holding port ${port}`);
      } catch (e) {
        console.log(`[port-cleanup] Could not kill PID ${pid}:`, e.message);
      }
    }
  } catch (e) {
    // findstr exits non-zero when no match — that's fine, port is free
    console.log(`[port-cleanup] Port ${port} is free or netstat failed:`, e.message);
  }
}

function startBackendServer() {
  const backendPath = app.isPackaged 
    ? path.join(process.resourcesPath, "backend-server.exe")
    : path.join(__dirname, "backend", "backend-server.exe");

  console.log("Starting backend at:", backendPath);
  
  if (!fs.existsSync(backendPath)) {
    console.error("BACKEND EXE NOT FOUND at:", backendPath);
    dialog.showErrorBox("Backend Missing", `Could not find backend at:\n${backendPath}`);
    return;
  }

  // Free port 8000 if a stale process is holding it
  console.log("[port-cleanup] Ensuring port 8000 is free...");
  killProcessOnPort(8000);

  try {
    const userDataPath = app.getPath("userData");
    const dbPath = path.join(userDataPath, "krypts.db");
    const dbUrl = `sqlite+aiosqlite:///${dbPath.replace(/\\/g, "/")}`;
    const logPath = path.join(userDataPath, "backend.log");

    console.log("Backend DB path:", dbPath);
    console.log("Backend log:", logPath);

    const logStream = fs.openSync(logPath, "a");

    backendProcess = spawn(backendPath, [], {
      cwd: path.dirname(backendPath),
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        JWT_SECRET_KEY: "krypts-super-secret-jwt-key-change-in-prod-2024",
        JWT_ALGORITHM: "HS256",
        ACCESS_TOKEN_EXPIRE_MINUTES: "60",
        MASTER_KEK: "krypts-master-kek-32bytes-change!!",
        ADMIN_EMAIL: "admin@krypts.com",
        RAPID_SESSION_THRESHOLD_SECONDS: "120",
        RATE_LIMIT_REQUESTS: "60",
        RATE_LIMIT_WINDOW_SECONDS: "60",
      },
      stdio: ["ignore", logStream, logStream]
    });

    backendProcess.on("error", (err) => {
      console.error("Backend process error:", err);
    });
    backendProcess.on("exit", (code, signal) => {
      console.log(`Backend exited with code ${code}, signal ${signal}`);
      console.log("Check log at:", logPath);
    });

  } catch (err) {
    console.error("Failed to start backend:", err);
  }
}


// ─── Local Static Server for Next.js Export ───────────────────────────────
function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let parsedUrl = url.parse(req.url);
      let pathname = decodeURIComponent(parsedUrl.pathname);
      if (pathname === "/") pathname = "/index.html";

      // If it doesn't have an extension, try appending .html (Next.js export behavior)
      if (!path.extname(pathname)) {
         pathname += ".html";
      }

      let filePath = path.join(__dirname, "out", pathname);
      const ext = path.extname(filePath);

      const mimeTypes = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".woff": "application/font-woff",
        ".woff2": "application/font-woff2",
        ".ttf": "application/font-ttf"
      };

      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
           console.log("404 Not Found:", filePath);
           // For 404s, Next.js static export generates a 404.html
           filePath = path.join(__dirname, "out", "404.html");
           fs.stat(filePath, (err404, stats404) => {
             if (err404 || !stats404.isFile()) {
               res.writeHead(404);
               res.end("404 Not Found");
               return;
             }
             res.writeHead(404, { "Content-Type": "text/html" });
             fs.createReadStream(filePath).pipe(res);
           });
           return;
        }
        res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
        fs.createReadStream(filePath).pipe(res);
        console.log("200 OK Served:", filePath);
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      console.log("Local server running at:", `http://127.0.0.1:${port}`);
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

// ─── Deep Link URL → Next.js path converter ──────────────────────────────────
// Converts: krypts://view/image?file_id=xxx&token=yyy
//       to: http://127.0.0.1:<port>/view/image?file_id=xxx&token=yyy
function kryptsUrlToLocal(rawUrl) {
  const baseUrl = DEV_MODE ? DEV_URL : PROD_URL;
  try {
    const parsed = new URL(rawUrl); // e.g. krypts://view/image?file_id=...&token=...
    const pathname = `/${parsed.host}${parsed.pathname}`.replace(/\/+/g, "/"); // view/image
    const search = parsed.search; // ?file_id=...&token=...
    return `${baseUrl}${pathname}${search}`;
  } catch {
    return baseUrl;
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
  app.quit();
} else {
  // Handle the deep link when the app is already open (second-instance event)
  app.on("second-instance", (_event, commandLine) => {
    // The deep link URL is the last item in commandLine on Windows
    const deepLinkUrl = commandLine.find((arg) => arg.startsWith("krypts://"));
    const localUrl = deepLinkUrl ? kryptsUrlToLocal(deepLinkUrl) : null;

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    if (localUrl) {
      openProtectedViewer(localUrl);
    }
  });

  app.whenReady().then(async () => {
    // Start bundled Python backend
    startBackendServer();

    // In production, start the local static server
    if (!DEV_MODE) {
      PROD_URL = await startLocalServer();
      
      // Enforce auto-updates only in production builds
      autoUpdater.checkForUpdatesAndNotify();

      autoUpdater.on("update-downloaded", (info) => {
        dialog.showMessageBox({
          type: "warning",
          buttons: ["Install Update"],
          defaultId: 0,
          cancelId: 0,
          title: "Mandatory Update Required",
          message: `A new mandatory update (Version ${info.version}) has been downloaded.`,
          detail: "Krypts DRM must be updated to continue. The application will now restart to install the update."
        }).then(() => {
          autoUpdater.quitAndInstall();
        });
      });
    }

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

  app.on("will-quit", () => {
    if (backendProcess) {
      backendProcess.kill();
    }
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
