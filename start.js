// Wrapper to start Electron without ELECTRON_RUN_AS_NODE env var
const { spawn } = require('child_process');
const path = require('path');

// Spawn electron.exe directly, passing clean environment
const electronExe = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
const args = process.argv.slice(2);

const child = spawn(electronExe, [__dirname, ...args], {
  stdio: 'inherit',
  env: Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE')
  )
});

child.on('close', (code) => {
  process.exit(code);
});
