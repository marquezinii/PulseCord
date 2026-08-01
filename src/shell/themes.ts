import {
  isCustomCss,
  isThemeName,
  MAX_CUSTOM_CSS_LENGTH,
  MAX_THEMES,
  MAX_THEME_NAME_LENGTH,
  type Theme,
  type ThemeSettings
} from "../shared/contracts";

/**
 * The theme library: PulseCord's own screen for writing and applying CSS to
 * the connected Discord surface.
 *
 * There is no live preview. On this screen the Discord surface is hidden, so
 * "preview as you type" would be styling something the user cannot see;
 * applying a theme is an explicit act, and the result is visible on returning
 * to Discord.
 */

export interface ThemeLibraryActions {
  create(name: string, css: string): Promise<ThemeSettings>;
  update(id: string, name: string, css: string): Promise<ThemeSettings>;
  remove(id: string): Promise<ThemeSettings>;
  activate(id: string | null): Promise<ThemeSettings>;
}

export interface ThemeLibraryController {
  refresh(theme: ThemeSettings): void;
}

export function renderThemeLibrary(
  target: Document,
  host: HTMLElement,
  initial: ThemeSettings,
  actions: ThemeLibraryActions
): ThemeLibraryController {
  host.replaceChildren();

  let library = cloneLibrary(initial);
  /** Which theme the editor is bound to; null means "a new, unsaved theme". */
  let editingId: string | null = null;
  let busy = false;

  const screen = target.createElement("section");
  screen.className = "screen";
  screen.setAttribute("aria-label", "Biblioteca de Temas");
  screen.innerHTML = `
    <header class="screen-header">
      <h1>Biblioteca de Temas</h1>
      <p>Escreva temas em CSS e aplique um deles ao Discord. Tudo fica salvo apenas neste computador.</p>
    </header>
    <div class="theme-layout">
      <aside class="theme-list" aria-label="Temas salvos"></aside>
      <form class="theme-editor" novalidate>
        <label class="field">
          <span>Nome</span>
          <input type="text" name="name" autocomplete="off" spellcheck="false" />
        </label>
        <label class="field">
          <span>CSS <em data-role="counter"></em></span>
          <textarea name="css" autocomplete="off" spellcheck="false" placeholder=":root {&#10;  --brand-500: #8b5cf6;&#10;}"></textarea>
        </label>
        <p class="theme-note">Imports e endereços externos são bloqueados: um tema não pode buscar nada na internet.</p>
        <p class="theme-status" role="status" aria-live="polite"></p>
        <div class="theme-actions">
          <button type="submit" class="primary" data-role="save">Salvar tema</button>
          <button type="button" data-role="discard">Descartar</button>
        </div>
      </form>
    </div>
  `;
  host.append(screen);

  const list = requireElement<HTMLElement>(screen, ".theme-list");
  const form = requireElement<HTMLFormElement>(screen, ".theme-editor");
  const nameInput = requireElement<HTMLInputElement>(screen, 'input[name="name"]');
  const cssInput = requireElement<HTMLTextAreaElement>(screen, 'textarea[name="css"]');
  const counter = requireElement<HTMLElement>(screen, '[data-role="counter"]');
  const status = requireElement<HTMLElement>(screen, ".theme-status");
  const save = requireElement<HTMLButtonElement>(screen, '[data-role="save"]');
  const discard = requireElement<HTMLButtonElement>(screen, '[data-role="discard"]');

  nameInput.maxLength = MAX_THEME_NAME_LENGTH;
  cssInput.maxLength = MAX_CUSTOM_CSS_LENGTH;

  const setStatus = (message: string, kind: "error" | "info" | "success" | "none"): void => {
    status.textContent = message;
    status.dataset.kind = kind;
  };

  const problemWithDraft = (): string | undefined => {
    if (!isThemeName(nameInput.value)) return "Dê um nome ao tema.";
    if (!isCustomCss(cssInput.value)) return "Remova @import ou endereços externos do CSS.";
    if (editingId === null && library.themes.length >= MAX_THEMES) {
      return `Você já tem ${MAX_THEMES} temas. Apague um antes de criar outro.`;
    }
    return undefined;
  };

  const renderEditor = (): void => {
    counter.textContent = `${cssInput.value.length.toLocaleString("pt-BR")} / ${MAX_CUSTOM_CSS_LENGTH.toLocaleString("pt-BR")}`;
    save.textContent = editingId === null ? "Criar tema" : "Salvar alterações";
    save.disabled = busy || Boolean(problemWithDraft());
    discard.disabled = busy;
    nameInput.disabled = busy;
    cssInput.disabled = busy;
  };

  const editNew = (): void => {
    editingId = null;
    nameInput.value = "";
    cssInput.value = "";
    setStatus("", "none");
    renderList();
    renderEditor();
  };

  const edit = (theme: Theme): void => {
    editingId = theme.id;
    nameInput.value = theme.name;
    cssInput.value = theme.css;
    setStatus("", "none");
    renderList();
    renderEditor();
  };

  const run = async (operation: () => Promise<ThemeSettings>, success: string): Promise<void> => {
    if (busy) return;
    busy = true;
    renderEditor();
    try {
      library = cloneLibrary(await operation());
      setStatus(success, "success");
      renderList();
    } catch (error) {
      setStatus("Não foi possível salvar. Tente de novo.", "error");
      console.error("[PulseCord] A theme operation failed.", error);
    } finally {
      busy = false;
      renderEditor();
    }
  };

  function renderList(): void {
    list.replaceChildren();

    const heading = target.createElement("div");
    heading.className = "theme-list-heading";
    heading.textContent = `${library.themes.length} de ${MAX_THEMES}`;
    list.append(heading);

    const newButton = target.createElement("button");
    newButton.type = "button";
    newButton.className = "theme-new";
    newButton.textContent = "+ Novo tema";
    newButton.disabled = library.themes.length >= MAX_THEMES;
    newButton.addEventListener("click", editNew);
    list.append(newButton);

    if (library.themes.length === 0) {
      const empty = target.createElement("p");
      empty.className = "theme-empty";
      empty.textContent = "Nenhum tema salvo ainda.";
      list.append(empty);
      return;
    }

    for (const theme of library.themes) {
      const item = target.createElement("div");
      item.className = "theme-item";
      item.dataset.themeId = theme.id;
      if (theme.id === editingId) item.classList.add("editing");

      const open = target.createElement("button");
      open.type = "button";
      open.className = "theme-open";
      open.textContent = theme.name;
      open.addEventListener("click", () => edit(theme));

      const applied = theme.id === library.activeThemeId;
      const toggle = target.createElement("button");
      toggle.type = "button";
      toggle.className = "theme-toggle";
      toggle.textContent = applied ? "Aplicado" : "Aplicar";
      if (applied) toggle.classList.add("on");
      toggle.addEventListener("click", () => {
        void run(() => actions.activate(applied ? null : theme.id), applied ? "Tema removido." : "Tema aplicado.");
      });

      const remove = target.createElement("button");
      remove.type = "button";
      remove.className = "theme-remove";
      remove.textContent = "Apagar";
      remove.setAttribute("aria-label", `Apagar ${theme.name}`);
      remove.addEventListener("click", () => {
        void run(() => actions.remove(theme.id), "Tema apagado.").then(() => {
          if (editingId === theme.id) editNew();
        });
      });

      item.append(open, toggle, remove);
      list.append(item);
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const problem = problemWithDraft();
    if (problem) {
      setStatus(problem, "error");
      return;
    }

    const name = nameInput.value;
    const css = cssInput.value;
    const id = editingId;

    void run(
      () => (id === null ? actions.create(name, css) : actions.update(id, name, css)),
      id === null ? "Tema criado." : "Tema salvo."
    ).then(() => {
      if (id !== null) return;
      // A newly created theme is the one the library did not have before, so
      // the editor can bind to it and further edits update rather than
      // creating a second copy.
      const created = library.themes.find((theme) => theme.name === name && theme.css === css);
      if (created) edit(created);
    });
  });

  discard.addEventListener("click", () => {
    const current = library.themes.find((theme) => theme.id === editingId);
    if (current) edit(current);
    else editNew();
  });

  nameInput.addEventListener("input", renderEditor);
  cssInput.addEventListener("input", renderEditor);

  editNew();

  return {
    refresh(theme): void {
      library = cloneLibrary(theme);
      renderList();
      renderEditor();
    }
  };
}

function cloneLibrary(theme: ThemeSettings): ThemeSettings {
  return { themes: theme.themes.map((item) => ({ ...item })), activeThemeId: theme.activeThemeId };
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`PulseCord theme library element not found: ${selector}`);
  return element;
}
