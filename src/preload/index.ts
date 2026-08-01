import { contextBridge, ipcRenderer } from "electron";

import { bootPulseCord } from "../renderer/bootstrap";
import {
  IPC,
  isShortcutAction,
  isTrustedDiscordUrl,
  type ActivitySnapshot,
  type BuiltinPluginId,
  type HomeIconPreference,
  type JsonValue,
  type NativeBridge,
  type ShortcutAccelerator,
  type ShortcutAction
} from "../shared/contracts";
import { installDesktopGatewayIdentity } from "./desktop-identity";

if (isTrustedDiscordUrl(window.location.href)) installDesktopGatewayIdentity(navigator.userAgent);

const bridge: NativeBridge = Object.freeze({
  getEnvironment: () => ipcRenderer.invoke(IPC.environment),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setPluginEnabled: (id: BuiltinPluginId, enabled: boolean) => ipcRenderer.invoke(IPC.pluginSetEnabled, id, enabled),
  getPluginData: (id: BuiltinPluginId) => ipcRenderer.invoke(IPC.pluginDataGet, id),
  setPluginData: (id: BuiltinPluginId, data: Record<string, JsonValue>) =>
    ipcRenderer.invoke(IPC.pluginDataSet, id, data),
  createShortcut: (action: ShortcutAction, accelerator: string) =>
    ipcRenderer.invoke(IPC.shortcutCreate, action, accelerator),
  updateShortcut: (id: string, action: ShortcutAction, accelerator: string) =>
    ipcRenderer.invoke(IPC.shortcutUpdate, id, action, accelerator),
  removeShortcut: (id: string) => ipcRenderer.invoke(IPC.shortcutRemove, id),
  getShortcutRegistrations: () => ipcRenderer.invoke(IPC.shortcutRegistrationsGet),
  setShortcut: (action: ShortcutAction, accelerator: ShortcutAccelerator) =>
    ipcRenderer.invoke(IPC.shortcutSet, action, accelerator),
  onShortcutTriggered: (listener: (action: ShortcutAction) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: unknown): void => {
      if (isShortcutAction(action)) listener(action);
    };
    ipcRenderer.on(IPC.shortcutTriggered, handler);
    return () => ipcRenderer.removeListener(IPC.shortcutTriggered, handler);
  },
  setTheme: (customCss: string, enabled: boolean) => ipcRenderer.invoke(IPC.themeSet, customCss, enabled),
  setHomeIcon: (preference: HomeIconPreference) => ipcRenderer.invoke(IPC.homeIconSet, preference),
  markWelcomeSeen: () => ipcRenderer.invoke(IPC.welcomeSeen),
  openDataFolder: () => ipcRenderer.invoke(IPC.openDataFolder),
  relaunch: (safeMode: boolean) => ipcRenderer.invoke(IPC.relaunch, safeMode),
  reportActivity: (snapshot: ActivitySnapshot) => ipcRenderer.send(IPC.activityReport, snapshot)
});

contextBridge.exposeInMainWorld(
  "PulseCord",
  Object.freeze({
    brand: "PulseCord" as const,
    getEnvironment: bridge.getEnvironment
  })
);

function start(): void {
  if (window.__pulseCordBooted) return;
  window.__pulseCordBooted = true;
  void bootPulseCord(bridge).catch((error: unknown) => {
    console.error("[PulseCord] Failed to start the isolated renderer.", error);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
