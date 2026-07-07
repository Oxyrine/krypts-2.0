/**
 * Electron Dev Launcher
 *
 * Starts the Next.js dev server and waits until it is ready,
 * then launches the Electron window pointing at localhost:3000.
 *
 * Run via:  npm run desktop  (from cmd, not PowerShell)
 */

const { spawn } = require("child_process");
const net = require("net");

const NEXT_PORT = 3000;
const POLL_INTERVAL_MS = 500;
const MAX_WAIT_MS = 120_000;

function waitForPort(port, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function attempt() {
      const socket = new net.Socket();
      socket.setTimeout(300);
      socket
        .on("connect", () => {
          socket.destroy();
          resolve();
        })
        .on("error", () => {
          socket.destroy();
          if (Date.now() - start > timeout) {
            reject(new Error(`Timed out waiting for port ${port}`));
          } else {
            setTimeout(attempt, POLL_INTERVAL_MS);
          }
        })
        .on("timeout", () => {
          socket.destroy();
          setTimeout(attempt, POLL_INTERVAL_MS);
        })
        .connect(port, "127.0.0.1");
    }

    attempt();
  });
}

// shell:true is required on Windows for .cmd executables (npm, npx)
const isWin = process.platform === "win32";
const spawnOpts = { stdio: "inherit", shell: true };

// 1. Start the Next.js dev server
const nextProcess = spawn("npm", ["run", "dev"], {
  ...spawnOpts,
  env: { ...process.env },
});

nextProcess.on("error", (err) => {
  console.error("❌  Failed to start Next.js:", err.message);
  process.exit(1);
});

console.log("⏳  Waiting for Next.js to become ready on port", NEXT_PORT, "...");

// 2. Once the port is open, launch Electron
waitForPort(NEXT_PORT, MAX_WAIT_MS)
  .then(() => {
    console.log("✅  Next.js is ready — launching Electron window");

    const electronBin = isWin
      ? ".\\node_modules\\.bin\\electron"
      : "./node_modules/.bin/electron";

    const electronProcess = spawn(electronBin, ["."], {
      ...spawnOpts,
      env: { ...process.env, NODE_ENV: "development" },
    });

    electronProcess.on("error", (err) => {
      console.error("❌  Failed to start Electron:", err.message);
      nextProcess.kill();
      process.exit(1);
    });

    electronProcess.on("close", () => {
      nextProcess.kill();
      process.exit(0);
    });
  })
  .catch((err) => {
    console.error("❌  Failed to launch:", err.message);
    nextProcess.kill();
    process.exit(1);
  });

// Clean up if this script is killed
process.on("SIGINT", () => {
  nextProcess.kill();
  process.exit(0);
});
