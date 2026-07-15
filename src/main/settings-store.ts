import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  type AppSettings,
  type BuiltinPluginId,
  DEFAULT_SETTINGS,
  sanitizeSettings
} from "../shared/contracts";

export class SettingsStore {
  readonly #filePath: string;
  #cache: AppSettings | undefined;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.#filePath = path.join(userDataPath, "pulsecord-settings.json");
  }

  async get(): Promise<AppSettings> {
    if (this.#cache) return structuredClone(this.#cache);

    try {
      const raw = await readFile(this.#filePath, "utf8");
      this.#cache = sanitizeSettings(JSON.parse(raw) as unknown);
    } catch {
      this.#cache = structuredClone(DEFAULT_SETTINGS);
    }

    return structuredClone(this.#cache);
  }

  async setPluginEnabled(id: BuiltinPluginId, enabled: boolean): Promise<AppSettings> {
    return this.#update((settings) => {
      settings.plugins[id] = enabled;
    });
  }

  async markWelcomeSeen(): Promise<AppSettings> {
    return this.#update((settings) => {
      settings.ui.seenWelcome = true;
    });
  }

  async #update(mutator: (settings: AppSettings) => void): Promise<AppSettings> {
    const settings = await this.get();
    mutator(settings);
    this.#cache = sanitizeSettings(settings);

    const snapshot = structuredClone(this.#cache);
    this.#writeQueue = this.#writeQueue.catch(() => undefined).then(() => this.#writeAtomically(snapshot));
    await this.#writeQueue;
    return structuredClone(snapshot);
  }

  async #writeAtomically(settings: AppSettings): Promise<void> {
    const directory = path.dirname(this.#filePath);
    const temporaryPath = `${this.#filePath}.${process.pid}.tmp`;
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.#filePath);
  }
}
