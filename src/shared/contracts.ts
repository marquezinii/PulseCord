export const IPC = {
  environment: "pulsecord:environment",
  settingsGet: "pulsecord:settings:get",
  pluginSetEnabled: "pulsecord:plugins:set-enabled",
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

export interface AppSettings {
  schemaVersion: 1;
  plugins: Record<BuiltinPluginId, boolean>;
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
  markWelcomeSeen(): Promise<AppSettings>;
  openDataFolder(): Promise<void>;
  relaunch(safeMode: boolean): Promise<void>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  plugins: {
    "pulse-theme": true,
    "focus-mode": false,
    "compact-layout": false,
    "reduced-motion": false
  },
  ui: {
    seenWelcome: false
  }
};

export function isBuiltinPluginId(value: unknown): value is BuiltinPluginId {
  return typeof value === "string" && (BUILTIN_PLUGIN_IDS as readonly string[]).includes(value);
}

export function sanitizeSettings(value: unknown): AppSettings {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_SETTINGS);

  const candidate = value as Partial<AppSettings>;
  const plugins: Partial<Record<BuiltinPluginId, unknown>> =
    candidate.plugins && typeof candidate.plugins === "object" ? candidate.plugins : {};
  const ui: Partial<AppSettings["ui"]> = candidate.ui && typeof candidate.ui === "object" ? candidate.ui : {};

  return {
    schemaVersion: 1,
    plugins: Object.fromEntries(
      BUILTIN_PLUGIN_IDS.map((id) => [id, typeof plugins[id] === "boolean" ? plugins[id] : DEFAULT_SETTINGS.plugins[id]])
    ) as Record<BuiltinPluginId, boolean>,
    ui: {
      seenWelcome: typeof ui.seenWelcome === "boolean" ? ui.seenWelcome : DEFAULT_SETTINGS.ui.seenWelcome
    }
  };
}
