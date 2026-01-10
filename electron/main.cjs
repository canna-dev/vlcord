const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let serverProcess = null;
let quitting = false;
let serverLogPath = null;
let serverLogTail = [];

const DEFAULT_PORT = 7100;

function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // ignore
  }
}

function pushTailLines(text) {
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    serverLogTail.push(line);
  }
  if (serverLogTail.length > 200) {
    serverLogTail = serverLogTail.slice(serverLogTail.length - 200);
  }
}

function getIconPath() {
  // In production, electron-builder will place icon.ico in process.resourcesPath
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico');
  }
  return path.join(__dirname, '..', 'assets', 'icon.ico');
}

function getUserDataPaths() {
  const userDataDir = app.getPath('userData');
  return {
    configPath: path.join(userDataDir, 'vlcord-config.json'),
    overridesPath: path.join(userDataDir, 'metadata-overrides.json'),
    logsDir: path.join(userDataDir, 'logs'),
  };
}

function startServer() {
  const appPath = app.getAppPath();
  const tsxCli = path.join(appPath, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const serverEntry = path.join(appPath, 'src', 'main.ts');
  const { configPath, overridesPath, logsDir } = getUserDataPaths();

  // When packaged, the esbuild binary must live outside app.asar.
  // electron-builder puts unpacked files under resources/app.asar.unpacked.
  const esbuildBinaryPath = app.isPackaged
    ? path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        '@esbuild',
        'win32-x64',
        'esbuild.exe'
      )
    : path.join(appPath, 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe');

  ensureDir(logsDir);
  serverLogPath = path.join(logsDir, 'server.log');
  serverLogTail = [];
  // Use sync writes for the header so we always get *something* even if the process crashes immediately.
  try {
    fs.appendFileSync(serverLogPath, `\n--- VLCord server start ${new Date().toISOString()} ---\n`);
    fs.appendFileSync(
      serverLogPath,
      `ESBUILD_BINARY_PATH=${esbuildBinaryPath} exists=${fs.existsSync(esbuildBinaryPath)}\n`
    );
  } catch {
    // ignore
  }
  const logStream = fs.createWriteStream(serverLogPath, { flags: 'a' });

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    ESBUILD_BINARY_PATH: esbuildBinaryPath,
    VLCORD_CONFIG_PATH: configPath,
    VLCORD_METADATA_OVERRIDES_PATH: overridesPath,
    VLCORD_LOG_DIR: logsDir,
    // Prefer binding locally for desktop app
    WEB_PORT: String(process.env.WEB_PORT || process.env.PORT || DEFAULT_PORT),
  };

  // Also set on the parent process env to help any modules that read it before spawn.
  process.env.ESBUILD_BINARY_PATH = esbuildBinaryPath;

  // Run the server using Electron's embedded Node
  serverProcess = spawn(process.execPath, [tsxCli, serverEntry], {
    env,
    stdio: 'pipe',
    windowsHide: true,
  });

  if (serverProcess.stdout) {
    serverProcess.stdout.on('data', (buf) => {
      const text = buf.toString('utf8');
      pushTailLines(text);
      logStream.write(text);
    });
  }
  if (serverProcess.stderr) {
    serverProcess.stderr.on('data', (buf) => {
      const text = buf.toString('utf8');
      pushTailLines(text);
      logStream.write(text);
    });
  }

  serverProcess.on('exit', (code) => {
    if (quitting) return;
    try {
      logStream.write(`\n--- VLCord server exit code ${code ?? 'unknown'} ${new Date().toISOString()} ---\n`);
      logStream.end();
    } catch {
      // ignore
    }

    const tail = serverLogTail.slice(-30).join('\n');
    const extra = serverLogPath ? `\n\nLog: ${serverLogPath}` : '';
    const details = tail ? `\n\nLast output:\n${tail}` : '';
    dialog.showErrorBox('VLCord stopped', `The background server exited (code ${code ?? 'unknown'}).${extra}${details}`);
    app.quit();
  });

  serverProcess.on('error', (err) => {
    try {
      logStream.write(`\n--- VLCord server spawn error ${new Date().toISOString()} ---\n${err?.stack || err?.message || String(err)}\n`);
      logStream.end();
    } catch {
      // ignore
    }
    dialog.showErrorBox('Failed to start VLCord', err?.message || String(err));
    app.quit();
  });
}

async function waitForServerReady(port, timeoutMs = 12000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { cache: 'no-store' });
      if (res.ok) return true;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  return false;
}

function createMainWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Close button should minimize to tray
  mainWindow.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  const iconPath = getIconPath();
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image);
  tray.setToolTip('VLCord');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show VLCord',
      click: () => {
        if (!mainWindow) return;
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: 'Hide',
      click: () => {
        if (!mainWindow) return;
        mainWindow.hide();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });
}

function setAppMenu() {
  const template = [
    {
      label: 'VLCord',
      submenu: [
        {
          label: 'Show',
          click: () => {
            if (!mainWindow) return;
            mainWindow.show();
            mainWindow.focus();
          },
        },
        {
          label: 'Quit',
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  setAppMenu();
  createTray();

  ipcMain.handle('vlcord:quit', async () => {
    quitting = true;
    app.quit();
    return true;
  });

  ipcMain.handle('vlcord:show', async () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
    return true;
  });

  startServer();

  const port = Number(process.env.WEB_PORT || process.env.PORT || DEFAULT_PORT);
  const ok = await waitForServerReady(port);
  if (!ok) {
    dialog.showErrorBox('VLCord failed to start', `Could not reach http://127.0.0.1:${port}/health`);
    quitting = true;
    app.quit();
    return;
  }

  createMainWindow(port);
});

app.on('before-quit', () => {
  quitting = true;

  try {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill();
    }
  } catch {
    // ignore
  }
});

app.on('window-all-closed', (e) => {
  // Keep running in tray
  e.preventDefault();
});
