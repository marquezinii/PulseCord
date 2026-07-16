import path from "node:path";

import { BrowserWindow, Menu, app } from "electron";

import { hardenWindow } from "./security";

const DISCORD_APP_URL = "https://discord.com/app";

interface WindowOptions {
  onRendererCrash(reason: string): void;
}

export function createMainWindow({ onRendererCrash }: WindowOptions): BrowserWindow {
  const developmentIcon = path.join(app.getAppPath(), "build", "icon.png");

  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    show: false,
    title: "PulseCord",
    backgroundColor: "#111319",
    ...(!app.isPackaged ? { icon: developmentIcon } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
      devTools: !app.isPackaged
    }
  });

  Menu.setApplicationMenu(null);
  hardenWindow(window);

  const repairInvalidZoom = (): void => {
    const zoomFactor = window.webContents.getZoomFactor();
    if (!Number.isFinite(zoomFactor) || zoomFactor < 0.5 || zoomFactor > 2) {
      window.webContents.setZoomFactor(1);
    }
  };

  repairInvalidZoom();
  window.webContents.on("did-finish-load", repairInvalidZoom);

  window.once("ready-to-show", () => window.show());
  window.webContents.on("page-title-updated", (event) => {
    event.preventDefault();
    window.setTitle("PulseCord");
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") onRendererCrash(details.reason);
  });

  window.webContents.on("did-fail-load", (_event, errorCode, _description, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || window.isDestroyed()) return;
    void window.loadFile(path.join(__dirname, "offline.html"));
  });

  void window.loadURL(DISCORD_APP_URL);
  return window;
}
