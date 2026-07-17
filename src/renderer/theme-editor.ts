import {
  isCustomCss,
  MAX_CUSTOM_CSS_LENGTH,
  type AppSettings,
  type NativeBridge,
  type ThemeSettings
} from "../shared/contracts";
import { previewTheme } from "./theme-runtime";

let themeEditorSequence = 0;

export interface ThemeEditorController {
  destroy(): void;
  refresh(settings: AppSettings): void;
}

interface ThemeEditorOptions {
  onPreview?(theme: ThemeSettings): void;
  onStatus?(message: string, kind: "success" | "error" | "info"): void;
}

export function mountThemeEditor(
  root: HTMLElement,
  settings: AppSettings,
  bridge: NativeBridge,
  options: ThemeEditorOptions = {}
): ThemeEditorController {
  root.replaceChildren();
  root.classList.add("pct-editor-host");
  const shadow = root.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = THEME_EDITOR_CSS;
  const surface = document.createElement("div");
  surface.className = "pct-editor";
  shadow.append(style, surface);
  const editorId = `pct-editor-${++themeEditorSequence}`;
  const titleId = `${editorId}-title`;
  const helpId = `${editorId}-help`;
  surface.innerHTML = `
    <section class="pct-card" aria-labelledby="${titleId}">
      <header class="pct-header">
        <span class="pct-icon" aria-hidden="true">{ }</span>
        <span class="pct-heading">
          <strong id="${titleId}">CSS personalizado</strong>
          <small>Crie um tema local e veja as mudanças em tempo real.</small>
        </span>
        <label class="pct-toggle">
          <input type="checkbox" data-role="enabled" />
          <span aria-hidden="true"></span>
          <em>Ativar tema</em>
        </label>
      </header>
      <div class="pct-notice">
        <span aria-hidden="true">i</span>
        <p>O CSS fica salvo somente neste computador. Imports e endereços externos são bloqueados para proteger sua privacidade.</p>
      </div>
      <label class="pct-code-field">
        <span class="pct-code-label">
          <b>Editor CSS</b>
          <em data-role="counter"></em>
        </span>
        <textarea
          data-role="css"
          aria-describedby="${helpId}"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder=":root {&#10;  --brand-500: #d43f55;&#10;}"
        ></textarea>
      </label>
      <p class="pct-help" id="${helpId}">A pré-visualização é imediata. Salve para manter o tema após reiniciar o PulseCord.</p>
      <div class="pct-validation" data-role="validation" role="status" aria-live="polite"></div>
      <footer class="pct-actions">
        <button class="pct-restore" type="button" data-role="restore">Restaurar salvo</button>
        <span></span>
        <button class="pct-save" type="button" data-role="save">Salvar tema</button>
      </footer>
    </section>
  `;

  const enabled = requireElement<HTMLInputElement>(surface, '[data-role="enabled"]');
  const textarea = requireElement<HTMLTextAreaElement>(surface, '[data-role="css"]');
  const counter = requireElement<HTMLElement>(surface, '[data-role="counter"]');
  const validation = requireElement<HTMLElement>(surface, '[data-role="validation"]');
  const save = requireElement<HTMLButtonElement>(surface, '[data-role="save"]');
  const restore = requireElement<HTMLButtonElement>(surface, '[data-role="restore"]');

  textarea.maxLength = MAX_CUSTOM_CSS_LENGTH;

  let saved = cloneTheme(settings.theme);
  let draft = cloneTheme(saved);
  let busy = false;
  let destroyed = false;
  let interactionVersion = 0;

  const notify = (message: string, kind: "success" | "error" | "info"): void => {
    options.onStatus?.(message, kind);
  };

  const sendPreview = (theme: ThemeSettings): void => {
    if (options.onPreview) options.onPreview(cloneTheme(theme));
    else previewTheme(theme);
  };

  const isDirty = (): boolean => draft.enabled !== saved.enabled || draft.customCss !== saved.customCss;

  const validationMessage = (): string | undefined => {
    if (draft.customCss.length > MAX_CUSTOM_CSS_LENGTH) return "O CSS ultrapassou o limite permitido.";
    if (!isCustomCss(draft.customCss)) return "Remova @import ou endereços externos antes de salvar.";
    return undefined;
  };

  const render = (): void => {
    if (textarea.value !== draft.customCss) textarea.value = draft.customCss;
    enabled.checked = draft.enabled;
    counter.textContent = `${draft.customCss.length.toLocaleString("pt-BR")} / ${MAX_CUSTOM_CSS_LENGTH.toLocaleString("pt-BR")}`;

    const problem = validationMessage();
    validation.textContent = problem ?? (isDirty() ? "Alterações ainda não salvas." : "Tema salvo neste computador.");
    validation.dataset.kind = problem ? "error" : isDirty() ? "dirty" : "saved";
    save.disabled = busy || Boolean(problem) || !isDirty();
    restore.disabled = busy || !isDirty();
    enabled.disabled = busy;
    textarea.disabled = busy;
  };

  const updatePreview = (): void => {
    if (!validationMessage()) sendPreview(draft);
  };

  const onInput = (event: Event): void => {
    if (!event.isTrusted) return;
    interactionVersion += 1;
    draft.customCss = textarea.value;
    render();
    updatePreview();
  };

  const onToggle = (event: Event): void => {
    if (!event.isTrusted) return;
    interactionVersion += 1;
    draft.enabled = enabled.checked;
    render();
    updatePreview();
  };

  const onRestore = (event: MouseEvent): void => {
    if (!event.isTrusted) return;
    if (busy || !isDirty()) return;
    interactionVersion += 1;
    draft = cloneTheme(saved);
    render();
    sendPreview(saved);
    notify("Alterações não salvas foram restauradas.", "info");
    textarea.focus();
  };

  const onSave = async (): Promise<void> => {
    const problem = validationMessage();
    if (busy || problem || !isDirty()) return;

    busy = true;
    render();
    try {
      const updated = await bridge.setTheme(draft.customCss, draft.enabled);
      if (destroyed) return;
      settings.theme = updated.theme;
      saved = cloneTheme(updated.theme);
      draft = cloneTheme(saved);
      sendPreview(saved);
      notify(saved.enabled && saved.customCss.trim() ? "Tema salvo e ativado." : "Tema salvo.", "success");
    } catch (error) {
      if (!destroyed) {
        notify("Não foi possível salvar o tema.", "error");
        console.error("[PulseCord] Custom theme update failed.", error);
      }
    } finally {
      busy = false;
      if (!destroyed) render();
    }
  };

  const onSaveClick = (event: MouseEvent): void => {
    if (!event.isTrusted) return;
    void onSave();
  };

  textarea.addEventListener("input", onInput);
  enabled.addEventListener("change", onToggle);
  restore.addEventListener("click", onRestore);
  save.addEventListener("click", onSaveClick);
  render();
  sendPreview(saved);
  const loadVersion = interactionVersion;
  void bridge
    .getSettings()
    .then((updated) => {
      if (destroyed || interactionVersion !== loadVersion) return;
      settings.theme = updated.theme;
      saved = cloneTheme(updated.theme);
      draft = cloneTheme(saved);
      render();
      sendPreview(saved);
    })
    .catch((error: unknown) => {
      console.error("[PulseCord] Could not refresh theme settings.", error);
    });

  return {
    refresh(updated): void {
      settings.theme = updated.theme;
      saved = cloneTheme(updated.theme);
      draft = cloneTheme(saved);
      render();
      sendPreview(saved);
    },
    destroy(): void {
      destroyed = true;
      textarea.removeEventListener("input", onInput);
      enabled.removeEventListener("change", onToggle);
      restore.removeEventListener("click", onRestore);
      save.removeEventListener("click", onSaveClick);
      sendPreview(saved);
      root.classList.remove("pct-editor-host");
      root.replaceChildren();
      shadow.replaceChildren();
    }
  };
}

function cloneTheme(theme: ThemeSettings): ThemeSettings {
  return {
    enabled: theme.enabled,
    customCss: theme.customCss
  };
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`PulseCord theme editor element not found: ${selector}`);
  return element;
}

const THEME_EDITOR_CSS = `
  .pct-editor, .pct-editor * { box-sizing: border-box; }
  .pct-editor { color: var(--text-default, #f2f3f5); }
  .pct-card { overflow: hidden; border: 1px solid var(--background-modifier-accent, rgba(255,255,255,.08)); border-radius: 16px; background: var(--background-secondary, #2b2d31); box-shadow: 0 14px 34px rgba(0,0,0,.1); }
  .pct-header { display: flex; align-items: center; gap: 12px; padding: 17px 18px; border-bottom: 1px solid var(--background-modifier-accent, rgba(255,255,255,.07)); }
  .pct-icon { flex: 0 0 auto; display: grid; place-items: center; width: 39px; height: 39px; border-radius: 11px; color: #f3b1bc; background: rgba(212,63,85,.13); font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 12px; font-weight: 750; }
  .pct-heading { flex: 1; min-width: 0; display: grid; gap: 3px; }
  .pct-heading strong { color: var(--header-primary, #f2f3f5); font-size: 14px; font-weight: 680; letter-spacing: -.01em; }
  .pct-heading small { color: var(--text-muted, #949ba4); font-size: 11.5px; }
  .pct-toggle { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .pct-toggle input { position: absolute; opacity: 0; pointer-events: none; }
  .pct-toggle > span { position: relative; width: 38px; height: 22px; border-radius: 20px; background: var(--interactive-muted, #4e5058); transition: .16s ease; }
  .pct-toggle > span::after { content: ""; position: absolute; width: 16px; height: 16px; left: 3px; top: 3px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: .16s ease; }
  .pct-toggle input:checked + span { background: #b93449; }
  .pct-toggle input:checked + span::after { transform: translateX(16px); }
  .pct-toggle input:focus-visible + span { outline: 2px solid #e9798a; outline-offset: 2px; }
  .pct-toggle input:disabled + span { opacity: .5; cursor: wait; }
  .pct-toggle em { color: var(--interactive-normal, #dbdee1); font-size: 11.5px; font-style: normal; font-weight: 620; }
  .pct-notice { display: flex; align-items: start; gap: 9px; margin: 16px 18px 0; padding: 10px 12px; border: 1px solid color-mix(in srgb, #d43f55 18%, transparent); border-radius: 10px; background: color-mix(in srgb, #d43f55 5%, transparent); }
  .pct-notice > span { flex: 0 0 auto; display: grid; place-items: center; width: 19px; height: 19px; border-radius: 50%; color: #ef9caa; background: rgba(212,63,85,.14); font-size: 11px; font-weight: 750; }
  .pct-notice p { margin: 0; color: var(--text-muted, #aeb3bb); font-size: 11px; line-height: 1.45; }
  .pct-code-field { display: grid; gap: 7px; margin: 16px 18px 0; }
  .pct-code-label { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .pct-code-label b { color: var(--header-primary, #f2f3f5); font-size: 12px; font-weight: 650; }
  .pct-code-label em { color: var(--text-muted, #949ba4); font-size: 9.5px; font-style: normal; font-variant-numeric: tabular-nums; }
  .pct-code-field textarea { display: block; width: 100%; min-height: 330px; resize: vertical; padding: 15px 16px; border: 1px solid var(--background-modifier-accent, rgba(255,255,255,.1)); border-radius: 11px; outline: none; color: #d9dce2; background: var(--background-tertiary, #1e1f22); caret-color: #ee7084; font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace; font-size: 12px; line-height: 1.62; tab-size: 2; transition: border-color .14s ease, box-shadow .14s ease; }
  .pct-code-field textarea:focus { border-color: color-mix(in srgb, #d43f55 72%, transparent); box-shadow: 0 0 0 3px rgba(212,63,85,.1); }
  .pct-code-field textarea::placeholder { color: #656b76; }
  .pct-code-field textarea:disabled { opacity: .6; cursor: wait; }
  .pct-help { margin: 7px 18px 0; color: var(--text-muted, #949ba4); font-size: 10.5px; line-height: 1.4; }
  .pct-validation { min-height: 17px; margin: 7px 18px 0; font-size: 10.5px; font-weight: 620; }
  .pct-validation[data-kind="error"] { color: #f07889; }
  .pct-validation[data-kind="dirty"] { color: #d8a25c; }
  .pct-validation[data-kind="saved"] { color: #58b88a; }
  .pct-actions { display: flex; align-items: center; gap: 10px; margin-top: 13px; padding: 13px 18px 16px; border-top: 1px solid var(--background-modifier-accent, rgba(255,255,255,.07)); }
  .pct-actions > span { flex: 1; }
  .pct-actions button { min-height: 36px; padding: 0 13px; border-radius: 8px; font: inherit; font-size: 11.5px; font-weight: 650; cursor: pointer; transition: .14s ease; }
  .pct-restore { border: 1px solid var(--background-modifier-accent, rgba(255,255,255,.1)); color: var(--interactive-normal, #dbdee1); background: transparent; }
  .pct-restore:hover:not(:disabled) { background: var(--background-modifier-hover, rgba(255,255,255,.06)); }
  .pct-save { border: 1px solid #ad3045; color: #fff; background: #bd354b; }
  .pct-save:hover:not(:disabled) { background: #cb3b52; }
  .pct-actions button:active:not(:disabled) { transform: translateY(1px); }
  .pct-actions button:focus-visible { outline: 2px solid #e9798a; outline-offset: 2px; }
  .pct-actions button:disabled { opacity: .45; cursor: not-allowed; }
  @media (max-width: 700px) {
    .pct-header { align-items: flex-start; flex-wrap: wrap; }
    .pct-toggle { width: 100%; padding-left: 51px; }
    .pct-code-field textarea { min-height: 260px; }
  }
`;
