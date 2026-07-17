import type { NativeBridge } from "../shared/contracts";
import { mountPulseCordBranding } from "./branding";
import { mountControlCenter } from "./control-center";
import { mountDiscordSettingsIntegration } from "./discord-settings";
import { PluginRuntime } from "./plugin-runtime";
import { BUILTIN_PLUGINS } from "./plugins";
import { mountThemeRuntime } from "./theme-runtime";

export async function bootPulseCord(bridge: NativeBridge): Promise<void> {
  if (window.top !== window) return;

  const [environment, settings] = await Promise.all([bridge.getEnvironment(), bridge.getSettings()]);
  const runtime = new PluginRuntime(BUILTIN_PLUGINS, bridge);

  if (!environment.safeMode) await runtime.startConfigured(settings);
  mountThemeRuntime(settings, environment);
  mountPulseCordBranding(settings, bridge);
  mountDiscordSettingsIntegration(settings, bridge);
  await mountControlCenter(runtime, environment, settings, bridge);

  console.info(
    `%c PulseCord %c PulseCore ${environment.appVersion} started${environment.safeMode ? " in safe mode" : ""}.`,
    "background:#d43f55;color:white;border-radius:4px 0 0 4px;padding:2px 6px;font-weight:700",
    "background:#20232d;color:#d9dce4;border-radius:0 4px 4px 0;padding:2px 6px"
  );
}
