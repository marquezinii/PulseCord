import { randomUUID } from "node:crypto";

import { app, BrowserWindow, ipcMain, session, shell } from "electron";

import {
  IPC,
  isActivitySnapshot,
  isBuiltinPluginId,
  isCustomCss,
  isHomeIconPreference,
  isPluginDataBucket,
  isShellDestinationId,
  isShortcutAccelerator,
  isShortcutAction,
  isShortcutBindingId,
  isStoredShortcutAccelerator,
  isTrustedDiscordUrl,
  type AppSettings,
  type ShellDestinationId,
  type ShortcutAction,
  type ShortcutBinding,
  type RuntimeEnvironment
} from "../shared/contracts";
import { ActivityStore } from "./activity-store";
import { configureDesktopIdentity, createDesktopUserAgent } from "./desktop-identity";
import { RecoveryStore } from "./recovery-store";
import { isShellPageSender, isTrustedIpcSender, configureSession } from "./security";
import { SettingsStore } from "./settings-store";
import { ShortcutManager } from "./shortcut-manager";
import { disablePulseCordAutoStart } from "./startup";
import { createMainWindow } from "./window";

const safeMode = process.argv.includes("--safe-mode");
let mainWindow: BrowserWindow | undefined;
let serviceContents: Electron.WebContents | undefined;
/** Set once the shell window exists; switches which destination is on screen. */
let showDestination: ((destination: ShellDestinationId) => void) | undefined;

app.setName("PulseCord");
if (process.platform === "win32") app.setAppUserModelId("app.pulsecord.desktop");
const desktopUserAgent = createDesktopUserAgent(app.getVersion());
app.userAgentFallback = desktopUserAgent;

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
    const activity = new ActivityStore();
    const shortcuts = new ShortcutManager(
      () => mainWindow,
      () => serviceContents
    );

    await disablePulseCordAutoStart();
    const unavailableShortcuts = shortcuts.configure(await settings.get());
    if (unavailableShortcuts.length > 0) {
      console.warn(`[PulseCord] ${unavailableShortcuts.length} saved shortcut(s) could not be registered.`);
    }
    registerIpc(settings, shortcuts, activity);
    configureSession(session.defaultSession, () => mainWindow);
    configureDesktopIdentity(session.defaultSession, desktopUserAgent);

    const openWindow = (): void => {
      if (mainWindow && !mainWindow.isDestroyed()) return;

      const shell = createMainWindow({
        userAgent: desktopUserAgent,
        onRendererCrash: (reason) => {
          void handleRendererCrash(recovery, reason);
        }
      });
      mainWindow = shell.window;
      serviceContents = shell.serviceContents;
      showDestination = shell.showDestination;

      const unsubscribeActivity = activity.subscribe((snapshot) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send(IPC.activitySnapshotChanged, snapshot);
      });

      // The reading describes a live Discord surface; once that surface is
      // gone, the last count is no longer something PulseCord can vouch for.
      serviceContents.once("destroyed", () => activity.clear());

      mainWindow.on("closed", () => {
        unsubscribeActivity();
        mainWindow = undefined;
        serviceContents = undefined;
        showDestination = undefined;
      });

      setTimeout(() => {
        void recovery.markStable();
      }, 60_000).unref();
    };

    openWindow();
    app.on("activate", openWindow);
    app.once("will-quit", () => shortcuts.dispose());
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

function registerIpc(settings: SettingsStore, shortcuts: ShortcutManager, activity: ActivityStore): void {
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

  ipcMain.handle(IPC.shortcutCreate, async (event, action: unknown, accelerator: unknown) => {
    assertSender(senderUrl(event));
    if (!isShortcutAction(action) || !isStoredShortcutAccelerator(accelerator)) {
      throw new TypeError("Invalid desktop shortcut update.");
    }
    return createShortcut(settings, shortcuts, action, accelerator);
  });

  ipcMain.handle(
    IPC.shortcutUpdate,
    async (event, id: unknown, action: unknown, accelerator: unknown) => {
      assertSender(senderUrl(event));
      if (!isShortcutBindingId(id) || !isShortcutAction(action) || !isStoredShortcutAccelerator(accelerator)) {
        throw new TypeError("Invalid desktop shortcut update.");
      }
      return updateShortcut(settings, shortcuts, id, action, accelerator);
    }
  );

  ipcMain.handle(IPC.shortcutRemove, async (event, id: unknown) => {
    assertSender(senderUrl(event));
    if (!isShortcutBindingId(id)) throw new TypeError("Invalid desktop shortcut removal.");
    return removeShortcut(settings, shortcuts, id);
  });

  ipcMain.handle(IPC.pluginDataGet, async (event, id: unknown) => {
    assertSender(senderUrl(event));
    if (!isBuiltinPluginId(id)) throw new TypeError("Invalid plugin id.");
    return settings.getPluginData(id);
  });

  ipcMain.handle(IPC.pluginDataSet, async (event, id: unknown, data: unknown) => {
    assertSender(senderUrl(event));
    if (!isBuiltinPluginId(id) || !isPluginDataBucket(data)) throw new TypeError("Invalid plugin data update.");
    return settings.setPluginData(id, data);
  });

  ipcMain.handle(IPC.shortcutRegistrationsGet, (event) => {
    assertSender(senderUrl(event));
    return shortcuts.getRegisteredIds();
  });

  // Compatibility for development builds created before binding IDs were introduced.
  ipcMain.handle(IPC.shortcutSet, async (event, action: unknown, accelerator: unknown) => {
    assertSender(senderUrl(event));
    if (!isShortcutAction(action) || !isShortcutAccelerator(accelerator)) {
      throw new TypeError("Invalid desktop shortcut update.");
    }

    const current = await settings.get();
    const existing = current.shortcuts.bindings.find((binding) => binding.action === action);
    if (accelerator === null) {
      return existing ? removeShortcut(settings, shortcuts, existing.id) : current;
    }
    return existing
      ? updateShortcut(settings, shortcuts, existing.id, action, accelerator)
      : createShortcut(settings, shortcuts, action, accelerator);
  });

  ipcMain.handle(IPC.themeSet, async (event, customCss: unknown, enabled: unknown) => {
    assertSender(senderUrl(event));
    if (!isCustomCss(customCss) || typeof enabled !== "boolean") {
      throw new TypeError("Invalid custom theme update.");
    }
    return settings.setTheme(customCss, enabled);
  });

  ipcMain.handle(IPC.homeIconSet, async (event, preference: unknown) => {
    assertSender(senderUrl(event));
    if (!isHomeIconPreference(preference)) throw new TypeError("Invalid home icon preference.");
    return settings.setHomeIcon(preference);
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

  // Only the Discord surface may report readings of Discord's own state, and
  // only the shell may read them back or move itself between destinations.
  ipcMain.on(IPC.activityReport, (event, snapshot: unknown) => {
    const url = event.senderFrame?.url ?? event.sender.getURL();
    if (!isTrustedDiscordUrl(url) || !isActivitySnapshot(snapshot)) return;
    activity.set(snapshot);
  });

  ipcMain.handle(IPC.activitySnapshotGet, (event) => {
    if (!isShellPageSender(senderUrl(event))) {
      throw new Error("PulseCord rejected an activity read from outside the shell.");
    }
    return activity.get();
  });

  ipcMain.handle(IPC.shellNavigate, (event, destination: unknown) => {
    if (!isShellPageSender(senderUrl(event))) {
      throw new Error("PulseCord rejected navigation from outside the shell.");
    }
    if (!isShellDestinationId(destination)) throw new TypeError("Unknown shell destination.");
    showDestination?.(destination);
  });
}

async function createShortcut(
  settings: SettingsStore,
  shortcuts: ShortcutManager,
  action: ShortcutAction,
  accelerator: string
): Promise<AppSettings> {
  const binding: ShortcutBinding = { id: randomUUID(), action, accelerator };
  if (!shortcuts.create(binding)) throw new Error("That shortcut is unavailable or already in use.");

  try {
    return await settings.createShortcut(binding);
  } catch (error) {
    shortcuts.remove(binding.id);
    throw error;
  }
}

async function updateShortcut(
  settings: SettingsStore,
  shortcuts: ShortcutManager,
  id: string,
  action: ShortcutAction,
  accelerator: string
): Promise<AppSettings> {
  const current = await settings.get();
  const previous = current.shortcuts.bindings.find((binding) => binding.id === id);
  if (!previous) throw new Error("Shortcut not found.");

  const wasRegistered = Boolean(shortcuts.get(id));
  const runtimeUpdated = wasRegistered
    ? shortcuts.update(id, action, accelerator)
    : shortcuts.create({ id, action, accelerator });
  if (!runtimeUpdated) throw new Error("That shortcut is unavailable or already in use.");

  try {
    return await settings.updateShortcut(id, action, accelerator);
  } catch (error) {
    shortcuts.remove(id);
    if (wasRegistered) shortcuts.create(previous);
    throw error;
  }
}

async function removeShortcut(
  settings: SettingsStore,
  shortcuts: ShortcutManager,
  id: string
): Promise<AppSettings> {
  const current = await settings.get();
  const previous = current.shortcuts.bindings.find((binding) => binding.id === id);
  if (!previous) throw new Error("Shortcut not found.");

  const wasRegistered = Boolean(shortcuts.get(id));
  if (wasRegistered) shortcuts.remove(id);
  try {
    return await settings.removeShortcut(id);
  } catch (error) {
    if (wasRegistered) shortcuts.create(previous);
    throw error;
  }
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
