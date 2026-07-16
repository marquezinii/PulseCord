import { contextBridge, ipcRenderer } from "electron";

import { bootPulseCord } from "../renderer/bootstrap";
import { IPC, type BuiltinPluginId, type NativeBridge } from "../shared/contracts";
import { installDesktopGatewayIdentity } from "./desktop-identity";

installDesktopGatewayIdentity();

const bridge: NativeBridge = Object.freeze({
  getEnvironment: () => ipcRenderer.invoke(IPC.environment),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setPluginEnabled: (id: BuiltinPluginId, enabled: boolean) => ipcRenderer.invoke(IPC.pluginSetEnabled, id, enabled),
  markWelcomeSeen: () => ipcRenderer.invoke(IPC.welcomeSeen),
  openDataFolder: () => ipcRenderer.invoke(IPC.openDataFolder),
  relaunch: (safeMode: boolean) => ipcRenderer.invoke(IPC.relaunch, safeMode)
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
