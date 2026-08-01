import { ipcRenderer } from "electron";

import {
  IPC,
  isActivitySnapshot,
  unavailableActivity,
  type ActivitySnapshot,
  type AppSettings,
  type RuntimeEnvironment,
  type ShellDestinationId,
  type ThemeSettings
} from "../shared/contracts";
import { SHELL_NAV_WIDTH } from "../shared/shell-layout";
import { renderActivityScreen, type ActivityViewController } from "./activity";
import { mountShellNavigation } from "./navigation";
import { renderThemeLibrary } from "./themes";

/**
 * Preload for the shell window's own page (static/shell.html). It runs in
 * Electron's isolated world and builds the chrome directly, exactly as the
 * Discord-side preload builds PulsePanel — nothing is exposed to the page's
 * main world, because the shell page has no scripts of its own.
 */
async function start(): Promise<void> {
  document.documentElement.style.setProperty("--pulsecord-nav-width", `${SHELL_NAV_WIDTH}px`);

  const [environment, loadedSettings] = await Promise.all([
    invokeOrWarn<RuntimeEnvironment>(IPC.environment, "runtime environment"),
    invokeOrWarn<AppSettings>(IPC.settingsGet, "settings")
  ]);

  let settings = loadedSettings;

  // Every theme operation answers with the whole settings object, so the shell
  // keeps its copy current instead of re-fetching after each change.
  const themeAction = async (channel: string, ...args: unknown[]): Promise<ThemeSettings> => {
    const updated = (await ipcRenderer.invoke(channel, ...args)) as AppSettings;
    settings = updated;
    return updated.theme;
  };

  const content = document.getElementById("pulsecord-content");
  if (!content) throw new Error("The shell content area is missing from the document.");

  let current: ShellDestinationId = "discord";
  let activityView: ActivityViewController | undefined;
  let snapshot: ActivitySnapshot = unavailableActivity(Date.now());

  const show = (destination: ShellDestinationId): void => {
    current = destination;
    // The Discord surface is a separate view that the main process positions
    // over this area, so "showing Discord" means clearing our own content
    // rather than drawing anything.
    const showsOwnScreen = destination !== "discord";
    content.hidden = !showsOwnScreen;
    activityView = undefined;
    content.replaceChildren();

    if (destination === "activity") {
      activityView = renderActivityScreen(document, content, {
        environment,
        settings,
        onOpenDiscord: () => select("discord")
      });
      activityView.update(snapshot);
      return;
    }

    if (destination === "themes") {
      renderThemeLibrary(document, content, settings?.theme ?? { themes: [], activeThemeId: null }, {
        create: (name, css) => themeAction(IPC.themeCreate, name, css),
        update: (id, name, css) => themeAction(IPC.themeUpdate, id, name, css),
        remove: (id) => themeAction(IPC.themeRemove, id),
        activate: (id) => themeAction(IPC.themeActivate, id)
      });
    }
  };

  function select(destination: ShellDestinationId): void {
    if (destination === current) return;
    navigation.setActive(destination);
    show(destination);
    void ipcRenderer.invoke(IPC.shellNavigate, destination).catch((error: unknown) => {
      console.error("[PulseCord] The shell could not switch destinations.", error);
    });
  }

  const navigation = mountShellNavigation(document, environment, {
    initial: current,
    onSelect: select
  });

  ipcRenderer.on(IPC.activitySnapshotChanged, (_event, incoming: unknown) => {
    if (!isActivitySnapshot(incoming)) return;
    snapshot = incoming;
    activityView?.update(snapshot);
  });

  show(current);

  const initial = await invokeOrWarn<unknown>(IPC.activitySnapshotGet, "activity snapshot");
  if (isActivitySnapshot(initial)) {
    snapshot = initial;
    activityView?.update(snapshot);
  }
}

async function invokeOrWarn<T>(channel: string, what: string): Promise<T | undefined> {
  try {
    return (await ipcRenderer.invoke(channel)) as T;
  } catch (error) {
    console.error(`[PulseCord] The shell could not read its ${what}.`, error);
    return undefined;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
} else {
  void start();
}
