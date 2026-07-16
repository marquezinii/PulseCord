import { app, BrowserWindow, ipcMain, session, shell } from "electron";

import { IPC, isBuiltinPluginId, type RuntimeEnvironment } from "../shared/contracts";
import { configureDesktopIdentity } from "./desktop-identity";
import { RecoveryStore } from "./recovery-store";
import { isTrustedIpcSender, configureSession } from "./security";
import { SettingsStore } from "./settings-store";
import { disablePulseCordAutoStart } from "./startup";
import { createMainWindow } from "./window";

const safeMode = process.argv.includes("--safe-mode");
let mainWindow: BrowserWindow | undefined;

app.setName("PulseCord");
if (process.platform === "win32") app.setAppUserModelId("app.pulsecord.desktop");

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    const settings = new SettingsStore(app.getPath("userData"));
    const recovery = new RecoveryStore(app.getPath("userData"));

    await disablePulseCordAutoStart();
    registerIpc(settings);
    configureSession(session.defaultSession);
    configureDesktopIdentity(session.defaultSession);

    const openWindow = (): void => {
      if (mainWindow && !mainWindow.isDestroyed()) return;

      mainWindow = createMainWindow({
        onRendererCrash: (reason) => {
          void handleRendererCrash(recovery, reason);
        }
      });

      mainWindow.on("closed", () => {
        mainWindow = undefined;
      });

      setTimeout(() => {
        void recovery.markStable();
      }, 60_000).unref();
    };

    openWindow();
    app.on("activate", openWindow);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

function registerIpc(settings: SettingsStore): void {
  const senderUrl = (event: Electron.IpcMainInvokeEvent): string => {
    return event.senderFrame?.url ?? event.sender.getURL();
  };

  const assertSender = (url: string): void => {
    if (!isTrustedIpcSender(url)) throw new Error("PulseCord rejected IPC from an untrusted page.");
  };

  ipcMain.handle(IPC.environment, (event): RuntimeEnvironment => {
    assertSender(senderUrl(event));
    return {
      appVersion: app.getVersion(),
      platform: process.platform,
      safeMode
    };
  });

  ipcMain.handle(IPC.settingsGet, async (event) => {
    assertSender(senderUrl(event));
    return settings.get();
  });

  ipcMain.handle(IPC.pluginSetEnabled, async (event, id: unknown, enabled: unknown) => {
    assertSender(senderUrl(event));
    if (!isBuiltinPluginId(id) || typeof enabled !== "boolean") {
      throw new TypeError("Invalid plugin settings update.");
    }
    return settings.setPluginEnabled(id, enabled);
  });

  ipcMain.handle(IPC.welcomeSeen, async (event) => {
    assertSender(senderUrl(event));
    return settings.markWelcomeSeen();
  });

  ipcMain.handle(IPC.openDataFolder, async (event) => {
    assertSender(senderUrl(event));
    const result = await shell.openPath(app.getPath("userData"));
    if (result) throw new Error(result);
  });

  ipcMain.handle(IPC.relaunch, (event, requestedSafeMode: unknown) => {
    assertSender(senderUrl(event));
    if (typeof requestedSafeMode !== "boolean") throw new TypeError("Invalid relaunch mode.");
    relaunch(requestedSafeMode);
  });
}

async function handleRendererCrash(recovery: RecoveryStore, reason: string): Promise<void> {
  console.error(`[PulseCord] Renderer stopped: ${reason}`);
  const shouldUseSafeMode = await recovery.recordCrash();
  if (shouldUseSafeMode && !safeMode) relaunch(true);
}

function relaunch(requestedSafeMode: boolean): void {
  const args = process.argv.slice(1).filter((argument) => argument !== "--safe-mode");
  if (requestedSafeMode) args.push("--safe-mode");
  app.relaunch({ args });
  app.exit(0);
}
