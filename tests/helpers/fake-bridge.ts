import type {
  ActivitySnapshot,
  AppSettings,
  BuiltinPluginId,
  HomeIconPreference,
  JsonValue,
  NativeBridge,
  RuntimeEnvironment,
  ShortcutAccelerator,
  ShortcutAction
} from "../../src/shared/contracts";
import { DEFAULT_SETTINGS } from "../../src/shared/contracts";

/**
 * An in-memory stand-in for the preload bridge, used to exercise PulseCore
 * without a real Electron IPC round trip. `calls` records every invocation so
 * tests can assert on what the runtime actually asked the bridge to do.
 */
export class FakeBridge implements NativeBridge {
  settings: AppSettings = structuredClone(DEFAULT_SETTINGS);
  readonly calls: string[] = [];
  readonly activityReports: ActivitySnapshot[] = [];
  readonly themeListeners = new Set<(css: string) => void>();
  setPluginEnabledShouldFail = false;

  getEnvironment(): Promise<RuntimeEnvironment> {
    this.calls.push("getEnvironment");
    return Promise.resolve({ appVersion: "0.0.0-test", platform: "win32", safeMode: false });
  }

  getSettings(): Promise<AppSettings> {
    this.calls.push("getSettings");
    return Promise.resolve(structuredClone(this.settings));
  }

  setPluginEnabled(id: BuiltinPluginId, enabled: boolean): Promise<AppSettings> {
    this.calls.push(`setPluginEnabled:${id}:${enabled}`);
    if (this.setPluginEnabledShouldFail) return Promise.reject(new Error("setPluginEnabled rejected"));
    (this.settings.plugins as Record<string, boolean>)[id] = enabled;
    return Promise.resolve(structuredClone(this.settings));
  }

  getPluginData(id: BuiltinPluginId): Promise<Record<string, JsonValue>> {
    this.calls.push(`getPluginData:${id}`);
    return Promise.resolve(structuredClone(this.settings.pluginData[id] ?? {}));
  }

  setPluginData(id: BuiltinPluginId, data: Record<string, JsonValue>): Promise<Record<string, JsonValue>> {
    this.calls.push(`setPluginData:${id}`);
    (this.settings.pluginData as Record<string, Record<string, JsonValue>>)[id] = structuredClone(data);
    return Promise.resolve(structuredClone(data));
  }

  createShortcut(): Promise<AppSettings> {
    return Promise.reject(new Error("not implemented in FakeBridge"));
  }

  updateShortcut(): Promise<AppSettings> {
    return Promise.reject(new Error("not implemented in FakeBridge"));
  }

  removeShortcut(): Promise<AppSettings> {
    return Promise.reject(new Error("not implemented in FakeBridge"));
  }

  getShortcutRegistrations(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }

  setShortcut(_action: ShortcutAction, _accelerator: ShortcutAccelerator): Promise<AppSettings> {
    return Promise.reject(new Error("not implemented in FakeBridge"));
  }

  onShortcutTriggered(_listener: (action: ShortcutAction) => void): () => void {
    return () => undefined;
  }

  setTheme(): Promise<AppSettings> {
    return Promise.reject(new Error("not implemented in FakeBridge"));
  }

  setHomeIcon(_preference: HomeIconPreference): Promise<AppSettings> {
    return Promise.reject(new Error("not implemented in FakeBridge"));
  }

  markWelcomeSeen(): Promise<AppSettings> {
    return Promise.reject(new Error("not implemented in FakeBridge"));
  }

  openDataFolder(): Promise<void> {
    return Promise.resolve();
  }

  relaunch(): Promise<void> {
    return Promise.resolve();
  }

  onThemeChanged(listener: (css: string) => void): () => void {
    this.themeListeners.add(listener);
    return () => this.themeListeners.delete(listener);
  }

  /** Simulates the main process pushing a new applied theme to this surface. */
  emitThemeChanged(css: string): void {
    for (const listener of [...this.themeListeners]) listener(css);
  }

  reportActivity(snapshot: ActivitySnapshot): void {
    this.calls.push(`reportActivity:${snapshot.mentions ?? "unavailable"}`);
    this.activityReports.push(snapshot);
  }
}
