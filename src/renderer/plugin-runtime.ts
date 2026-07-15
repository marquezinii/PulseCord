import type { AppSettings, BuiltinPluginId, NativeBridge } from "../shared/contracts";

export type PluginCapability = "dom" | "keyboard" | "styles";

export interface PluginContext {
  addBodyClass(className: string): void;
  addEventListener<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    listener: (event: DocumentEventMap[K]) => void
  ): void;
  addStyle(css: string): void;
  observe(target: Node, options: MutationObserverInit, callback: MutationCallback): void;
}

export interface PluginDefinition {
  id: BuiltinPluginId;
  name: string;
  description: string;
  version: string;
  capabilities: readonly PluginCapability[];
  start(context: PluginContext): void | Promise<void>;
}

interface ActivePlugin {
  cleanups: Array<() => void>;
}

export class PluginRuntime {
  readonly #definitions: Map<BuiltinPluginId, PluginDefinition>;
  readonly #bridge: NativeBridge;
  readonly #active = new Map<BuiltinPluginId, ActivePlugin>();

  constructor(definitions: readonly PluginDefinition[], bridge: NativeBridge) {
    this.#definitions = new Map(definitions.map((definition) => [definition.id, definition]));
    this.#bridge = bridge;
  }

  get definitions(): readonly PluginDefinition[] {
    return [...this.#definitions.values()];
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
    if (!enabled) this.#stop(id);

    try {
      return await this.#bridge.setPluginEnabled(id, enabled);
    } catch (error) {
      if (enabled) this.#stop(id);
      if (!enabled) await this.#start(definition);
      throw error;
    }
  }

  async #start(definition: PluginDefinition): Promise<void> {
    if (this.#active.has(definition.id)) return;

    const cleanups: Array<() => void> = [];
    const context: PluginContext = {
      addBodyClass: (className) => {
        document.documentElement.classList.add(className);
        cleanups.push(() => document.documentElement.classList.remove(className));
      },
      addEventListener: (target, type, listener) => {
        const eventListener = listener as EventListener;
        target.addEventListener(type, eventListener);
        cleanups.push(() => target.removeEventListener(type, eventListener));
      },
      addStyle: (css) => {
        const style = document.createElement("style");
        style.dataset.pulsecordPlugin = definition.id;
        style.textContent = css;
        (document.head ?? document.documentElement).append(style);
        cleanups.push(() => style.remove());
      },
      observe: (target, options, callback) => {
        const observer = new MutationObserver(callback);
        observer.observe(target, options);
        cleanups.push(() => observer.disconnect());
      }
    };

    this.#active.set(definition.id, { cleanups });
    try {
      await definition.start(context);
    } catch (error) {
      this.#stop(definition.id);
      throw error;
    }
  }

  #stop(id: BuiltinPluginId): void {
    const active = this.#active.get(id);
    if (!active) return;
    this.#active.delete(id);
    for (const cleanup of active.cleanups.reverse()) {
      try {
        cleanup();
      } catch (error) {
        console.error(`[PulseCord] Cleanup failed for ${id}.`, error);
      }
    }
  }
}
