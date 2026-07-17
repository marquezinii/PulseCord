import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  type AppSettings,
  type BuiltinPluginId,
  type HomeIconPreference,
  type ShortcutAction,
  type ShortcutBinding,
  DEFAULT_SETTINGS,
  MAX_SHORTCUT_BINDINGS,
  sanitizeSettings
} from "../shared/contracts";

export class SettingsStore {
  readonly #filePath: string;
  #cache: AppSettings | undefined;
  #loadPromise: Promise<AppSettings> | undefined;
  #mutationQueue: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.#filePath = path.join(userDataPath, "pulsecord-settings.json");
  }

  async get(): Promise<AppSettings> {
    await this.#mutationQueue;
    return structuredClone(await this.#load());
  }

  async setPluginEnabled(id: BuiltinPluginId, enabled: boolean): Promise<AppSettings> {
    return this.#update((settings) => {
      (settings.plugins as Record<string, boolean>)[id] = enabled;
    });
  }

  async createShortcut(binding: ShortcutBinding): Promise<AppSettings> {
    return this.#update((settings) => {
      if (settings.shortcuts.bindings.length >= MAX_SHORTCUT_BINDINGS) {
        throw new Error("The shortcut limit has been reached.");
      }
      if (settings.shortcuts.bindings.some((current) => current.id === binding.id)) {
        throw new Error("A shortcut with that ID already exists.");
      }
      if (settings.shortcuts.bindings.some((current) => current.action === binding.action)) {
        throw new Error("That action already has a shortcut.");
      }
      if (
        settings.shortcuts.bindings.some(
          (current) => current.accelerator.toLowerCase() === binding.accelerator.toLowerCase()
        )
      ) {
        throw new Error("That shortcut is already in use.");
      }
      settings.shortcuts.bindings.push(structuredClone(binding));
    });
  }

  async updateShortcut(id: string, action: ShortcutAction, accelerator: string): Promise<AppSettings> {
    return this.#update((settings) => {
      const binding = settings.shortcuts.bindings.find((current) => current.id === id);
      if (!binding) throw new Error("Shortcut not found.");
      if (settings.shortcuts.bindings.some((current) => current.id !== id && current.action === action)) {
        throw new Error("That action already has a shortcut.");
      }
      if (
        settings.shortcuts.bindings.some(
          (current) => current.id !== id && current.accelerator.toLowerCase() === accelerator.toLowerCase()
        )
      ) {
        throw new Error("That shortcut is already in use.");
      }
      binding.action = action;
      binding.accelerator = accelerator;
    });
  }

  async removeShortcut(id: string): Promise<AppSettings> {
    return this.#update((settings) => {
      const index = settings.shortcuts.bindings.findIndex((binding) => binding.id === id);
      if (index === -1) throw new Error("Shortcut not found.");
      settings.shortcuts.bindings.splice(index, 1);
    });
  }

  async setTheme(customCss: string, enabled: boolean): Promise<AppSettings> {
    return this.#update((settings) => {
      settings.theme.customCss = customCss;
      settings.theme.enabled = enabled;
    });
  }

  async setHomeIcon(homeIcon: HomeIconPreference): Promise<AppSettings> {
    return this.#update((settings) => {
      settings.appearance.homeIcon = homeIcon;
    });
  }

  async markWelcomeSeen(): Promise<AppSettings> {
    return this.#update((settings) => {
      settings.ui.seenWelcome = true;
    });
  }

  async #load(): Promise<AppSettings> {
    if (this.#cache) return this.#cache;
    if (this.#loadPromise) return this.#loadPromise;

    this.#loadPromise = (async () => {
      let raw: string;
      try {
        raw = await readFile(this.#filePath, "utf8");
      } catch (error) {
        if (isMissingFileError(error)) return structuredClone(DEFAULT_SETTINGS);
        throw error;
      }

      try {
        const parsed = JSON.parse(raw) as unknown;
        const sanitized = sanitizeSettings(parsed);
        if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) await this.#writeAtomically(sanitized);
        return sanitized;
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        const quarantinePath = `${this.#filePath}.corrupt-${Date.now()}`;
        await rename(this.#filePath, quarantinePath);
        console.error(`[PulseCord] Invalid settings were preserved at ${quarantinePath}.`);
        return structuredClone(DEFAULT_SETTINGS);
      }
    })();

    try {
      this.#cache = await this.#loadPromise;
      return this.#cache;
    } finally {
      this.#loadPromise = undefined;
    }
  }

  async #update(mutator: (settings: AppSettings) => void): Promise<AppSettings> {
    const operation = this.#mutationQueue.then(async () => {
      const settings = structuredClone(await this.#load());
      mutator(settings);
      const next = sanitizeSettings(settings);
      await this.#writeAtomically(next);
      this.#cache = next;
      return structuredClone(next);
    });

    this.#mutationQueue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  async #writeAtomically(settings: AppSettings): Promise<void> {
    const directory = path.dirname(this.#filePath);
    const temporaryPath = `${this.#filePath}.${process.pid}.tmp`;
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.#filePath);
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
