import { activeThemeCss, isCustomCss, type AppSettings, type RuntimeEnvironment } from "../shared/contracts";

const STYLE_ID = "pulsecord-user-theme";

export interface ThemeRuntimeController {
  /** Applies the given CSS, replacing whatever was applied before. */
  apply(css: string): void;
  destroy(): void;
}

/**
 * Applies the user's active theme to the Discord surface.
 *
 * The theme is authored on PulseCord's own screen, in a different renderer, so
 * the CSS arrives here over IPC rather than from a same-document event. It is
 * re-validated on the way in regardless: the main process already checked it,
 * but this is the code that actually injects into the page, and it should not
 * rely on someone upstream having been careful.
 */
export function mountThemeRuntime(
  settings: AppSettings,
  environment?: Pick<RuntimeEnvironment, "safeMode">
): ThemeRuntimeController {
  let style: HTMLStyleElement | undefined;
  const safeMode = environment?.safeMode === true;

  const removeStyle = (): void => {
    style?.remove();
    style = undefined;
    document.getElementById(STYLE_ID)?.remove();
  };

  const apply = (css: string): void => {
    if (safeMode || !css.trim() || !isCustomCss(css)) {
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
    style.textContent = css;
  };

  apply(activeThemeCss(settings.theme));

  return {
    apply,
    destroy(): void {
      removeStyle();
    }
  };
}
