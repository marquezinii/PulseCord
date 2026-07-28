import type { BuiltinPluginId, JsonValue } from "../../shared/contracts";

export type PluginCapability = "dom" | "events" | "settings" | "commands";

export type PluginState = "idle" | "starting" | "active" | "error" | "stopped";

export interface PluginCrashedEvent {
  id: BuiltinPluginId;
  error: unknown;
  phase: "start" | "runtime";
}

export interface PluginStateChangedEvent {
  id: BuiltinPluginId;
  state: PluginState;
}

export interface DomFacet {
  addBodyClass(className: string): void;
  addStyle(css: string): void;
  addEventListener<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    listener: (event: DocumentEventMap[K]) => void
  ): void;
  observe(target: Node, options: MutationObserverInit, callback: MutationCallback): void;
  /**
   * Applies `apply` to every element currently matching `selector` and to every
   * matching element added later. When a patched element is removed from the
   * document, the function `apply` returned (if any) is invoked to undo it.
   */
  patch(selector: string, apply: (element: Element) => (() => void) | void): void;
}

export interface EventsFacet {
  on(type: string, listener: (payload: unknown) => void): void;
  emit(type: string, payload?: unknown): void;
}

export interface SettingsFacet {
  get<T extends JsonValue>(key: string, fallback: T): Promise<T>;
  set(key: string, value: JsonValue): Promise<void>;
  all(): Promise<Record<string, JsonValue>>;
}

export interface CommandsFacet {
  register(id: string, label: string, handler: () => void): void;
}

export interface LifecycleFacet {
  setInterval(callback: () => void, delayMs: number): number;
  setTimeout(callback: () => void, delayMs: number): number;
  onDispose(callback: () => void): void;
  cleanup: {
    add(callback: () => void): void;
  };
}

export interface PluginContext {
  lifecycle: LifecycleFacet;
  dom: DomFacet | undefined;
  events: EventsFacet | undefined;
  settings: SettingsFacet | undefined;
  commands: CommandsFacet | undefined;
}

export interface PluginDefinition {
  id: BuiltinPluginId;
  name: string;
  description: string;
  version: string;
  capabilities: readonly PluginCapability[];
  start(context: PluginContext): void | Promise<void>;
}
