import path from "node:path";

import { BrowserWindow, Menu, app, type WebContents } from "electron";

import type { ShellDestinationId } from "../shared/contracts";
import { hardenShellContents } from "./security";
import { createServiceView, layoutServiceView } from "./service-view";

interface WindowOptions {
  onRendererCrash(reason: string): void;
  userAgent: string;
}

export interface ShellWindow {
  window: BrowserWindow;
  /** The embedded Discord surface — the target for input, shortcuts, and PulseCore. */
  serviceContents: WebContents;
  /** Puts one shell destination on screen, hiding the Discord surface for PulseCord's own screens. */
  showDestination(destination: ShellDestinationId): void;
}

export function createMainWindow({ onRendererCrash, userAgent }: WindowOptions): ShellWindow {
  const developmentIcon = path.join(app.getAppPath(), "build", "icon.png");

  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    show: false,
    title: "PulseCord",
    backgroundColor: "#101218",
    ...(!app.isPackaged ? { icon: developmentIcon } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "shell.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged
    }
  });

  Menu.setApplicationMenu(null);
  hardenShellContents(window.webContents);

  window.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") onRendererCrash(details.reason);
  });

  const serviceView = createServiceView({ userAgent, onCrash: onRendererCrash });
  window.contentView.addChildView(serviceView);
  layoutServiceView(window, serviceView);
  window.on("resize", () => layoutServiceView(window, serviceView));

  /**
   * Switching destinations only changes whether the Discord view is on screen.
   * The view itself is kept alive and merely detached, so the Discord session,
   * its voice connection, and PulseCore's state all survive a trip through
   * PulseCord's own screens — reloading Discord to look at a settings page
   * would be both slow and destructive.
   */
  const showDestination = (destination: ShellDestinationId): void => {
    if (window.isDestroyed() || serviceView.webContents.isDestroyed()) return;

    const shouldShowService = destination === "discord";
    const isAttached = window.contentView.children.includes(serviceView);
    if (shouldShowService === isAttached) return;

    if (shouldShowService) {
      window.contentView.addChildView(serviceView);
      layoutServiceView(window, serviceView);
    } else {
      window.contentView.removeChildView(serviceView);
    }
  };

  window.once("ready-to-show", () => window.show());
  void window.loadFile(path.join(__dirname, "shell.html"));

  return { window, serviceContents: serviceView.webContents, showDestination };
}
