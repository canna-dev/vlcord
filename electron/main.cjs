const { app, BrowserWindow, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let tray = null;
let serverProcess = null;
let quitting = false;

const DEFAULT_PORT = 7100;

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
  const serverEntry = path.join(appPath, 'dist', 'main.js');
  const { configPath, overridesPath, logsDir } = getUserDataPaths();

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    VLCORD_CONFIG_PATH: configPath,
    VLCORD_METADATA_OVERRIDES_PATH: overridesPath,
    VLCORD_LOG_DIR: logsDir,
    // Prefer binding locally for desktop app
    WEB_PORT: String(process.env.WEB_PORT || process.env.PORT || DEFAULT_PORT),
  };

  // Run the server using Electron's embedded Node
  serverProcess = spawn(process.execPath, [serverEntry], {
    env,
    stdio: 'pipe',
    windowsHide: true,
  });

  serverProcess.on('exit', (code) => {
    if (quitting) return;
    dialog.showErrorBox('VLCord stopped', `The background server exited (code ${code ?? 'unknown'}).`);
    app.quit();
  });

  serverProcess.on('error', (err) => {
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
