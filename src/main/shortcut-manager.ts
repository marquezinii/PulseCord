import { globalShortcut, type BrowserWindow } from "electron";

import { IPC, type AppSettings, type ShortcutAction, type ShortcutBinding } from "../shared/contracts";

interface KeyChord {
  keyCode: string;
  modifiers?: Array<"control" | "shift">;
}

const DISCORD_ACTION_CHORDS: Partial<Record<ShortcutAction, KeyChord>> = {
  "toggle-mute": { keyCode: "M", modifiers: ["control", "shift"] },
  "toggle-deafen": { keyCode: "D", modifiers: ["control", "shift"] },
  "open-quick-switcher": { keyCode: "K", modifiers: ["control"] },
  "search-channel": { keyCode: "F", modifiers: ["control"] },
  "search-global": { keyCode: "F", modifiers: ["control", "shift"] },
  "toggle-inbox": { keyCode: "I", modifiers: ["control"] },
  "toggle-members": { keyCode: "U", modifiers: ["control"] },
  "mark-channel-read": { keyCode: "Escape" },
  "mark-server-read": { keyCode: "Escape", modifiers: ["shift"] },
  "upload-file": { keyCode: "U", modifiers: ["control", "shift"] }
};

const BACKGROUND_ACTIONS = new Set<ShortcutAction>(["toggle-mute", "toggle-deafen"]);

export class ShortcutManager {
  readonly #getWindow: () => BrowserWindow | undefined;
  readonly #registered = new Map<string, ShortcutBinding>();

  constructor(getWindow: () => BrowserWindow | undefined) {
    this.#getWindow = getWindow;
  }

  configure(settings: AppSettings): string[] {
    this.dispose();
    const unavailable: string[] = [];
    for (const binding of settings.shortcuts.bindings) {
      if (!this.create(binding)) unavailable.push(binding.id);
    }
    return unavailable;
  }

  create(binding: ShortcutBinding): boolean {
    if (this.#registered.has(binding.id)) return false;
    if (
      [...this.#registered.values()].some(
        (current) =>
          current.action === binding.action || current.accelerator.toLowerCase() === binding.accelerator.toLowerCase()
      )
    ) {
      return false;
    }
    if (!this.#register(binding.id, binding.accelerator)) return false;
    this.#registered.set(binding.id, structuredClone(binding));
    return true;
  }

  update(id: string, action: ShortcutAction, accelerator: string): boolean {
    const previous = this.#registered.get(id);
    if (!previous) return false;
    if (
      [...this.#registered.values()].some(
        (current) =>
          current.id !== id &&
          (current.action === action || current.accelerator.toLowerCase() === accelerator.toLowerCase())
      )
    ) {
      return false;
    }

    if (previous.accelerator === accelerator) {
      this.#registered.set(id, { id, action, accelerator });
      return true;
    }

    globalShortcut.unregister(previous.accelerator);
    if (this.#register(id, accelerator)) {
      this.#registered.set(id, { id, action, accelerator });
      return true;
    }

    if (this.#register(id, previous.accelerator)) {
      this.#registered.set(id, previous);
    } else {
      this.#registered.delete(id);
    }
    return false;
  }

  remove(id: string): boolean {
    const binding = this.#registered.get(id);
    if (!binding) return false;
    globalShortcut.unregister(binding.accelerator);
    this.#registered.delete(id);
    return true;
  }

  get(id: string): ShortcutBinding | undefined {
    const binding = this.#registered.get(id);
    return binding ? structuredClone(binding) : undefined;
  }

  findByAction(action: ShortcutAction): ShortcutBinding | undefined {
    const binding = [...this.#registered.values()].find((current) => current.action === action);
    return binding ? structuredClone(binding) : undefined;
  }

  getRegisteredIds(): string[] {
    return [...this.#registered.keys()];
  }

  dispose(): void {
    for (const binding of this.#registered.values()) globalShortcut.unregister(binding.accelerator);
    this.#registered.clear();
  }

  #register(id: string, accelerator: string): boolean {
    try {
      return globalShortcut.register(accelerator, () => this.#run(id));
    } catch {
      return false;
    }
  }

  #run(id: string): void {
    const binding = this.#registered.get(id);
    const window = this.#getWindow();
    if (!binding || !window || window.isDestroyed()) return;

    if (binding.action === "toggle-panel") {
      this.#showAndFocus(window);
      window.webContents.send(IPC.shortcutTriggered, binding.action);
      return;
    }

    const chord = DISCORD_ACTION_CHORDS[binding.action];
    if (!chord) return;
    if (!BACKGROUND_ACTIONS.has(binding.action)) this.#showAndFocus(window);

    window.webContents.sendInputEvent({
      type: "keyDown",
      keyCode: chord.keyCode,
      modifiers: chord.modifiers ?? []
    });
    window.webContents.sendInputEvent({
      type: "keyUp",
      keyCode: chord.keyCode,
      modifiers: chord.modifiers ?? []
    });
  }

  #showAndFocus(window: BrowserWindow): void {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
}
