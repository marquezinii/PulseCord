import discordSymbol from "../../assets/discord-symbol.svg";
import { isShortcutAction } from "../shared/contracts";
import type {
  AppSettings,
  BuiltinPluginId,
  ShortcutAccelerator,
  ShortcutAction,
  NativeBridge,
  RuntimeEnvironment
} from "../shared/contracts";
import type { PluginRuntime } from "./plugin-runtime";

export async function mountControlCenter(
  runtime: PluginRuntime,
  environment: RuntimeEnvironment,
  settings: AppSettings,
  bridge: NativeBridge
): Promise<void> {
  document.getElementById("pulsecord-shell")?.remove();

  const host = document.createElement("div");
  host.id = "pulsecord-shell";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = CONTROL_CENTER_CSS;
  shadow.append(style);

  const launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.type = "button";
  launcher.title = "Abrir PulsePanel (Ctrl+Shift+,)";
  launcher.setAttribute("aria-label", "Abrir configurações do PulseCord");
  launcher.innerHTML = `<span aria-hidden="true">P</span><i></i>`;

  const panel = document.createElement("section");
  panel.className = "panel";
  panel.setAttribute("aria-label", "PulsePanel");
  panel.hidden = true;

  panel.innerHTML = `
    <header>
      <div class="identity">
        <span class="monogram">P</span>
        <div>
          <strong>PulseCord</strong>
          <span>PulseCore ${escapeHtml(environment.appVersion)}</span>
        </div>
      </div>
      <button class="icon-button close" type="button" aria-label="Fechar">×</button>
    </header>
    <div class="service-badge">
      <span class="discord-mark"><img src="${escapeAttribute(discordSymbol)}" alt="" /></span>
      <span><b>Discord</b><small>serviço conectado · projeto não oficial</small></span>
    </div>
    ${
      environment.safeMode
        ? `<div class="safe-banner"><b>Modo seguro ativo</b><span>Os plugins opcionais não foram iniciados.</span><button type="button" data-action="normal">Reiniciar normalmente</button></div>`
        : ""
    }
    <div class="intro">
      <span class="eyebrow">CONTROLE LOCAL</span>
      <h2>Seu cliente, do seu jeito.</h2>
      <p>Plugins próprios, sem telemetria e com desligamento limpo.</p>
    </div>
    <section class="shortcuts" aria-labelledby="pulsecord-shortcuts-title">
      <div class="section-heading">
        <span><b id="pulsecord-shortcuts-title">Atalhos desktop</b><small>Motor nativo do PulseCore</small></span>
        <em>LOCAL</em>
      </div>
      <div class="shortcut-list"></div>
      <p>Clique em um atalho e pressione a nova combinação. Backspace remove.</p>
    </section>
    <div class="plugins" role="list"></div>
    <footer>
      <button type="button" data-action="folder">Abrir dados locais</button>
      <button type="button" data-action="safe">Reiniciar em modo seguro</button>
    </footer>
    <div class="toast" role="status" aria-live="polite"></div>
  `;

  const pluginList = requireElement<HTMLDivElement>(panel, ".plugins");
  const shortcutList = requireElement<HTMLDivElement>(panel, ".shortcut-list");
  for (const action of SHORTCUT_ORDER) {
    const row = document.createElement("div");
    row.className = "shortcut";
    row.innerHTML = `
      <span><b>${SHORTCUT_LABELS[action]}</b><small>${SHORTCUT_DESCRIPTIONS[action]}</small></span>
      <button type="button" data-shortcut="${action}" aria-label="Definir ${SHORTCUT_LABELS[action]}">${formatShortcut(settings.shortcuts[action])}</button>
    `;
    shortcutList.append(row);
  }

  for (const definition of runtime.definitions) {
    const row = document.createElement("label");
    row.className = "plugin";
    row.setAttribute("role", "listitem");
    row.innerHTML = `
      <span class="plugin-copy">
        <b>${escapeHtml(definition.name)}</b>
        <small>${escapeHtml(definition.description)}</small>
        <em>${definition.capabilities.map(capabilityLabel).join(" · ")}</em>
      </span>
      <span class="switch">
        <input type="checkbox" data-plugin="${definition.id}" ${runtime.isEnabled(definition.id) ? "checked" : ""} ${environment.safeMode ? "disabled" : ""} />
        <i></i>
      </span>
    `;
    pluginList.append(row);
  }

  shadow.append(launcher, panel);
  document.documentElement.append(host);

  const close = requireElement<HTMLButtonElement>(panel, ".close");
  const toast = requireElement<HTMLDivElement>(panel, ".toast");
  let recordingAction: ShortcutAction | undefined;
  const showPanel = (show: boolean): void => {
    if (!show && recordingAction) {
      const button = requireElement<HTMLButtonElement>(shortcutList, `[data-shortcut="${recordingAction}"]`);
      button.classList.remove("recording");
      button.textContent = formatShortcut(settings.shortcuts[recordingAction]);
      recordingAction = undefined;
    }
    panel.hidden = !show;
    launcher.classList.toggle("active", show);
    if (show) close.focus();
  };

  launcher.addEventListener("click", () => showPanel(panel.hidden !== false));
  close.addEventListener("click", () => showPanel(false));

  document.addEventListener("keydown", (event) => {
    if (recordingAction) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const action = recordingAction;
      const button = requireElement<HTMLButtonElement>(shortcutList, `[data-shortcut="${action}"]`);
      if (event.code === "Escape") {
        recordingAction = undefined;
        button.classList.remove("recording");
        button.textContent = formatShortcut(settings.shortcuts[action]);
        return;
      }

      const accelerator = isShortcutClearKey(event) ? null : keyboardAccelerator(event);
      if (accelerator === undefined) {
        showToast(toast, "Use uma combinação com Ctrl, Alt, Shift ou Super.");
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
          showToast(toast, accelerator ? "Atalho desktop salvo." : "Atalho removido.");
        })
        .catch((error: unknown) => {
          button.textContent = formatShortcut(settings.shortcuts[action]);
          showToast(toast, "Essa combinação não está disponível.");
          console.error("[PulseCord] Desktop shortcut update failed.", error);
        })
        .finally(() => {
          button.disabled = false;
        });
      return;
    }

    if (event.ctrlKey && event.shiftKey && event.code === "Comma") {
      event.preventDefault();
      showPanel(panel.hidden !== false);
    }
  });

  shortcutList.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button[data-shortcut]");
    const action = button?.dataset.shortcut;
    if (!button || !isShortcutAction(action)) return;

    if (recordingAction) {
      const previous = requireElement<HTMLButtonElement>(shortcutList, `[data-shortcut="${recordingAction}"]`);
      previous.classList.remove("recording");
      previous.textContent = formatShortcut(settings.shortcuts[recordingAction]);
    }

    recordingAction = action;
    button.classList.add("recording");
    button.textContent = "Pressione...";
    button.focus();
  });

  bridge.onShortcutTriggered((action) => {
    if (action === "toggle-panel") showPanel(panel.hidden !== false);
  });

  pluginList.addEventListener("change", async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const id = input.dataset.plugin as BuiltinPluginId | undefined;
    if (!id) return;

    input.disabled = true;
    try {
      await runtime.setEnabled(id, input.checked);
      showToast(toast, input.checked ? "Plugin ativado." : "Plugin desativado.");
    } catch (error) {
      input.checked = !input.checked;
      showToast(toast, "Não foi possível salvar a alteração.");
      console.error("[PulseCord] Plugin toggle failed.", error);
    } finally {
      input.disabled = false;
    }
  });

  panel.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    if (action === "folder") void bridge.openDataFolder();
    if (action === "safe") void bridge.relaunch(true);
    if (action === "normal") void bridge.relaunch(false);
  });

  if (!settings.ui.seenWelcome) {
    showPanel(true);
    await bridge.markWelcomeSeen();
  }
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`PulsePanel element not found: ${selector}`);
  return element;
}

function showToast(element: HTMLElement, message: string): void {
  element.textContent = message;
  element.classList.add("visible");
  window.setTimeout(() => element.classList.remove("visible"), 1800);
}

const SHORTCUT_ORDER = ["toggle-panel", "toggle-mute", "toggle-deafen"] as const satisfies readonly ShortcutAction[];
const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  "toggle-panel": "Abrir PulsePanel",
  "toggle-mute": "Silenciar microfone",
  "toggle-deafen": "Silenciar áudio"
};
const SHORTCUT_DESCRIPTIONS: Record<ShortcutAction, string> = {
  "toggle-panel": "Mostra ou esconde os controles do PulseCord.",
  "toggle-mute": "Alterna o microfone mesmo fora da janela.",
  "toggle-deafen": "Alterna o áudio recebido mesmo fora da janela."
};

function formatShortcut(accelerator: ShortcutAccelerator): string {
  return (
    accelerator
      ?.replaceAll("CommandOrControl", "Cmd/Ctrl")
      .replaceAll("Control", "Ctrl")
      .replaceAll("Super", "Win") ?? "Definir"
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

function capabilityLabel(capability: string): string {
  return { dom: "interface", keyboard: "teclado", styles: "estilos" }[capability] ?? capability;
}

function escapeHtml(value: string): string {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const CONTROL_CENTER_CSS = `
  :host { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  * { box-sizing: border-box; }
  button, input { font: inherit; }
  button { color: inherit; }
  .launcher {
    pointer-events: auto; position: fixed; right: 18px; bottom: 18px; width: 48px; height: 48px;
    border: 1px solid rgba(255,255,255,.13); border-radius: 15px; background: #181b23; cursor: pointer;
    display: grid; place-items: center; box-shadow: 0 16px 42px rgba(0,0,0,.42); transition: .18s ease;
  }
  .launcher:hover, .launcher.active { transform: translateY(-2px); border-color: rgba(212,63,85,.66); background: #20232d; }
  .launcher span { font-weight: 900; font-size: 23px; letter-spacing: -.08em; transform: translateX(-1px); }
  .launcher i { position: absolute; width: 22px; height: 3px; border-radius: 3px; background: #d43f55; transform: translateY(9px); }
  .panel {
    pointer-events: auto; position: fixed; right: 18px; bottom: 78px; width: min(390px, calc(100vw - 36px));
    max-height: calc(100vh - 102px); overflow: auto; border: 1px solid rgba(255,255,255,.1); border-radius: 24px;
    background: linear-gradient(155deg, rgba(34,37,47,.98), rgba(15,17,23,.99));
    box-shadow: 0 28px 90px rgba(0,0,0,.58); color: #f5f6f8; animation: enter .18s ease-out;
  }
  .panel[hidden] { display: none; }
  @keyframes enter { from { opacity: 0; transform: translateY(8px) scale(.985); } }
  header { display: flex; align-items: center; justify-content: space-between; padding: 18px 18px 12px; }
  .identity { display: flex; align-items: center; gap: 11px; }
  .identity > div { display: grid; gap: 1px; }
  .identity strong { font-size: 16px; letter-spacing: -.02em; }
  .identity span { color: #969dad; font-size: 11px; }
  .monogram { width: 36px; height: 36px; display: grid; place-items: center; color: white !important; font-weight: 900; font-size: 19px !important; border-radius: 11px; background: #171920; border: 1px solid #3c4050; box-shadow: inset 0 -2px 0 rgba(212,63,85,.35); }
  .icon-button { width: 34px; height: 34px; border: 0; border-radius: 10px; background: transparent; color: #9da3b2; cursor: pointer; font-size: 24px; line-height: 1; }
  .icon-button:hover { background: rgba(255,255,255,.07); color: white; }
  .service-badge { display: flex; align-items: center; gap: 10px; margin: 0 18px 12px; padding: 9px 11px; border: 1px solid rgba(88,101,242,.3); border-radius: 13px; background: rgba(88,101,242,.09); }
  .discord-mark { width: 31px; height: 31px; display: grid; place-items: center; border-radius: 9px; background: #5865f2; }
  .discord-mark img { width: 20px; height: auto; display: block; }
  .service-badge > span:last-child { display: grid; gap: 1px; }
  .service-badge b { font-size: 12px; }
  .service-badge small { color: #a9afbd; font-size: 10px; }
  .intro { padding: 13px 18px 16px; }
  .eyebrow { color: #d86a7b; font-size: 10px; font-weight: 800; letter-spacing: .16em; }
  h2 { margin: 6px 0 4px; font-size: 23px; letter-spacing: -.035em; }
  .intro p { margin: 0; color: #a7adba; font-size: 12px; line-height: 1.45; }
  .shortcuts { margin: 0 12px 14px; padding: 12px; border: 1px solid rgba(212,63,85,.18); border-radius: 16px; background: rgba(212,63,85,.045); }
  .section-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .section-heading > span { display: grid; gap: 2px; }
  .section-heading b { font-size: 12px; }
  .section-heading small { color: #8f96a5; font-size: 9.5px; }
  .section-heading em { color: #d86a7b; font-size: 8px; font-style: normal; font-weight: 900; letter-spacing: .14em; }
  .shortcut-list { display: grid; gap: 6px; }
  .shortcut { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid rgba(255,255,255,.055); }
  .shortcut:first-child { border-top: 0; }
  .shortcut > span { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .shortcut b { font-size: 10.5px; }
  .shortcut small { color: #858c9b; font-size: 8.5px; line-height: 1.3; }
  .shortcut button { min-width: 86px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; border: 1px solid rgba(255,255,255,.1); border-radius: 8px; padding: 7px 8px; background: rgba(255,255,255,.055); color: #d9dce3; font-size: 9px; cursor: pointer; }
  .shortcut button:hover { border-color: rgba(212,63,85,.5); }
  .shortcut button.recording { border-color: #d43f55; color: white; background: rgba(212,63,85,.16); }
  .shortcuts > p { margin: 8px 0 0; color: #747c8c; font-size: 8.5px; line-height: 1.35; }
  .plugins { display: grid; gap: 8px; padding: 0 12px 14px; }
  .plugin { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid rgba(255,255,255,.075); border-radius: 15px; background: rgba(255,255,255,.035); cursor: pointer; }
  .plugin:hover { border-color: rgba(255,255,255,.14); background: rgba(255,255,255,.052); }
  .plugin-copy { flex: 1; min-width: 0; display: grid; gap: 4px; }
  .plugin-copy b { font-size: 13px; }
  .plugin-copy small { color: #a3a9b7; font-size: 10.5px; line-height: 1.35; }
  .plugin-copy em { color: #727a8b; font-size: 9px; font-style: normal; text-transform: uppercase; letter-spacing: .08em; }
  .switch { position: relative; flex: 0 0 auto; width: 40px; height: 23px; }
  .switch input { position: absolute; opacity: 0; pointer-events: none; }
  .switch i { position: absolute; inset: 0; border-radius: 20px; background: #3b3f4c; transition: .16s ease; }
  .switch i::after { content: ""; position: absolute; width: 17px; height: 17px; left: 3px; top: 3px; border-radius: 50%; background: #dfe2e8; transition: .16s ease; }
  .switch input:checked + i { background: #b93449; }
  .switch input:checked + i::after { transform: translateX(17px); background: white; }
  .switch input:focus-visible + i { outline: 2px solid white; outline-offset: 2px; }
  .switch input:disabled + i { opacity: .45; }
  .safe-banner { display: grid; gap: 4px; margin: 0 18px 8px; padding: 12px; border-radius: 13px; background: rgba(236,169,73,.1); border: 1px solid rgba(236,169,73,.3); }
  .safe-banner b { font-size: 12px; color: #f0bd70; }
  .safe-banner span { font-size: 10px; color: #c4b395; }
  .safe-banner button { margin-top: 5px; justify-self: start; border: 0; border-radius: 8px; padding: 6px 9px; background: #f0bd70; color: #20190f; font-size: 10px; font-weight: 800; cursor: pointer; }
  footer { display: flex; gap: 6px; padding: 12px; border-top: 1px solid rgba(255,255,255,.07); }
  footer button { flex: 1; border: 0; border-radius: 10px; padding: 9px 8px; background: rgba(255,255,255,.055); color: #aeb4c1; font-size: 10px; cursor: pointer; }
  footer button:hover { background: rgba(255,255,255,.09); color: white; }
  .toast { position: sticky; bottom: 8px; width: max-content; max-width: calc(100% - 24px); margin: -4px auto 8px; padding: 8px 11px; border-radius: 9px; background: #f4f5f7; color: #17191f; font-size: 10px; font-weight: 700; opacity: 0; transform: translateY(5px); pointer-events: none; transition: .16s ease; }
  .toast.visible { opacity: 1; transform: none; }
`;
