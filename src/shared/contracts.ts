const TRUSTED_DISCORD_HOSTS = new Set(["discord.com", "canary.discord.com", "ptb.discord.com"]);

export function isTrustedDiscordUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && TRUSTED_DISCORD_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export const IPC = {
  environment: "pulsecord:environment",
  settingsGet: "pulsecord:settings:get",
  pluginSetEnabled: "pulsecord:plugins:set-enabled",
  shortcutCreate: "pulsecord:shortcuts:create",
  shortcutUpdate: "pulsecord:shortcuts:update",
  shortcutRemove: "pulsecord:shortcuts:remove",
  shortcutRegistrationsGet: "pulsecord:shortcuts:registrations:get",
  // Kept while older development renderers are migrated to binding IDs.
  shortcutSet: "pulsecord:shortcuts:set",
  shortcutTriggered: "pulsecord:shortcuts:triggered",
  themeSet: "pulsecord:theme:set",
  homeIconSet: "pulsecord:appearance:home-icon:set",
  welcomeSeen: "pulsecord:welcome:seen",
  openDataFolder: "pulsecord:data:open",
  relaunch: "pulsecord:app:relaunch"
} as const;

export const BUILTIN_PLUGIN_IDS = [] as const;

export type BuiltinPluginId = (typeof BUILTIN_PLUGIN_IDS)[number];

export const SHORTCUT_ACTIONS = [
  "toggle-panel",
  "toggle-mute",
  "toggle-deafen",
  "open-quick-switcher",
  "search-channel",
  "search-global",
  "toggle-inbox",
  "toggle-members",
  "mark-channel-read",
  "mark-server-read",
  "upload-file"
] as const;

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];
export type ShortcutAccelerator = string | null;

export interface ShortcutBinding {
  id: string;
  action: ShortcutAction;
  accelerator: string;
}

export const HOME_ICON_PREFERENCES = ["pulsecord", "discord"] as const;
export type HomeIconPreference = (typeof HOME_ICON_PREFERENCES)[number];

export interface ThemeSettings {
  enabled: boolean;
  customCss: string;
}

export interface AppSettings {
  schemaVersion: 3;
  plugins: Record<BuiltinPluginId, boolean>;
  shortcuts: {
    bindings: ShortcutBinding[];
  };
  theme: ThemeSettings;
  appearance: {
    homeIcon: HomeIconPreference;
  };
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
  createShortcut(action: ShortcutAction, accelerator: string): Promise<AppSettings>;
  updateShortcut(id: string, action: ShortcutAction, accelerator: string): Promise<AppSettings>;
  removeShortcut(id: string): Promise<AppSettings>;
  getShortcutRegistrations(): Promise<readonly string[]>;
  /** @deprecated Use binding-based shortcut operations. */
  setShortcut(action: ShortcutAction, accelerator: ShortcutAccelerator): Promise<AppSettings>;
  onShortcutTriggered(listener: (action: ShortcutAction) => void): () => void;
  setTheme(customCss: string, enabled: boolean): Promise<AppSettings>;
  setHomeIcon(preference: HomeIconPreference): Promise<AppSettings>;
  markWelcomeSeen(): Promise<AppSettings>;
  openDataFolder(): Promise<void>;
  relaunch(safeMode: boolean): Promise<void>;
}

export const MAX_SHORTCUT_BINDINGS = 64;
export const MAX_CUSTOM_CSS_LENGTH = 128 * 1024;

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 3,
  plugins: {},
  shortcuts: {
    bindings: []
  },
  theme: {
    enabled: false,
    customCss: ""
  },
  appearance: {
    homeIcon: "pulsecord"
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
  return value === null || isStoredShortcutAccelerator(value);
}

export function isStoredShortcutAccelerator(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function isShortcutBindingId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

export function isHomeIconPreference(value: unknown): value is HomeIconPreference {
  return typeof value === "string" && (HOME_ICON_PREFERENCES as readonly string[]).includes(value);
}

export function isCustomCss(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > MAX_CUSTOM_CSS_LENGTH ||
    new TextEncoder().encode(value).byteLength > MAX_CUSTOM_CSS_LENGTH ||
    value.includes("\0")
  ) {
    return false;
  }

  const comparable = decodeCssEscapes(value.replace(/\/\*[\s\S]*?\*\//g, ""));
  if (/@import\b/i.test(comparable)) return false;
  if (/(?:-webkit-)?image-set\s*\(/i.test(comparable)) return false;
  if (/(?:https?:)?\/\//i.test(comparable)) return false;

  for (const match of comparable.matchAll(/url\s*\(\s*([^)]*?)\s*\)/gi)) {
    const target = (match[1] ?? "").trim().replace(/^(['"])(.*)\1$/, "$2").trim().toLowerCase();
    if (!target.startsWith("data:") && !target.startsWith("blob:") && !target.startsWith("#")) return false;
  }

  return true;
}

export function sanitizeSettings(value: unknown): AppSettings {
  if (!isRecord(value)) return structuredClone(DEFAULT_SETTINGS);

  const pluginCandidate = isRecord(value.plugins) ? value.plugins : {};
  const uiCandidate = isRecord(value.ui) ? value.ui : {};
  const themeCandidate = isRecord(value.theme) ? value.theme : {};
  const appearanceCandidate = isRecord(value.appearance) ? value.appearance : {};
  const rawCustomCss = themeCandidate.customCss;
  const hasValidCustomCss = isCustomCss(rawCustomCss);
  const customCss: string = hasValidCustomCss ? rawCustomCss : DEFAULT_SETTINGS.theme.customCss;

  return {
    schemaVersion: 3,
    plugins: Object.fromEntries(
      BUILTIN_PLUGIN_IDS.map((id) => [
        id,
        typeof pluginCandidate[id] === "boolean" ? pluginCandidate[id] : DEFAULT_SETTINGS.plugins[id]
      ])
    ) as Record<BuiltinPluginId, boolean>,
    shortcuts: {
      bindings: sanitizeShortcutBindings(value.shortcuts)
    },
    theme: {
      enabled: typeof themeCandidate.enabled === "boolean" ? themeCandidate.enabled && hasValidCustomCss : false,
      customCss
    },
    appearance: {
      homeIcon: isHomeIconPreference(appearanceCandidate.homeIcon)
        ? appearanceCandidate.homeIcon
        : DEFAULT_SETTINGS.appearance.homeIcon
    },
    ui: {
      seenWelcome:
        typeof uiCandidate.seenWelcome === "boolean" ? uiCandidate.seenWelcome : DEFAULT_SETTINGS.ui.seenWelcome
    }
  };
}

function sanitizeShortcutBindings(value: unknown): ShortcutBinding[] {
  const shortcutCandidate = isRecord(value) ? value : {};
  const rawBindings = Array.isArray(shortcutCandidate.bindings)
    ? shortcutCandidate.bindings
    : migrateLegacyShortcuts(shortcutCandidate);
  const bindings: ShortcutBinding[] = [];
  const ids = new Set<string>();
  const actions = new Set<ShortcutAction>();
  const accelerators = new Set<string>();

  for (const rawBinding of rawBindings.slice(0, MAX_SHORTCUT_BINDINGS)) {
    if (!isRecord(rawBinding)) continue;
    if (
      !isShortcutBindingId(rawBinding.id) ||
      !isShortcutAction(rawBinding.action) ||
      !isStoredShortcutAccelerator(rawBinding.accelerator)
    ) {
      continue;
    }

    const acceleratorKey = rawBinding.accelerator.toLowerCase();
    if (ids.has(rawBinding.id) || actions.has(rawBinding.action) || accelerators.has(acceleratorKey)) continue;

    ids.add(rawBinding.id);
    actions.add(rawBinding.action);
    accelerators.add(acceleratorKey);
    bindings.push({
      id: rawBinding.id,
      action: rawBinding.action,
      accelerator: rawBinding.accelerator
    });
  }

  return bindings;
}

function migrateLegacyShortcuts(value: Record<string, unknown>): ShortcutBinding[] {
  const bindings: ShortcutBinding[] = [];
  for (const action of SHORTCUT_ACTIONS) {
    const accelerator = value[action];
    if (!isStoredShortcutAccelerator(accelerator)) continue;
    bindings.push({ id: `migrated-${action}`, action, accelerator });
  }
  return bindings;
}

function decodeCssEscapes(value: string): string {
  return value.replace(/\\([0-9a-f]{1,6}[\t\n\f\r ]?|.)/gi, (_match, escaped: string) => {
    const hexadecimal = escaped.match(/^([0-9a-f]{1,6})/i)?.[1];
    if (!hexadecimal) return escaped;
    const codePoint = Number.parseInt(hexadecimal, 16);
    return codePoint === 0 || codePoint > 0x10ffff ? "\ufffd" : String.fromCodePoint(codePoint);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
