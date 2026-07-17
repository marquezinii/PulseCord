import { isCustomCss, type AppSettings, type RuntimeEnvironment, type ThemeSettings } from "../shared/contracts";

export const THEME_PREVIEW_EVENT = "pulsecord:theme-preview";

const STYLE_ID = "pulsecord-user-theme";

export interface ThemeRuntimeController {
  update(theme: ThemeSettings): void;
  preview(theme: ThemeSettings): void;
  destroy(): void;
}

export function mountThemeRuntime(
  settings: AppSettings,
  environment?: Pick<RuntimeEnvironment, "safeMode">
): ThemeRuntimeController {
  let current = cloneTheme(settings.theme);
  let style: HTMLStyleElement | undefined;
  const safeMode = environment?.safeMode === true;

  const removeStyle = (): void => {
    style?.remove();
    style = undefined;
    document.getElementById(STYLE_ID)?.remove();
  };

  const render = (): void => {
    if (safeMode || !current.enabled || !current.customCss.trim() || !isCustomCss(current.customCss)) {
      removeStyle();
      return;
    }

    if (!style?.isConnected) {
      document.getElementById(STYLE_ID)?.remove();
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.dataset.pulsecordTheme = "custom";
      (document.head ?? document.documentElement).append(style);
    }
    style.textContent = current.customCss;
  };

  const apply = (theme: ThemeSettings): void => {
    current = cloneTheme(theme);
    render();
  };

  const onPreview = (event: Event): void => {
    if (!(event instanceof CustomEvent) || !isThemeSettings(event.detail)) return;
    apply(event.detail);
  };

  document.addEventListener(THEME_PREVIEW_EVENT, onPreview);
  render();

  return {
    update(theme): void {
      apply(theme);
    },
    preview(theme): void {
      apply(theme);
    },
    destroy(): void {
      document.removeEventListener(THEME_PREVIEW_EVENT, onPreview);
      removeStyle();
    }
  };
}

export function previewTheme(theme: ThemeSettings): void {
  document.dispatchEvent(
    new CustomEvent<ThemeSettings>(THEME_PREVIEW_EVENT, {
      detail: cloneTheme(theme)
    })
  );
}

function cloneTheme(theme: ThemeSettings): ThemeSettings {
  return {
    enabled: theme.enabled,
    customCss: theme.customCss
  };
}

function isThemeSettings(value: unknown): value is ThemeSettings {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ThemeSettings>;
  return typeof candidate.enabled === "boolean" && isCustomCss(candidate.customCss);
}
