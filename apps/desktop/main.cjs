"use strict";

const { app, BrowserWindow, Menu, ipcMain, Notification, dialog } = require("electron");
const path = require("path");

const db = require("./database.cjs");

const startUrl = process.env.ELECTRON_START_URL;
const isDev = Boolean(startUrl);

// Auto-update (only in production, not in dev)
let autoUpdater = null;
if (!isDev) {
  try {
    autoUpdater = require("electron-updater").autoUpdater;
  } catch {
    autoUpdater = null;
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 880,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  if (isDev) {
    void win.loadURL(startUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexHtml = app.isPackaged
      ? path.join(process.resourcesPath, "web-dist", "index.html")
      : path.join(__dirname, "../web/dist/index.html");
    void win.loadFile(indexHtml);
  }
}

// ---------------------------------------------------------------------------
// Database IPC handlers
// ---------------------------------------------------------------------------

function registerDbHandlers() {
  // Projects
  ipcMain.handle("db:projects:get-all", () => db.getAllProjects());
  ipcMain.handle("db:projects:upsert", (_evt, project) => db.upsertProject(project));
  ipcMain.handle("db:projects:soft-delete", (_evt, id) => { db.softDeleteProject(id); return true; });

  // Tags
  ipcMain.handle("db:tags:get-all", () => db.getAllTags());
  ipcMain.handle("db:tags:upsert", (_evt, tag) => db.upsertTag(tag));
  ipcMain.handle("db:tags:soft-delete", (_evt, id) => { db.softDeleteTag(id); return true; });

  // Tasks
  ipcMain.handle("db:tasks:get-all", () => db.getAllTasks());
  ipcMain.handle("db:tasks:upsert", (_evt, task) => db.upsertTask(task));
  ipcMain.handle("db:tasks:soft-delete", (_evt, id) => { db.softDeleteTask(id); return true; });
}

// ---------------------------------------------------------------------------
// Notification handler
// ---------------------------------------------------------------------------

function registerNotificationHandlers() {
  ipcMain.handle("notify", (_evt, { title, body }) => {
    if (!Notification.isSupported()) return false;
    try {
      new Notification({ title, body }).show();
      return true;
    } catch {
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// Auto-update
// ---------------------------------------------------------------------------

function setupAutoUpdater() {
  if (!autoUpdater || !app.isPackaged) return;

  autoUpdater.logger = console;

  autoUpdater.on("checking-for-update", () => {
    console.log("[AutoUpdater] Checking for update...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[AutoUpdater] Update available:", info.version);
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[AutoUpdater] Update not available");
  });

  autoUpdater.on("download-progress", (progress) => {
    console.log(`[AutoUpdater] Download progress: ${progress.percent.toFixed(1)}%`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("[AutoUpdater] Update downloaded:", info.version);
    // Show dialog to user
    dialog.showMessageBox({
      type: "info",
      title: "更新已就绪",
      message: `TaskTick ${info.version} 已下载完成。\n重启后将自动安装新版本。`,
      buttons: ["立即重启", "稍后"],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  autoUpdater.on("error", (err) => {
    console.error("[AutoUpdater] Error:", err.message);
  });

  // Check for updates after app starts (with delay to not block startup)
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error("[AutoUpdater] Check failed:", err.message);
    });
  }, 3000);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  // Init SQLite so data is ready before first render
  await db.initDatabase();

  registerDbHandlers();
  registerNotificationHandlers();
  setupAutoUpdater();

  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
