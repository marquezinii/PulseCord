import { isShortcutAction } from "../shared/contracts";
import type {
  AppSettings,
  NativeBridge,
  ShortcutAccelerator,
  ShortcutAction
} from "../shared/contracts";

const SHORTCUT_GROUPS = [
  {
    title: "Discord",
    description: "Controles que continuam funcionando com o PulseCord em segundo plano.",
    actions: ["toggle-mute", "toggle-deafen"]
  },
  {
    title: "PulseCord",
    description: "Acesso rápido às ferramentas próprias do cliente.",
    actions: ["toggle-panel"]
  }
] as const satisfies ReadonlyArray<{
  title: string;
  description: string;
  actions: readonly ShortcutAction[];
}>;

const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  "toggle-panel": "Abrir PulsePanel",
  "toggle-mute": "Alternar microfone",
  "toggle-deafen": "Alternar áudio recebido"
};

const SHORTCUT_DESCRIPTIONS: Record<ShortcutAction, string> = {
  "toggle-panel": "Mostra ou esconde o painel de controles do PulseCord.",
  "toggle-mute": "Silencia ou reativa o seu microfone no Discord.",
  "toggle-deafen": "Silencia ou reativa todo o áudio recebido do Discord."
};

export interface ShortcutEditorController {
  cancelRecording(): void;
  destroy(): void;
}

interface ShortcutEditorOptions {
  onStatus(message: string, kind: "success" | "error" | "info"): void;
}

export function mountShortcutEditor(
  root: HTMLElement,
  settings: AppSettings,
  bridge: NativeBridge,
  options: ShortcutEditorOptions
): ShortcutEditorController {
  let recordingAction: ShortcutAction | undefined;

  for (const group of SHORTCUT_GROUPS) {
    const section = document.createElement("section");
    section.className = "pc-shortcut-group";
    section.innerHTML = `
      <div class="pc-shortcut-group-heading">
        <div>
          <h3>${group.title}</h3>
          <p>${group.description}</p>
        </div>
        <span>${group.actions.length} ${group.actions.length === 1 ? "ação" : "ações"}</span>
      </div>
      <div class="pc-shortcut-list"></div>
    `;

    const list = requireElement<HTMLDivElement>(section, ".pc-shortcut-list");
    for (const action of group.actions) {
      const row = document.createElement("div");
      row.className = "pc-shortcut-row";
      row.innerHTML = `
        <span class="pc-shortcut-copy">
          <strong>${SHORTCUT_LABELS[action]}</strong>
          <small>${SHORTCUT_DESCRIPTIONS[action]}</small>
        </span>
        <button type="button" data-shortcut="${action}" aria-label="Definir ${SHORTCUT_LABELS[action]}">
          ${formatShortcut(settings.shortcuts[action])}
        </button>
      `;
      list.append(row);
    }

    root.append(section);
  }

  const cancelRecording = (): void => {
    if (!recordingAction) return;
    const button = root.querySelector<HTMLButtonElement>(`button[data-shortcut="${recordingAction}"]`);
    if (button) {
      button.classList.remove("recording");
      button.textContent = formatShortcut(settings.shortcuts[recordingAction]);
    }
    recordingAction = undefined;
  };

  const onClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button[data-shortcut]");
    const action = button?.dataset.shortcut;
    if (!button || !isShortcutAction(action)) return;

    cancelRecording();
    recordingAction = action;
    button.classList.add("recording");
    button.textContent = "Pressione as teclas…";
    button.focus();
    options.onStatus("Pressione a combinação desejada. Esc cancela; Backspace remove.", "info");
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!recordingAction) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (/^(?:Control|Alt|Shift|Meta)(?:Left|Right)?$/.test(event.code)) return;

    const action = recordingAction;
    const button = requireElement<HTMLButtonElement>(root, `button[data-shortcut="${action}"]`);
    if (event.code === "Escape") {
      cancelRecording();
      options.onStatus("Edição cancelada.", "info");
      return;
    }

    const accelerator = isShortcutClearKey(event) ? null : keyboardAccelerator(event);
    if (accelerator === undefined) {
      options.onStatus("Use uma tecla junto com Ctrl, Alt, Shift ou Win.", "error");
      return;
    }

    recordingAction = undefined;
    button.classList.remove("recording");
    button.disabled = true;
    void bridge
      .setShortcut(action, accelerator)
      .then((updated) => {
        settings.shortcuts = updated.shortcuts;
        button.textContent = formatShortcut(updated.shortcuts[action]);
        options.onStatus(accelerator ? "Atalho salvo e ativado." : "Atalho removido.", "success");
      })
      .catch((error: unknown) => {
        button.textContent = formatShortcut(settings.shortcuts[action]);
        options.onStatus("Essa combinação já está em uso ou não está disponível.", "error");
        console.error("[PulseCord] Desktop shortcut update failed.", error);
      })
      .finally(() => {
        button.disabled = false;
      });
  };

  root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeyDown, true);

  return {
    cancelRecording,
    destroy(): void {
      cancelRecording();
      root.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown, true);
    }
  };
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`PulseCord shortcut editor element not found: ${selector}`);
  return element;
}

function formatShortcut(accelerator: ShortcutAccelerator): string {
  return (
    accelerator
      ?.replaceAll("CommandOrControl", "Cmd/Ctrl")
      .replaceAll("Control", "Ctrl")
      .replaceAll("Super", "Win") ?? "Definir atalho"
  );
}

function hasModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.altKey || event.shiftKey || event.metaKey;
}

function isShortcutClearKey(event: KeyboardEvent): boolean {
  return !hasModifier(event) && /^(?:backspace|delete)$/i.test(event.code || event.key);
}

function keyboardAccelerator(event: KeyboardEvent): ShortcutAccelerator | undefined {
  if (!hasModifier(event)) return undefined;

  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Super");

  const key = acceleratorKey(event.code);
  if (!key) return undefined;
  return `${modifiers.join("+")}+${key}`;
}

function acceleratorKey(code: string): string | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) return code;

  return {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Space: "Space",
    Enter: "Return",
    Tab: "Tab",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Insert: "Insert",
    Delete: "Delete",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Semicolon: ";",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Backquote: "`",
    Minus: "-",
    Equal: "="
  }[code];
}
