import type { PluginDefinition } from "../pulsecore";

/**
 * The runtime remains part of PulseCore, but PulseCord does not ship plugins yet.
 * New plugins will only enter this catalogue after they are implemented and reviewed.
 */
export const BUILTIN_PLUGINS: readonly PluginDefinition[] = [];
