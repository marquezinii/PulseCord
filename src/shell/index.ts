import { ipcRenderer } from "electron";

import { IPC, type RuntimeEnvironment } from "../shared/contracts";
import { SHELL_NAV_WIDTH } from "../shared/shell-layout";
import { mountShellNavigation } from "./navigation";

/**
 * Preload for the shell window's own page (static/shell.html). It runs in
 * Electron's isolated world and builds the chrome directly, exactly as the
 * Discord-side preload builds PulsePanel — nothing is exposed to the page's
 * main world, because the shell page has no scripts of its own.
 */
async function start(): Promise<void> {
  document.documentElement.style.setProperty("--pulsecord-nav-width", `${SHELL_NAV_WIDTH}px`);

  let environment: RuntimeEnvironment | undefined;
  try {
    environment = (await ipcRenderer.invoke(IPC.environment)) as RuntimeEnvironment;
  } catch (error) {
    console.error("[PulseCord] The shell could not read its runtime environment.", error);
  }

  mountShellNavigation(document, environment);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
} else {
  void start();
}
