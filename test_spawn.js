const { spawn } = require('child_process');
const path = require('path');

const backendPath = path.join(__dirname, "dist", "win-unpacked", "resources", "backend-server.exe");
const dbUrl = "sqlite+aiosqlite:///C:/Users/aakas/AppData/Roaming/krypts-desktop/krypts.db";

const p = spawn(backendPath, [], {
  cwd: path.dirname(backendPath),
  env: { ...process.env, DATABASE_URL: dbUrl },
  stdio: "ignore"
});

p.on('exit', (code) => {
  console.log(`Backend exited with code ${code}`);
});

p.on('error', (err) => {
  console.error(`Spawn error: ${err}`);
});

setTimeout(() => {
  console.log("3 seconds passed, backend is still running!");
  p.kill();
}, 3000);
