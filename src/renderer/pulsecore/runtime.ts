import type { AppSettings, BuiltinPluginId, NativeBridge } from "../../shared/contracts";
import { CommandRegistry } from "./command-registry";
import { buildPluginContext } from "./context";
import { EventBus } from "./event-bus";
import type { PluginDefinition, PluginState } from "./types";

interface ActivePlugin {
  cleanups: Array<() => void>;
  crashed: boolean;
}

/**
 * Owns the lifecycle of every first-party PulseCord plugin: starting them,
 * stopping them, and isolating whatever they do wrong. Every resource a
 * plugin registers through its context is unwound on stop, and a runtime
 * error inside a plugin's own callback auto-deactivates only that plugin —
 * the rest of PulseCord, and every other plugin, keeps running.
 */
export class PluginRuntime {
  readonly #definitions: Map<BuiltinPluginId, PluginDefinition>;
  readonly #bridge: NativeBridge;
  readonly #active = new Map<BuiltinPluginId, ActivePlugin>();
  readonly #states = new Map<BuiltinPluginId, PluginState>();
  readonly bus = new EventBus();
  readonly commands = new CommandRegistry();

  constructor(definitions: readonly PluginDefinition[], bridge: NativeBridge) {
    this.#definitions = new Map(definitions.map((definition) => [definition.id, definition]));
    this.#bridge = bridge;
    for (const id of this.#definitions.keys()) this.#states.set(id, "idle");
  }

  get definitions(): readonly PluginDefinition[] {
    return [...this.#definitions.values()];
  }

  getState(id: BuiltinPluginId): PluginState {
    return this.#states.get(id) ?? "idle";
  }

  isEnabled(id: BuiltinPluginId): boolean {
    return this.#active.has(id);
  }

  async startConfigured(settings: AppSettings): Promise<void> {
    for (const definition of this.#definitions.values()) {
      if (!settings.plugins[definition.id]) continue;
      try {
        await this.#start(definition);
      } catch (error) {
        console.error(`[PulseCord] Plugin ${definition.id} failed to start.`, error);
      }
    }
  }

  async setEnabled(id: BuiltinPluginId, enabled: boolean): Promise<AppSettings> {
    const definition = this.#definitions.get(id);
    if (!definition) throw new Error(`Unknown PulseCord plugin: ${id}`);

    if (enabled && !this.#active.has(id)) await this.#start(definition);
    if (!enabled) this.#stop(id, "stopped");

    try {
      return await this.#bridge.setPluginEnabled(id, enabled);
    } catch (error) {
      if (enabled) this.#stop(id, "idle");
      if (!enabled) await this.#start(definition);
      throw error;
    }
  }

  async #start(definition: PluginDefinition): Promise<void> {
    if (this.#active.has(definition.id)) return;

    const active: ActivePlugin = { cleanups: [], crashed: false };
    this.#active.set(definition.id, active);
    this.#setState(definition.id, "starting");

    const onCrash = (error: unknown): void => {
      if (active.crashed) return;
      active.crashed = true;
      console.error(`[PulseCord] Plugin ${definition.id} crashed at runtime and was disabled.`, error);
      this.bus.emit("plugin:crashed", { id: definition.id, error, phase: "runtime" });
      this.#stop(definition.id, "error");
    };

    const context = buildPluginContext({
      pluginId: definition.id,
      capabilities: definition.capabilities,
      bridge: this.#bridge,
      bus: this.bus,
      commands: this.commands,
      onCrash,
      registerCleanup: (cleanup) => active.cleanups.push(cleanup)
    });

    try {
      await definition.start(context);
      if (active.crashed) return;
      this.#setState(definition.id, "active");
    } catch (error) {
      this.bus.emit("plugin:crashed", { id: definition.id, error, phase: "start" });
      this.#stop(definition.id, "error");
      throw error;
    }
  }

  #stop(id: BuiltinPluginId, nextState: PluginState): void {
    const active = this.#active.get(id);
    if (!active) {
      this.#setState(id, nextState);
      return;
    }
    this.#active.delete(id);
    this.commands.removeAllForPlugin(id);
    for (const cleanup of active.cleanups.reverse()) {
      try {
        cleanup();
      } catch (error) {
        console.error(`[PulseCord] Cleanup failed for ${id}.`, error);
      }
    }
    this.#setState(id, nextState);
  }

  #setState(id: BuiltinPluginId, state: PluginState): void {
    this.#states.set(id, state);
    this.bus.emit("plugin:state-changed", { id, state });
  }
}
