import type { BuiltinPluginId, JsonValue, NativeBridge } from "../../shared/contracts";
import type { CommandRegistry } from "./command-registry";
import type { EventBus } from "./event-bus";
import type { PluginCapability, PluginContext } from "./types";

interface BuildContextOptions {
  pluginId: BuiltinPluginId;
  capabilities: readonly PluginCapability[];
  bridge: NativeBridge;
  bus: EventBus;
  commands: CommandRegistry;
  onCrash(error: unknown): void;
  registerCleanup(cleanup: () => void): void;
}

/**
 * Builds the sandboxed API a single plugin receives. Every resource a plugin
 * registers (listener, observer, timer, command, style) is tracked through
 * `registerCleanup` so the runtime can unwind it all on stop, and every
 * callback the plugin supplies is wrapped so a throw inside it is reported to
 * `onCrash` instead of propagating into PulseCord or the Discord page.
 */
export function buildPluginContext(options: BuildContextOptions): PluginContext {
  const { pluginId, capabilities, bridge, bus, commands, onCrash, registerCleanup } = options;
  const has = (capability: PluginCapability): boolean => capabilities.includes(capability);

  const guard = <A extends unknown[]>(fn: (...args: A) => void): ((...args: A) => void) => {
    return (...args: A): void => {
      try {
        fn(...args);
      } catch (error) {
        onCrash(error);
      }
    };
  };

  const lifecycle: PluginContext["lifecycle"] = {
    setInterval(callback, delayMs) {
      const handle = window.setInterval(guard(callback), delayMs);
      registerCleanup(() => window.clearInterval(handle));
      return handle;
    },
    setTimeout(callback, delayMs) {
      const handle = window.setTimeout(guard(callback), delayMs);
      registerCleanup(() => window.clearTimeout(handle));
      return handle;
    },
    onDispose(callback) {
      registerCleanup(callback);
    },
    cleanup: {
      add(callback) {
        registerCleanup(callback);
      }
    }
  };

  const dom: PluginContext["dom"] = has("dom") ? buildDomFacet(pluginId, onCrash, registerCleanup) : undefined;
  const events: PluginContext["events"] = has("events")
    ? {
        on(type, listener) {
          registerCleanup(bus.on(type, guard(listener)));
        },
        emit(type, payload) {
          bus.emit(type, payload);
        }
      }
    : undefined;

  const settings: PluginContext["settings"] = has("settings") ? buildSettingsFacet(pluginId, bridge) : undefined;

  const commandsFacet: PluginContext["commands"] = has("commands")
    ? {
        register(id, label, handler) {
          registerCleanup(commands.register(pluginId, id, label, guard(handler)));
        }
      }
    : undefined;

  return { lifecycle, dom, events, settings, commands: commandsFacet };
}

function buildDomFacet(
  pluginId: BuiltinPluginId,
  onCrash: (error: unknown) => void,
  registerCleanup: (cleanup: () => void) => void
): PluginContext["dom"] {
  return {
    addBodyClass(className) {
      document.documentElement.classList.add(className);
      registerCleanup(() => document.documentElement.classList.remove(className));
    },
    addStyle(css) {
      const style = document.createElement("style");
      style.dataset.pulsecordPlugin = pluginId;
      style.textContent = css;
      (document.head ?? document.documentElement).append(style);
      registerCleanup(() => style.remove());
    },
    addEventListener(target, type, listener) {
      const wrapped: EventListener = (event) => {
        try {
          listener(event as never);
        } catch (error) {
          onCrash(error);
        }
      };
      target.addEventListener(type, wrapped);
      registerCleanup(() => target.removeEventListener(type, wrapped));
    },
    observe(target, options, callback) {
      const observer = new MutationObserver((mutations, obs) => {
        try {
          callback(mutations, obs);
        } catch (error) {
          onCrash(error);
        }
      });
      observer.observe(target, options);
      registerCleanup(() => observer.disconnect());
    },
    patch(selector, apply) {
      const undoByElement = new WeakMap<Element, () => void>();

      const tryApply = (element: Element): void => {
        if (undoByElement.has(element)) return;
        try {
          const undo = apply(element);
          undoByElement.set(element, undo ?? (() => undefined));
        } catch (error) {
          onCrash(error);
        }
      };

      const tryUndo = (element: Element): void => {
        const undo = undoByElement.get(element);
        if (!undo) return;
        undoByElement.delete(element);
        try {
          undo();
        } catch (error) {
          onCrash(error);
        }
      };

      const root = document.body ?? document.documentElement;
      root.querySelectorAll(selector).forEach(tryApply);

      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          mutation.addedNodes.forEach((node) => {
            if (!(node instanceof Element)) return;
            if (node.matches(selector)) tryApply(node);
            node.querySelectorAll(selector).forEach(tryApply);
          });
          mutation.removedNodes.forEach((node) => {
            if (!(node instanceof Element)) return;
            if (node.matches(selector)) tryUndo(node);
            node.querySelectorAll(selector).forEach(tryUndo);
          });
        }
      });
      observer.observe(root, { childList: true, subtree: true });

      registerCleanup(() => {
        observer.disconnect();
        root.querySelectorAll(selector).forEach(tryUndo);
      });
    }
  };
}

function buildSettingsFacet(pluginId: BuiltinPluginId, bridge: NativeBridge): PluginContext["settings"] {
  return {
    async get<T extends JsonValue>(key: string, fallback: T): Promise<T> {
      const bucket = await bridge.getPluginData(pluginId);
      const value = bucket[key];
      return value === undefined ? fallback : (value as T);
    },
    async set(key: string, value: JsonValue): Promise<void> {
      const bucket = await bridge.getPluginData(pluginId);
      await bridge.setPluginData(pluginId, { ...bucket, [key]: value });
    },
    async all(): Promise<Record<string, JsonValue>> {
      return bridge.getPluginData(pluginId);
    }
  };
}
