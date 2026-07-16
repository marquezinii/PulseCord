import { globalShortcut, type BrowserWindow } from "electron";

import { IPC, SHORTCUT_ACTIONS, type AppSettings, type ShortcutAccelerator, type ShortcutAction } from "../shared/contracts";

const DISCORD_ACTION_KEYS: Partial<Record<ShortcutAction, string>> = {
  "toggle-mute": "M",
  "toggle-deafen": "D"
};

export class ShortcutManager {
  readonly #getWindow: () => BrowserWindow | undefined;
  readonly #registered = new Map<ShortcutAction, string>();

  constructor(getWindow: () => BrowserWindow | undefined) {
    this.#getWindow = getWindow;
  }

  configure(settings: AppSettings): void {
    for (const action of SHORTCUT_ACTIONS) {
      const accelerator = settings.shortcuts[action];
      if (accelerator) this.update(action, accelerator);
    }
  }

  update(action: ShortcutAction, accelerator: ShortcutAccelerator): boolean {
    const previous = this.#registered.get(action);
    if (previous === accelerator) return true;
    if (previous) globalShortcut.unregister(previous);

    if (!accelerator) {
      this.#registered.delete(action);
      return true;
    }

    const registered = this.#register(action, accelerator);
    if (registered) {
      this.#registered.set(action, accelerator);
      return true;
    }

    if (previous && this.#register(action, previous)) {
      this.#registered.set(action, previous);
    } else {
      this.#registered.delete(action);
    }
    return false;
  }

  get(action: ShortcutAction): ShortcutAccelerator {
    return this.#registered.get(action) ?? null;
  }

  dispose(): void {
    for (const accelerator of this.#registered.values()) globalShortcut.unregister(accelerator);
    this.#registered.clear();
  }

  #register(action: ShortcutAction, accelerator: string): boolean {
    try {
      return globalShortcut.register(accelerator, () => this.#run(action));
    } catch {
      return false;
    }
  }

  #run(action: ShortcutAction): void {
    const window = this.#getWindow();
    if (!window || window.isDestroyed()) return;

    if (action === "toggle-panel") {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      window.webContents.send(IPC.shortcutTriggered, action);
      return;
    }

    const keyCode = DISCORD_ACTION_KEYS[action];
    if (!keyCode) return;
    window.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers: ["control", "shift"] });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers: ["control", "shift"] });
  }
}
