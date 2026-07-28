import { execFile } from "node:child_process";

import { app } from "electron";

const LEGACY_STARTUP_VALUE = "app.pulsecord.desktop";

export async function disablePulseCordAutoStart(): Promise<void> {
  app.setLoginItemSettings({ openAtLogin: false });
  if (process.platform !== "win32") return;

  await Promise.all([
    deleteRegistryValue("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"),
    deleteRegistryValue("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run")
  ]);
}

function deleteRegistryValue(key: string): Promise<void> {
  return new Promise((resolve) => {
    execFile(
      "reg.exe",
      ["delete", key, "/v", LEGACY_STARTUP_VALUE, "/f"],
      { windowsHide: true },
      (error, _stdout, stderr) => {
        // Error code 1 means the value did not exist, which is the expected steady state.
        if (error && error.code !== 1) {
          console.warn(`[PulseCord] Could not remove legacy autostart entry from ${key}: ${stderr.trim() || error.message}`);
        }
        resolve();
      }
    );
  });
}
