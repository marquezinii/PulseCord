import discordSymbol from "../../assets/discord-symbol.svg";
import type {
  AppSettings,
  BuiltinPluginId,
  NativeBridge,
  RuntimeEnvironment
} from "../shared/contracts";
import { OPEN_SHORTCUTS_SETTINGS_EVENT } from "./discord-settings";
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
    <header class="topbar">
      <div class="identity">
        <span class="monogram">P<i></i></span>
        <span class="identity-copy"><strong>PulsePanel</strong><small>PulseCore ${escapeHtml(environment.appVersion)}</small></span>
      </div>
      <button class="icon-button close" type="button" aria-label="Fechar">×</button>
    </header>
    <div class="hero">
      <span class="eyebrow">CONTROLE LOCAL · SEM TELEMETRIA</span>
      <h2>Seu PulseCord,<br />sob o seu controle.</h2>
      <p>Gerencie recursos próprios do cliente em uma interface leve e integrada ao Discord.</p>
    </div>
    <div class="service-badge">
      <span class="discord-mark"><img src="${escapeAttribute(discordSymbol)}" alt="" /></span>
      <span><b>Conectado ao Discord</b><small>Serviço oficial · cliente PulseCord não oficial</small></span>
      <i class="status-dot" title="Conectado"></i>
    </div>
    ${
      environment.safeMode
        ? `<div class="safe-banner"><b>Modo seguro ativo</b><span>Os plugins opcionais não foram iniciados.</span><button type="button" data-action="normal">Reiniciar normalmente</button></div>`
        : ""
    }
    <button class="settings-card" type="button" data-action="shortcuts">
      <span class="settings-icon" aria-hidden="true">${keyboardGlyph()}</span>
      <span><b>Atalhos PulseCord</b><small>Criar e editar nas configurações do Discord</small></span>
      <i aria-hidden="true">›</i>
    </button>
    <section class="plugins-section" aria-labelledby="pulsecord-plugins-title">
      <div class="section-heading">
        <span><b id="pulsecord-plugins-title">Recursos</b><small>Plugins próprios ativos neste cliente</small></span>
        <em>${runtime.definitions.length}</em>
      </div>
      <div class="plugins" role="list"></div>
    </section>
    <footer>
      <button type="button" data-action="folder">Dados locais</button>
      <span></span>
      <button type="button" data-action="safe">Modo seguro</button>
    </footer>
    <div class="toast" role="status" aria-live="polite"></div>
  `;

  const pluginList = requireElement<HTMLDivElement>(panel, ".plugins");
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
  const showPanel = (show: boolean): void => {
    panel.hidden = !show;
    launcher.classList.toggle("active", show);
    if (show) close.focus();
  };

  launcher.addEventListener("click", () => showPanel(panel.hidden !== false));
  close.addEventListener("click", () => showPanel(false));

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.shiftKey && event.code === "Comma") {
      event.preventDefault();
      showPanel(panel.hidden !== false);
    }
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
    if (action === "shortcuts") {
      showPanel(false);
      document.dispatchEvent(new CustomEvent(OPEN_SHORTCUTS_SETTINGS_EVENT));
    }
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

function capabilityLabel(capability: string): string {
  return { dom: "interface", keyboard: "teclado", styles: "estilos" }[capability] ?? capability;
}

function keyboardGlyph(): string {
  return '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4.25 5.5h15.5A2.75 2.75 0 0 1 22.5 8.25v7.5a2.75 2.75 0 0 1-2.75 2.75H4.25a2.75 2.75 0 0 1-2.75-2.75v-7.5A2.75 2.75 0 0 1 4.25 5.5Zm0 1.75c-.55 0-1 .45-1 1v7.5c0 .55.45 1 1 1h15.5c.55 0 1-.45 1-1v-7.5c0-.55-.45-1-1-1H4.25Zm1.25 2h2v1.75h-2V9.25Zm3.5 0h2V11H9V9.25Zm3.5 0h2V11h-2V9.25Zm3.5 0h2.5V11H16V9.25ZM5.5 12.5h2v1.75h-2V12.5Zm3.5 0h6v1.75H9V12.5Zm7.5 0h2v1.75h-2V12.5Z"/></svg>';
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
  :host { color-scheme: dark; }
  :host, .panel, .panel *, .launcher, .launcher * {
    box-sizing: border-box;
    font-family: "Segoe UI Variable Text", "Segoe UI", ui-sans-serif, system-ui, sans-serif !important;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  button, input { font: inherit; }
  button { color: inherit; }
  .launcher {
    pointer-events: auto; position: fixed; right: 18px; bottom: 18px; width: 48px; height: 48px;
    border: 1px solid rgba(255,255,255,.12); border-radius: 15px; color: #f7f7f8; background: #171920; cursor: pointer;
    display: grid; place-items: center; box-shadow: 0 14px 38px rgba(0,0,0,.38); transition: transform .16s ease, border-color .16s ease, background .16s ease;
  }
  .launcher:hover, .launcher.active { transform: translateY(-2px); border-color: rgba(212,63,85,.72); background: #20222b; }
  .launcher span { font-weight: 820; font-size: 23px; letter-spacing: -.08em; transform: translateX(-1px); }
  .launcher i { position: absolute; width: 22px; height: 3px; border-radius: 3px; background: #d43f55; transform: translateY(9px); }
  .panel {
    pointer-events: auto; position: fixed; right: 18px; bottom: 78px; width: min(414px, calc(100vw - 36px));
    max-height: calc(100vh - 102px); overflow: auto; border: 1px solid rgba(255,255,255,.09); border-radius: 22px;
    color: #f4f5f7; background: #12141a; box-shadow: 0 30px 90px rgba(0,0,0,.6); animation: enter .18s cubic-bezier(.2,.75,.25,1);
  }
  .panel[hidden] { display: none; }
  @keyframes enter { from { opacity: 0; transform: translateY(9px) scale(.985); } }
  .topbar { display: flex; align-items: center; justify-content: space-between; padding: 17px 18px 12px; }
  .identity { display: flex; align-items: center; gap: 11px; }
  .monogram { position: relative; width: 36px; height: 36px; display: grid; place-items: center; border: 1px solid #373b47; border-radius: 11px; color: #fff; background: #1a1d25; font-size: 19px; font-weight: 820; letter-spacing: -.06em; }
  .monogram i { position: absolute; width: 17px; height: 2px; bottom: 6px; border-radius: 2px; background: #d43f55; }
  .identity-copy { display: grid; gap: 1px; }
  .identity-copy strong { color: #f7f7f9; font-size: 15px; font-weight: 690; letter-spacing: -.015em; }
  .identity-copy small { color: #808796; font-size: 10.5px; font-weight: 520; }
  .icon-button { width: 34px; height: 34px; border: 0; border-radius: 10px; color: #8d94a3; background: transparent; cursor: pointer; font-size: 23px; line-height: 1; }
  .icon-button:hover { color: white; background: rgba(255,255,255,.065); }
  .hero { position: relative; overflow: hidden; padding: 15px 20px 21px; }
  .hero::after { content: ""; position: absolute; width: 190px; height: 190px; right: -105px; top: -75px; border-radius: 50%; background: radial-gradient(circle, rgba(212,63,85,.16), transparent 68%); pointer-events: none; }
  .eyebrow { color: #df7182; font-size: 9.5px; font-weight: 760; letter-spacing: .13em; }
  h2 { margin: 7px 0 7px; color: #f7f7f9; font-size: 25px; font-weight: 720; line-height: 1.08; letter-spacing: -.045em; }
  .hero p { max-width: 325px; margin: 0; color: #9ca3b1; font-size: 11.5px; line-height: 1.5; }
  .service-badge { display: flex; align-items: center; gap: 10px; margin: 0 14px 12px; padding: 10px 11px; border: 1px solid rgba(88,101,242,.25); border-radius: 13px; background: rgba(88,101,242,.075); }
  .discord-mark { flex: 0 0 auto; width: 32px; height: 32px; display: grid; place-items: center; border-radius: 9px; background: #5865f2; }
  .discord-mark img { display: block; width: 20px; height: auto; }
  .service-badge > span:nth-child(2) { min-width: 0; flex: 1; display: grid; gap: 1px; }
  .service-badge b { font-size: 11.5px; font-weight: 650; }
  .service-badge small { overflow: hidden; color: #9098a8; font-size: 9.5px; text-overflow: ellipsis; white-space: nowrap; }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #3ba55d; box-shadow: 0 0 0 3px rgba(59,165,93,.11); }
  .settings-card { width: calc(100% - 28px); margin: 0 14px 16px; padding: 12px; display: flex; align-items: center; gap: 11px; border: 1px solid rgba(212,63,85,.22); border-radius: 14px; text-align: left; background: rgba(212,63,85,.055); cursor: pointer; transition: .15s ease; }
  .settings-card:hover { border-color: rgba(212,63,85,.5); background: rgba(212,63,85,.09); transform: translateY(-1px); }
  .settings-icon { flex: 0 0 auto; width: 35px; height: 35px; display: grid; place-items: center; border-radius: 10px; color: #f3b2bc; background: rgba(212,63,85,.16); }
  .settings-icon svg { width: 20px; height: 20px; }
  .settings-card > span:nth-child(2) { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .settings-card b { font-size: 11.5px; font-weight: 670; }
  .settings-card small { color: #8f96a5; font-size: 9.5px; }
  .settings-card > i { color: #b45a69; font-size: 23px; font-style: normal; line-height: 1; }
  .plugins-section { margin: 0 14px 15px; }
  .section-heading { display: flex; align-items: end; justify-content: space-between; padding: 0 2px 9px; }
  .section-heading > span { display: grid; gap: 2px; }
  .section-heading b { font-size: 12px; font-weight: 680; }
  .section-heading small { color: #7f8695; font-size: 9.5px; }
  .section-heading em { min-width: 22px; height: 22px; display: grid; place-items: center; border-radius: 7px; color: #c7cbd3; background: #22252e; font-size: 9px; font-style: normal; font-weight: 750; }
  .plugins { display: grid; overflow: hidden; border: 1px solid rgba(255,255,255,.07); border-radius: 15px; background: #181a21; }
  .plugin { display: flex; align-items: center; gap: 12px; min-height: 67px; padding: 11px 12px; border-top: 1px solid rgba(255,255,255,.055); cursor: pointer; transition: background .14s ease; }
  .plugin:first-child { border-top: 0; }
  .plugin:hover { background: rgba(255,255,255,.025); }
  .plugin-copy { flex: 1; min-width: 0; display: grid; gap: 3px; }
  .plugin-copy b { color: #e9eaed; font-size: 11.5px; font-weight: 650; }
  .plugin-copy small { color: #8e95a4; font-size: 9.5px; line-height: 1.35; }
  .plugin-copy em { color: #666e7e; font-size: 8px; font-style: normal; font-weight: 650; text-transform: uppercase; letter-spacing: .075em; }
  .switch { position: relative; flex: 0 0 auto; width: 38px; height: 22px; }
  .switch input { position: absolute; opacity: 0; pointer-events: none; }
  .switch i { position: absolute; inset: 0; border-radius: 20px; background: #343844; transition: .16s ease; }
  .switch i::after { content: ""; position: absolute; width: 16px; height: 16px; left: 3px; top: 3px; border-radius: 50%; background: #d8dbe2; transition: .16s ease; }
  .switch input:checked + i { background: #b93449; }
  .switch input:checked + i::after { transform: translateX(16px); background: white; }
  .switch input:focus-visible + i { outline: 2px solid white; outline-offset: 2px; }
  .switch input:disabled + i { opacity: .45; }
  .safe-banner { display: grid; gap: 4px; margin: 0 14px 12px; padding: 12px; border-radius: 13px; background: rgba(236,169,73,.1); border: 1px solid rgba(236,169,73,.28); }
  .safe-banner b { color: #f0bd70; font-size: 11.5px; }
  .safe-banner span { color: #b6a78e; font-size: 9.5px; }
  .safe-banner button { justify-self: start; margin-top: 4px; padding: 6px 9px; border: 0; border-radius: 7px; color: #20190f; background: #f0bd70; font-size: 9px; font-weight: 750; cursor: pointer; }
  footer { display: flex; align-items: center; gap: 9px; padding: 12px 15px 14px; border-top: 1px solid rgba(255,255,255,.06); }
  footer span { width: 1px; height: 14px; background: rgba(255,255,255,.08); }
  footer button { border: 0; padding: 4px 0; color: #858c9b; background: transparent; font-size: 9.5px; cursor: pointer; }
  footer button:hover { color: #e7e9ed; }
  .toast { position: sticky; bottom: 8px; width: max-content; max-width: calc(100% - 24px); margin: -5px auto 8px; padding: 8px 11px; border-radius: 9px; color: #17191f; background: #f4f5f7; font-size: 10px; font-weight: 670; opacity: 0; transform: translateY(5px); pointer-events: none; transition: .16s ease; }
  .toast.visible { opacity: 1; transform: none; }
`;
