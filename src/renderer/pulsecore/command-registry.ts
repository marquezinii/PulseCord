import type { BuiltinPluginId } from "../../shared/contracts";

export interface CommandDescriptor {
  key: string;
  id: string;
  label: string;
  pluginId: BuiltinPluginId;
}

interface RegisteredCommand extends CommandDescriptor {
  handler: () => void;
}

/**
 * Names a plugin action so it can later be surfaced to the user (a command
 * palette entry, a shortcut target) without the plugin needing to know how
 * it will be invoked. Registration is scoped per plugin so two plugins can
 * both register e.g. "toggle", and every command a plugin owns is removed
 * automatically when that plugin stops.
 */
export class CommandRegistry {
  readonly #commands = new Map<string, RegisteredCommand>();

  register(pluginId: BuiltinPluginId, id: string, label: string, handler: () => void): () => void {
    const key = `${pluginId}:${id}`;
    if (this.#commands.has(key)) {
      throw new Error(`PulseCord command "${id}" is already registered by plugin ${pluginId}.`);
    }
    this.#commands.set(key, { key, id, label, pluginId, handler });
    return () => this.#commands.delete(key);
  }

  invoke(key: string): boolean {
    const command = this.#commands.get(key);
    if (!command) return false;
    command.handler();
    return true;
  }

  list(): readonly CommandDescriptor[] {
    return [...this.#commands.values()].map(({ handler: _handler, ...descriptor }) => descriptor);
  }

  removeAllForPlugin(pluginId: BuiltinPluginId): void {
    for (const [key, command] of this.#commands) {
      if (command.pluginId === pluginId) this.#commands.delete(key);
    }
  }
}
