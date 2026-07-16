export const IPC = {
  environment: "pulsecord:environment",
  settingsGet: "pulsecord:settings:get",
  pluginSetEnabled: "pulsecord:plugins:set-enabled",
  shortcutSet: "pulsecord:shortcuts:set",
  shortcutTriggered: "pulsecord:shortcuts:triggered",
  welcomeSeen: "pulsecord:welcome:seen",
  openDataFolder: "pulsecord:data:open",
  relaunch: "pulsecord:app:relaunch"
} as const;

export const BUILTIN_PLUGIN_IDS = [
  "pulse-theme",
  "focus-mode",
  "compact-layout",
  "reduced-motion"
] as const;

export type BuiltinPluginId = (typeof BUILTIN_PLUGIN_IDS)[number];

export const SHORTCUT_ACTIONS = ["toggle-panel", "toggle-mute", "toggle-deafen"] as const;
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];
export type ShortcutAccelerator = string | null;

export interface AppSettings {
  schemaVersion: 2;
  plugins: Record<BuiltinPluginId, boolean>;
  shortcuts: Record<ShortcutAction, ShortcutAccelerator>;
  ui: {
    seenWelcome: boolean;
  };
}

export interface RuntimeEnvironment {
  appVersion: string;
  platform: NodeJS.Platform;
  safeMode: boolean;
}

export interface NativeBridge {
  getEnvironment(): Promise<RuntimeEnvironment>;
  getSettings(): Promise<AppSettings>;
  setPluginEnabled(id: BuiltinPluginId, enabled: boolean): Promise<AppSettings>;
  setShortcut(action: ShortcutAction, accelerator: ShortcutAccelerator): Promise<AppSettings>;
  onShortcutTriggered(listener: (action: ShortcutAction) => void): () => void;
  markWelcomeSeen(): Promise<AppSettings>;
  openDataFolder(): Promise<void>;
  relaunch(safeMode: boolean): Promise<void>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 2,
  plugins: {
    "pulse-theme": true,
    "focus-mode": false,
    "compact-layout": false,
    "reduced-motion": false
  },
  shortcuts: {
    "toggle-panel": null,
    "toggle-mute": null,
    "toggle-deafen": null
  },
  ui: {
    seenWelcome: false
  }
};

export function isBuiltinPluginId(value: unknown): value is BuiltinPluginId {
  return typeof value === "string" && (BUILTIN_PLUGIN_IDS as readonly string[]).includes(value);
}

export function isShortcutAction(value: unknown): value is ShortcutAction {
  return typeof value === "string" && (SHORTCUT_ACTIONS as readonly string[]).includes(value);
}

export function isShortcutAccelerator(value: unknown): value is ShortcutAccelerator {
  return value === null || (typeof value === "string" && value.length > 0 && value.length <= 64);
}

export function sanitizeSettings(value: unknown): AppSettings {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_SETTINGS);

  const candidate = value as Partial<AppSettings>;
  const plugins: Partial<Record<BuiltinPluginId, unknown>> =
    candidate.plugins && typeof candidate.plugins === "object" ? candidate.plugins : {};
  const shortcuts: Partial<Record<ShortcutAction, unknown>> =
    candidate.shortcuts && typeof candidate.shortcuts === "object" ? candidate.shortcuts : {};
  const ui: Partial<AppSettings["ui"]> = candidate.ui && typeof candidate.ui === "object" ? candidate.ui : {};

  return {
    schemaVersion: 2,
    plugins: Object.fromEntries(
      BUILTIN_PLUGIN_IDS.map((id) => [id, typeof plugins[id] === "boolean" ? plugins[id] : DEFAULT_SETTINGS.plugins[id]])
    ) as Record<BuiltinPluginId, boolean>,
    shortcuts: Object.fromEntries(
      SHORTCUT_ACTIONS.map((action) => [
        action,
        isShortcutAccelerator(shortcuts[action]) ? shortcuts[action] : DEFAULT_SETTINGS.shortcuts[action]
      ])
    ) as Record<ShortcutAction, ShortcutAccelerator>,
    ui: {
      seenWelcome: typeof ui.seenWelcome === "boolean" ? ui.seenWelcome : DEFAULT_SETTINGS.ui.seenWelcome
    }
  };
}
