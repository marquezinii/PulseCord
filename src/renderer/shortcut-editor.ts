import { isShortcutAction, type AppSettings, type NativeBridge, type ShortcutAction, type ShortcutBinding } from "../shared/contracts";

interface ShortcutActionOption {
  id: ShortcutAction;
  label: string;
  description: string;
}

export const SHORTCUT_ACTION_CATALOG: readonly ShortcutActionOption[] = [
  {
    id: "toggle-panel",
    label: "Abrir PulsePanel",
    description: "Mostra ou esconde os controles rápidos do PulseCord."
  },
  {
    id: "toggle-mute",
    label: "Alternar microfone",
    description: "Silencia ou reativa o seu microfone."
  },
  {
    id: "toggle-deafen",
    label: "Alternar áudio recebido",
    description: "Silencia ou reativa todo o áudio recebido."
  },
  {
    id: "open-quick-switcher",
    label: "Abrir troca rápida",
    description: "Abre a busca rápida por canais e conversas."
  },
  {
    id: "search-channel",
    label: "Pesquisar no canal",
    description: "Abre a pesquisa do canal ou conversa atual."
  },
  {
    id: "search-global",
    label: "Pesquisar no Discord",
    description: "Abre a pesquisa global do Discord."
  },
  {
    id: "toggle-inbox",
    label: "Abrir caixa de entrada",
    description: "Mostra ou esconde a caixa de entrada."
  },
  {
    id: "toggle-members",
    label: "Alternar lista de membros",
    description: "Mostra ou esconde os membros do canal."
  },
  {
    id: "mark-channel-read",
    label: "Marcar canal como lido",
    description: "Limpa as notificações do canal atual."
  },
  {
    id: "mark-server-read",
    label: "Marcar servidor como lido",
    description: "Limpa as notificações do servidor atual."
  },
  {
    id: "upload-file",
    label: "Enviar arquivo",
    description: "Abre o seletor de arquivos da conversa atual."
  }
] as const;

const ACTION_BY_ID = new Map<ShortcutAction, ShortcutActionOption>(
  SHORTCUT_ACTION_CATALOG.map((action) => [action.id, action])
);
let shortcutEditorSequence = 0;

export interface ShortcutEditorController {
  cancelRecording(): void;
  destroy(): void;
  refresh(settings: AppSettings): void;
}

interface ShortcutEditorOptions {
  onStatus?(message: string, kind: "success" | "error" | "info"): void;
}

interface RecordingTarget {
  kind: "create" | "update";
  button: HTMLButtonElement;
  binding?: ShortcutBinding;
}

export function mountShortcutEditor(
  root: HTMLElement,
  settings: AppSettings,
  bridge: NativeBridge,
  options: ShortcutEditorOptions = {}
): ShortcutEditorController {
  root.replaceChildren();
  root.classList.add("pcs-editor-host");
  const shadow = root.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = SHORTCUT_EDITOR_CSS;
  const surface = document.createElement("div");
  surface.className = "pcs-editor";
  shadow.append(style, surface);
  const editorId = `pcs-editor-${++shortcutEditorSequence}`;
  const builderTitleId = `${editorId}-builder-title`;
  const bindingsTitleId = `${editorId}-bindings-title`;

  const builder = document.createElement("section");
  builder.className = "pcs-builder";
  builder.setAttribute("aria-labelledby", builderTitleId);
  builder.innerHTML = `
    <div class="pcs-builder-heading">
      <span class="pcs-builder-icon" aria-hidden="true">+</span>
      <span>
        <strong id="${builderTitleId}">Adicionar atalho</strong>
        <small>Escolha uma ação e pressione a combinação desejada.</small>
      </span>
    </div>
    <div class="pcs-builder-controls">
      <label class="pcs-field">
        <span>Ação</span>
        <select data-role="action" aria-label="Ação do novo atalho"></select>
      </label>
      <div class="pcs-field">
        <span>Combinação</span>
        <button class="pcs-recorder" type="button" data-role="create-recorder" aria-label="Definir combinação do novo atalho"></button>
      </div>
      <button class="pcs-add" type="button" data-role="create" disabled>Adicionar</button>
    </div>
  `;

  const listSection = document.createElement("section");
  listSection.className = "pcs-bindings";
  listSection.setAttribute("aria-labelledby", bindingsTitleId);
  listSection.innerHTML = `
    <div class="pcs-list-heading">
      <span>
        <strong id="${bindingsTitleId}">Seus atalhos</strong>
        <small>Atalhos globais funcionam mesmo com outra janela em primeiro plano.</small>
      </span>
      <span class="pcs-count" data-role="count" aria-live="polite"></span>
    </div>
    <div class="pcs-list" data-role="list"></div>
  `;

  surface.append(builder, listSection);

  const actionSelect = requireElement<HTMLSelectElement>(builder, '[data-role="action"]');
  const createRecorder = requireElement<HTMLButtonElement>(builder, '[data-role="create-recorder"]');
  const createButton = requireElement<HTMLButtonElement>(builder, '[data-role="create"]');
  const count = requireElement<HTMLElement>(listSection, '[data-role="count"]');
  const list = requireElement<HTMLElement>(listSection, '[data-role="list"]');

  let currentSettings = settings;
  let draftAccelerator: string | undefined;
  let recording: RecordingTarget | undefined;
  let busy = false;
  let destroyed = false;
  let interactionVersion = 0;
  let registeredIds = new Set<string>();
  let registrationLoaded = false;

  const notify = (message: string, kind: "success" | "error" | "info"): void => {
    options.onStatus?.(message, kind);
  };

  const availableActions = (): ShortcutActionOption[] => {
    const used = new Set(currentSettings.shortcuts.bindings.map((binding) => binding.action));
    return SHORTCUT_ACTION_CATALOG.filter((action) => !used.has(action.id));
  };

  const selectedAction = (): ShortcutAction | undefined => {
    return isShortcutAction(actionSelect.value) ? actionSelect.value : undefined;
  };

  const renderBuilder = (): void => {
    const previousSelection = selectedAction();
    const available = availableActions();
    actionSelect.replaceChildren();

    if (available.length === 0) {
      const option = document.createElement("option");
      option.textContent = "Todas as ações já foram adicionadas";
      option.value = "";
      actionSelect.append(option);
    } else {
      for (const action of available) {
        const option = document.createElement("option");
        option.value = action.id;
        option.textContent = action.label;
        option.selected = action.id === previousSelection;
        actionSelect.append(option);
      }
    }

    actionSelect.disabled = busy || available.length === 0;
    createRecorder.disabled = busy || available.length === 0;
    createButton.disabled = busy || !draftAccelerator || available.length === 0;
    createRecorder.classList.toggle("is-empty", !draftAccelerator);
    renderAccelerator(createRecorder, draftAccelerator, draftAccelerator ? "Alterar combinação" : "Definir atalho");
  };

  const renderList = (): void => {
    list.replaceChildren();
    const bindings = currentSettings.shortcuts.bindings;
    count.textContent = `${bindings.length} ${bindings.length === 1 ? "atalho" : "atalhos"}`;

    if (bindings.length === 0) {
      const empty = document.createElement("div");
      empty.className = "pcs-empty";
      empty.innerHTML = `
        <span aria-hidden="true">⌨</span>
        <strong>Nenhum atalho personalizado</strong>
        <small>Use o campo acima para criar o primeiro.</small>
      `;
      list.append(empty);
      return;
    }

    for (const binding of bindings) {
      const action = ACTION_BY_ID.get(binding.action);
      if (!action) continue;

      const row = document.createElement("article");
      row.className = "pcs-row";
      row.dataset.bindingId = binding.id;

      const copy = document.createElement("span");
      copy.className = "pcs-copy";
      const titleLine = document.createElement("span");
      titleLine.className = "pcs-copy-title";
      const label = document.createElement("strong");
      label.textContent = action.label;
      const registration = document.createElement("em");
      const active = registeredIds.has(binding.id);
      registration.dataset.kind = registrationLoaded ? (active ? "active" : "unavailable") : "checking";
      registration.textContent = registrationLoaded ? (active ? "Ativo" : "Indisponível") : "Verificando";
      const description = document.createElement("small");
      description.textContent = action.description;
      titleLine.append(label, registration);
      copy.append(titleLine, description);

      const controls = document.createElement("span");
      controls.className = "pcs-row-controls";
      const recorder = document.createElement("button");
      recorder.className = "pcs-recorder";
      recorder.type = "button";
      recorder.dataset.role = "update-recorder";
      recorder.dataset.bindingId = binding.id;
      recorder.setAttribute("aria-label", `Editar atalho: ${action.label}`);
      renderAccelerator(recorder, binding.accelerator, "Editar");

      const remove = document.createElement("button");
      remove.className = "pcs-remove";
      remove.type = "button";
      remove.dataset.role = "remove";
      remove.dataset.bindingId = binding.id;
      remove.setAttribute("aria-label", `Remover atalho: ${action.label}`);
      remove.title = "Remover";
      remove.innerHTML = removeGlyph();

      recorder.disabled = busy;
      remove.disabled = busy;
      controls.append(recorder, remove);
      row.append(copy, controls);
      list.append(row);
    }
  };

  const render = (): void => {
    renderBuilder();
    renderList();
  };

  const cancelRecording = (): void => {
    if (!recording) return;
    const target = recording;
    recording = undefined;
    target.button.classList.remove("is-recording");
    if (target.kind === "create") {
      renderAccelerator(target.button, draftAccelerator, draftAccelerator ? "Alterar combinação" : "Definir atalho");
    } else if (target.binding) {
      renderAccelerator(target.button, target.binding.accelerator, "Editar");
    }
  };

  const beginRecording = (target: RecordingTarget): void => {
    if (busy) return;
    cancelRecording();
    recording = target;
    target.button.classList.add("is-recording");
    target.button.replaceChildren();
    const prompt = document.createElement("span");
    prompt.className = "pcs-recording-label";
    prompt.textContent = "Pressione as teclas…";
    target.button.append(prompt);
    target.button.focus();
    notify("Pressione uma combinação com Ctrl, Alt, Shift ou Win. Esc cancela.", "info");
  };

  const replaceSettings = (updated: AppSettings): void => {
    currentSettings = updated;
    settings.shortcuts = updated.shortcuts;
  };

  const refreshRegistrations = async (): Promise<void> => {
    try {
      registeredIds = new Set(await bridge.getShortcutRegistrations());
      registrationLoaded = true;
    } catch (error) {
      registrationLoaded = false;
      console.error("[PulseCord] Could not read shortcut registration state.", error);
    }
  };

  const runMutation = async (operation: () => Promise<AppSettings>, successMessage: string): Promise<void> => {
    if (busy) return;
    busy = true;
    cancelRecording();
    render();
    try {
      const updated = await operation();
      if (destroyed) return;
      replaceSettings(updated);
      await refreshRegistrations();
      if (destroyed) return;
      draftAccelerator = undefined;
      notify(successMessage, "success");
    } catch (error) {
      if (!destroyed) {
        notify("A combinação está em uso ou não pôde ser salva.", "error");
        console.error("[PulseCord] Shortcut update failed.", error);
      }
    } finally {
      busy = false;
      if (!destroyed) render();
    }
  };

  const onClick = (event: MouseEvent): void => {
    if (!event.isTrusted) return;
    if (!(event.target instanceof Element) || busy) return;
    const button = event.target.closest<HTMLButtonElement>("button[data-role]");
    if (!button) return;
    interactionVersion += 1;

    if (button.dataset.role === "create-recorder") {
      beginRecording({ kind: "create", button });
      return;
    }

    if (button.dataset.role === "create") {
      const action = selectedAction();
      if (!action || !draftAccelerator) return;
      void runMutation(() => bridge.createShortcut(action, draftAccelerator as string), "Atalho adicionado e ativado.");
      return;
    }

    const id = button.dataset.bindingId;
    const binding = currentSettings.shortcuts.bindings.find((candidate) => candidate.id === id);
    if (!binding) return;

    if (button.dataset.role === "update-recorder") {
      beginRecording({ kind: "update", button, binding });
      return;
    }

    if (button.dataset.role === "remove") {
      void runMutation(() => bridge.removeShortcut(binding.id), "Atalho removido.");
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!event.isTrusted) return;
    if (!recording) return;
    interactionVersion += 1;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (isModifierOnly(event.code)) return;

    if (event.code === "Escape") {
      cancelRecording();
      notify("Edição cancelada.", "info");
      return;
    }

    if (isClearKey(event)) {
      if (recording.kind === "create") {
        draftAccelerator = undefined;
        cancelRecording();
        renderBuilder();
        notify("Combinação limpa.", "info");
      } else {
        cancelRecording();
        notify("Use o botão de remover para excluir este atalho.", "info");
      }
      return;
    }

    const accelerator = keyboardAccelerator(event);
    if (!accelerator) {
      notify("Inclua Ctrl, Alt, Shift ou Win na combinação.", "error");
      return;
    }

    const target = recording;
    recording = undefined;
    target.button.classList.remove("is-recording");
    if (target.kind === "create") {
      draftAccelerator = accelerator;
      renderBuilder();
      createButton.focus();
      return;
    }

    if (target.binding) {
      const { id, action } = target.binding;
      void runMutation(() => bridge.updateShortcut(id, action, accelerator), "Atalho atualizado e ativado.");
    }
  };

  builder.addEventListener("click", onClick);
  list.addEventListener("click", onClick);
  actionSelect.addEventListener("change", markInteraction);
  document.addEventListener("keydown", onKeyDown, true);
  render();
  const loadVersion = interactionVersion;
  void Promise.all([bridge.getSettings(), bridge.getShortcutRegistrations()])
    .then(([updated, activeIds]) => {
      if (destroyed || interactionVersion !== loadVersion) return;
      cancelRecording();
      replaceSettings(updated);
      registeredIds = new Set(activeIds);
      registrationLoaded = true;
      render();
    })
    .catch((error: unknown) => {
      console.error("[PulseCord] Could not refresh shortcut settings.", error);
    });

  return {
    cancelRecording,
    refresh(updated): void {
      cancelRecording();
      replaceSettings(updated);
      render();
      void refreshRegistrations().then(() => {
        if (!destroyed) renderList();
      });
    },
    destroy(): void {
      destroyed = true;
      cancelRecording();
      builder.removeEventListener("click", onClick);
      list.removeEventListener("click", onClick);
      actionSelect.removeEventListener("change", markInteraction);
      document.removeEventListener("keydown", onKeyDown, true);
      root.classList.remove("pcs-editor-host");
      root.replaceChildren();
      shadow.replaceChildren();
    }
  };

  function markInteraction(event: Event): void {
    if (event.isTrusted) interactionVersion += 1;
  }
}

function renderAccelerator(button: HTMLButtonElement, accelerator: string | undefined, fallback: string): void {
  button.replaceChildren();
  if (!accelerator) {
    const label = document.createElement("span");
    label.className = "pcs-recorder-placeholder";
    label.textContent = fallback;
    button.append(label);
    return;
  }

  const keys = document.createElement("span");
  keys.className = "pcs-keycaps";
  for (const token of displayTokens(accelerator)) {
    const key = document.createElement("kbd");
    key.textContent = token;
    keys.append(key);
  }
  button.append(keys);
}

function displayTokens(accelerator: string): string[] {
  return accelerator.split("+").map((token) => ({
    CommandOrControl: "Ctrl",
    Control: "Ctrl",
    Super: "Win",
    Return: "Enter",
    Up: "↑",
    Down: "↓",
    Left: "←",
    Right: "→"
  })[token] ?? token);
}

function isModifierOnly(code: string): boolean {
  return /^(?:Control|Alt|Shift|Meta)(?:Left|Right)?$/.test(code);
}

function hasModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.altKey || event.shiftKey || event.metaKey;
}

function isClearKey(event: KeyboardEvent): boolean {
  return !hasModifier(event) && /^(?:Backspace|Delete)$/i.test(event.code || event.key);
}

function keyboardAccelerator(event: KeyboardEvent): string | undefined {
  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Super");

  const key = acceleratorKey(event.code);
  return key ? [...modifiers, key].join("+") : undefined;
}

function acceleratorKey(code: string): string | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`;
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

function removeGlyph(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.5 3.5h7l.75 2H20v2h-1l-.7 12.25a1.75 1.75 0 0 1-1.75 1.65h-9.1a1.75 1.75 0 0 1-1.75-1.65L5 7.5H4v-2h3.75l.75-2Zm1.4 2h4.2l-.2-.5h-3.8l-.2.5ZM7 7.5l.68 11.9h8.64L17 7.5H7Zm2.25 2h1.8v7.5h-1.8V9.5Zm3.7 0h1.8v7.5h-1.8V9.5Z"/></svg>';
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`PulseCord shortcut editor element not found: ${selector}`);
  return element;
}

const SHORTCUT_EDITOR_CSS = `
  .pcs-editor, .pcs-editor * { box-sizing: border-box; }
  .pcs-editor { display: grid; gap: 26px; color: var(--text-default, #f2f3f5); }
  .pcs-builder { padding: 18px; border: 1px solid color-mix(in srgb, #d43f55 27%, var(--background-modifier-accent, transparent)); border-radius: 16px; background: color-mix(in srgb, #d43f55 5%, var(--background-secondary, #2b2d31)); }
  .pcs-builder-heading { display: flex; align-items: center; gap: 11px; margin-bottom: 16px; }
  .pcs-builder-heading > span:last-child, .pcs-list-heading > span:first-child { display: grid; gap: 3px; min-width: 0; }
  .pcs-builder-icon { display: grid; place-items: center; width: 31px; height: 31px; border-radius: 9px; color: #fff; background: #bd354b; font-size: 20px; font-weight: 500; }
  .pcs-builder strong, .pcs-list-heading strong { color: var(--header-primary, #f2f3f5); font-size: 14px; font-weight: 680; letter-spacing: -.01em; }
  .pcs-builder small, .pcs-list-heading small { color: var(--text-muted, #949ba4); font-size: 12px; line-height: 1.4; }
  .pcs-builder-controls { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(180px, auto) auto; gap: 10px; align-items: end; }
  .pcs-field { display: grid; gap: 6px; min-width: 0; }
  .pcs-field > span { color: var(--text-muted, #b5bac1); font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .055em; }
  .pcs-field select, .pcs-recorder, .pcs-add { height: 42px; border: 1px solid var(--background-modifier-accent, rgba(255,255,255,.1)); border-radius: 9px; color: var(--interactive-normal, #dbdee1); background: var(--background-tertiary, #1e1f22); font: inherit; }
  .pcs-field select { width: 100%; padding: 0 34px 0 12px; font-size: 13px; cursor: pointer; }
  .pcs-recorder { min-width: 170px; padding: 5px 10px; cursor: pointer; transition: border-color .14s ease, background .14s ease, transform .14s ease; }
  .pcs-recorder:hover:not(:disabled) { border-color: color-mix(in srgb, #d43f55 68%, transparent); background: color-mix(in srgb, #d43f55 8%, var(--background-tertiary, #1e1f22)); }
  .pcs-recorder:active:not(:disabled), .pcs-add:active:not(:disabled), .pcs-remove:active:not(:disabled) { transform: translateY(1px); }
  .pcs-recorder.is-recording { border-color: #d43f55; background: color-mix(in srgb, #d43f55 13%, var(--background-tertiary, #1e1f22)); box-shadow: 0 0 0 3px rgba(212,63,85,.11); }
  .pcs-recorder-placeholder, .pcs-recording-label { color: var(--text-muted, #b5bac1); font-size: 12px; font-weight: 620; }
  .pcs-recording-label { color: #f1a4b0; }
  .pcs-keycaps { display: flex; align-items: center; justify-content: center; gap: 5px; }
  .pcs-keycaps kbd { min-width: 25px; padding: 4px 7px 5px; border: 1px solid color-mix(in srgb, var(--text-muted, #b5bac1) 35%, transparent); border-radius: 6px; color: var(--header-primary, #f2f3f5); background: color-mix(in srgb, white 4%, var(--background-secondary, #2b2d31)); box-shadow: inset 0 -2px 0 rgba(0,0,0,.25), 0 1px 2px rgba(0,0,0,.16); font-family: inherit; font-size: 11px; font-weight: 690; line-height: 1.15; text-align: center; }
  .pcs-add { padding: 0 16px; border-color: #ad3045; color: #fff; background: #bd354b; font-size: 12px; font-weight: 680; cursor: pointer; }
  .pcs-add:hover:not(:disabled) { background: #cb3b52; }
  .pcs-add:disabled, .pcs-recorder:disabled, .pcs-field select:disabled, .pcs-remove:disabled { opacity: .48; cursor: not-allowed; }
  .pcs-bindings { display: grid; gap: 11px; }
  .pcs-list-heading { display: flex; align-items: end; justify-content: space-between; gap: 16px; padding: 0 2px; }
  .pcs-count { flex: 0 0 auto; padding: 4px 8px; border-radius: 7px; color: var(--text-muted, #949ba4); background: var(--background-secondary, #2b2d31); font-size: 10px; font-weight: 650; }
  .pcs-list { overflow: hidden; border: 1px solid var(--background-modifier-accent, rgba(255,255,255,.08)); border-radius: 14px; background: var(--background-secondary, #2b2d31); }
  .pcs-row { display: flex; align-items: center; gap: 22px; min-height: 76px; padding: 14px 15px; border-top: 1px solid var(--background-modifier-accent, rgba(255,255,255,.07)); }
  .pcs-row:first-child { border-top: 0; }
  .pcs-copy { flex: 1; min-width: 0; display: grid; gap: 4px; }
  .pcs-copy-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .pcs-copy strong { color: var(--header-primary, #f2f3f5); font-size: 13px; font-weight: 650; }
  .pcs-copy em { flex: 0 0 auto; padding: 3px 6px; border-radius: 6px; font-size: 9px; font-style: normal; font-weight: 720; text-transform: uppercase; letter-spacing: .04em; }
  .pcs-copy em[data-kind="active"] { color: #77d6a6; background: rgba(35,165,90,.13); }
  .pcs-copy em[data-kind="unavailable"] { color: #f08a99; background: rgba(212,63,85,.13); }
  .pcs-copy em[data-kind="checking"] { color: var(--text-muted, #949ba4); background: var(--background-modifier-accent, rgba(255,255,255,.07)); }
  .pcs-copy small { color: var(--text-muted, #949ba4); font-size: 11.5px; line-height: 1.42; }
  .pcs-row-controls { flex: 0 0 auto; display: flex; align-items: center; gap: 7px; }
  .pcs-row .pcs-recorder { height: 40px; min-width: 150px; }
  .pcs-remove { display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid transparent; border-radius: 9px; color: var(--interactive-muted, #80848e); background: transparent; cursor: pointer; transition: .14s ease; }
  .pcs-remove:hover:not(:disabled) { border-color: color-mix(in srgb, #da4860 30%, transparent); color: #f07487; background: rgba(212,63,85,.08); }
  .pcs-remove svg { width: 18px; height: 18px; }
  .pcs-empty { min-height: 150px; display: grid; place-items: center; align-content: center; gap: 5px; padding: 28px; color: var(--text-muted, #949ba4); text-align: center; }
  .pcs-empty > span { margin-bottom: 3px; font-size: 26px; opacity: .6; }
  .pcs-empty strong { color: var(--interactive-normal, #dbdee1); font-size: 13px; font-weight: 640; }
  .pcs-empty small { font-size: 11.5px; }
  .pcs-editor button:focus-visible, .pcs-editor select:focus-visible { outline: 2px solid #e66d80; outline-offset: 2px; }
  @media (max-width: 780px) {
    .pcs-builder-controls { grid-template-columns: 1fr; }
    .pcs-recorder, .pcs-add { width: 100%; }
    .pcs-row { align-items: stretch; flex-direction: column; gap: 12px; }
    .pcs-row-controls, .pcs-row .pcs-recorder { width: 100%; }
    .pcs-row .pcs-recorder { flex: 1; }
  }
`;
