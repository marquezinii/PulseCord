import path from "node:path";

import { WebContentsView, type BrowserWindow } from "electron";

import { computeServiceViewBounds } from "../shared/shell-layout";
import { hardenServiceContents } from "./security";

const DISCORD_APP_URL = "https://discord.com/app";

interface ServiceViewOptions {
  userAgent: string;
  onCrash(reason: string): void;
}

/**
 * Creates the view that hosts the connected Discord service inside the shell.
 *
 * This is a sibling render surface, not a nested document: PulseCord owns the
 * window and its chrome, and Discord is rendered into a region of it. That
 * keeps Discord's own page, session, and preload exactly as they were when it
 * filled the whole window — PulseCord reimplements none of it — while the
 * shell is free to put its own navigation and future screens around it.
 */
export function createServiceView({ userAgent, onCrash }: ServiceViewOptions): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true
    }
  });

  const { webContents } = view;
  webContents.setUserAgent(userAgent);
  hardenServiceContents(webContents);

  const repairInvalidZoom = (): void => {
    const zoomFactor = webContents.getZoomFactor();
    if (!Number.isFinite(zoomFactor) || zoomFactor < 0.5 || zoomFactor > 2) webContents.setZoomFactor(1);
  };

  repairInvalidZoom();
  webContents.on("did-finish-load", repairInvalidZoom);

  webContents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") onCrash(details.reason);
  });

  webContents.on("did-fail-load", (_event, errorCode, _description, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || webContents.isDestroyed()) return;
    void webContents.loadFile(path.join(__dirname, "offline.html"));
  });

  void webContents.loadURL(DISCORD_APP_URL);
  return view;
}

/** Keeps the service view filling the shell's content area as the window resizes. */
export function layoutServiceView(window: BrowserWindow, view: WebContentsView): void {
  if (window.isDestroyed() || view.webContents.isDestroyed()) return;
  const [width = 0, height = 0] = window.getContentSize();
  view.setBounds(computeServiceViewBounds({ width, height }));
}
