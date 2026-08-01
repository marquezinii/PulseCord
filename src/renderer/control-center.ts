import discordSymbol from "../../assets/discord-symbol.svg";
import pulsePanelArt from "../../assets/pulsepanel-art.png";
import type { AppSettings, NativeBridge, RuntimeEnvironment } from "../shared/contracts";
import {
  OPEN_PULSECORD_SETTINGS_EVENT,
  type PulseCordSettingsPage
} from "./discord-settings";
import type { PluginRuntime } from "./pulsecore";

let disposeShortcutListener: (() => void) | undefined;

export async function mountControlCenter(
  _runtime: PluginRuntime,
  environment: RuntimeEnvironment,
  settings: AppSettings,
  bridge: NativeBridge
): Promise<void> {
  document.getElementById("pulsecord-shell")?.remove();
  disposeShortcutListener?.();

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
  launcher.title = "Abrir PulsePanel";
  launcher.setAttribute("aria-label", "Abrir configurações do PulseCord");
  launcher.innerHTML = `<img src="${escapeAttribute(pulsePanelArt)}" alt="" />`;

  const panel = document.createElement("section");
  panel.className = "panel";
  panel.setAttribute("aria-label", "PulsePanel");
  panel.hidden = true;
  panel.innerHTML = `
    <header class="topbar">
      <div class="identity">
        <img class="brand-logo" src="${escapeAttribute(pulsePanelArt)}" alt="" />
        <span class="identity-copy"><strong>PulsePanel</strong><small>PulseCore ${escapeHtml(environment.appVersion)}</small></span>
      </div>
      <button class="icon-button close" type="button" aria-label="Fechar">×</button>
    </header>
    <div class="hero">
      <span class="eyebrow">CENTRAL PULSECORD</span>
      <h2>Personalize sem sair<br />do seu Discord.</h2>
      <p>Atalhos, temas e os próximos recursos do cliente reunidos em um lugar simples.</p>
    </div>
    <div class="service-badge">
      <span class="discord-mark"><img src="${escapeAttribute(discordSymbol)}" alt="" /></span>
      <span><b>Conectado ao Discord</b><small>Serviço oficial · cliente PulseCord não oficial</small></span>
      <i class="status-dot" title="Conectado"></i>
    </div>
    ${
      environment.safeMode
        ? `<div class="safe-banner"><b>Modo seguro ativo</b><span>Tema e recursos opcionais não foram iniciados.</span><button type="button" data-action="normal">Reiniciar normalmente</button></div>`
        : ""
    }
    <nav class="quick-links" aria-label="Configurações do PulseCord">
      ${settingsCard("plugins", puzzleGlyph(), "Plugins", "Área em construção")}
      ${settingsCard("shortcuts", keyboardGlyph(), "Atalhos PulseCord", "Adicionar e editar combinações")}
    </nav>
    <footer>
      <button type="button" data-action="folder">Dados locais</button>
      <span></span>
      <button type="button" data-action="safe">Modo seguro</button>
    </footer>
  `;

  shadow.append(launcher, panel);
  document.documentElement.append(host);

  const close = requireElement<HTMLButtonElement>(panel, ".close");
  const showPanel = (show: boolean): void => {
    panel.hidden = !show;
    launcher.classList.toggle("active", show);
    launcher.setAttribute("aria-expanded", String(show));
    if (show) close.focus();
  };

  launcher.setAttribute("aria-expanded", "false");
  launcher.addEventListener("click", () => showPanel(panel.hidden !== false));
  close.addEventListener("click", () => showPanel(false));
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") showPanel(false);
  });

  disposeShortcutListener = bridge.onShortcutTriggered((action) => {
    if (action === "toggle-panel") showPanel(panel.hidden !== false);
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

  panel.querySelector(".quick-links")?.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button[data-page]");
    const page = button?.dataset.page as PulseCordSettingsPage | undefined;
    if (!page) return;
    showPanel(false);
    document.dispatchEvent(new CustomEvent(OPEN_PULSECORD_SETTINGS_EVENT, { detail: page }));
  });

  if (!settings.ui.seenWelcome) {
    showPanel(true);
    await bridge.markWelcomeSeen();
  }
}

function settingsCard(page: PulseCordSettingsPage, icon: string, title: string, subtitle: string): string {
  return `
    <button class="settings-card" type="button" data-page="${page}">
      <span class="settings-icon" aria-hidden="true">${icon}</span>
      <span><b>${title}</b><small>${subtitle}</small></span>
      <i aria-hidden="true">›</i>
    </button>
  `;
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`PulsePanel element not found: ${selector}`);
  return element;
}

function keyboardGlyph(): string {
  return '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4.25 5.5h15.5A2.75 2.75 0 0 1 22.5 8.25v7.5a2.75 2.75 0 0 1-2.75 2.75H4.25a2.75 2.75 0 0 1-2.75-2.75v-7.5A2.75 2.75 0 0 1 4.25 5.5Zm0 1.75c-.55 0-1 .45-1 1v7.5c0 .55.45 1 1 1h15.5c.55 0 1-.45 1-1v-7.5c0-.55-.45-1-1-1H4.25Zm1.25 2h2v1.75h-2V9.25Zm3.5 0h2V11H9V9.25Zm3.5 0h2V11h-2V9.25Zm3.5 0h2.5V11H16V9.25ZM5.5 12.5h2v1.75h-2V12.5Zm3.5 0h6v1.75H9V12.5Zm7.5 0h2v1.75h-2V12.5Z"/></svg>';
}

function paletteGlyph(): string {
  return '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.25a9.75 9.75 0 0 0 0 19.5h1.25a2.5 2.5 0 0 0 0-5H12a1.5 1.5 0 0 1 0-3h2.4c4.04 0 7.35-2.8 7.35-6.22C21.75 4.15 17.53 2.25 12 2.25ZM7.1 12.1a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7Zm1.4-4.3a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7Zm4.4-1.2a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7Zm4.15 2a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7Z"/></svg>';
}

function puzzleGlyph(): string {
  return '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M13.75 2.5v3.25H17a1.25 1.25 0 0 1 1.25 1.25v3.25h1a2.75 2.75 0 1 1 0 5.5h-1V19A1.25 1.25 0 0 1 17 20.25h-3.25v-1a2.75 2.75 0 1 0-5.5 0v1H5A1.25 1.25 0 0 1 3.75 19v-3.25h1a2.75 2.75 0 1 0 0-5.5h-1V7A1.25 1.25 0 0 1 5 5.75h3.25V2.5h5.5Z"/></svg>';
}

function escapeHtml(value: string): string {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

const CONTROL_CENTER_CSS = `
  :host { color-scheme: dark; }
  :host, .panel, .panel *, .launcher, .launcher * {
    box-sizing: border-box;
    font-family: "gg sans", "Noto Sans", "Segoe UI Variable Text", "Segoe UI", ui-sans-serif, system-ui, sans-serif !important;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  button { color: inherit; font: inherit; }
  .launcher {
    pointer-events: auto; position: fixed; right: 18px; bottom: 18px; width: 50px; height: 50px; padding: 0;
    overflow: hidden; border: 1px solid rgba(255,255,255,.12); border-radius: 16px; background: #101116; cursor: pointer;
    display: grid; place-items: center; box-shadow: 0 14px 38px rgba(0,0,0,.42); transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;
  }
  .launcher img { width: 100%; height: 100%; object-fit: cover; }
  .launcher:hover, .launcher.active { transform: translateY(-2px); border-color: rgba(167,139,250,.74); box-shadow: 0 17px 42px rgba(0,0,0,.48), 0 0 0 3px rgba(139,92,246,.12); }
  .launcher:focus-visible, button:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; }
  .panel {
    pointer-events: auto; position: fixed; right: 18px; bottom: 80px; width: min(408px, calc(100vw - 36px));
    max-height: calc(100vh - 104px); overflow: auto; border: 1px solid rgba(255,255,255,.09); border-radius: 22px;
    color: #f4f5f7; background: #111319; box-shadow: 0 30px 90px rgba(0,0,0,.62); animation: enter .18s cubic-bezier(.2,.75,.25,1);
  }
  .panel[hidden] { display: none; }
  @keyframes enter { from { opacity: 0; transform: translateY(9px) scale(.985); } }
  .topbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 17px 11px; }
  .identity { display: flex; align-items: center; gap: 11px; }
  .brand-logo { width: 38px; height: 38px; border: 1px solid #343743; border-radius: 12px; object-fit: cover; box-shadow: 0 7px 16px rgba(0,0,0,.3); }
  .identity-copy { display: grid; gap: 1px; }
  .identity-copy strong { color: #f7f7f9; font-size: 15px; font-weight: 680; letter-spacing: -.015em; }
  .identity-copy small { color: #808796; font-size: 10.5px; font-weight: 520; }
  .icon-button { width: 34px; height: 34px; border: 0; border-radius: 10px; color: #8d94a3; background: transparent; cursor: pointer; font-size: 23px; line-height: 1; }
  .icon-button:hover { color: white; background: rgba(255,255,255,.065); }
  .hero { position: relative; overflow: hidden; padding: 14px 20px 19px; }
  .hero::after { content: ""; position: absolute; width: 220px; height: 220px; right: -105px; top: -80px; border-radius: 50%; background: radial-gradient(circle, rgba(139,92,246,.25), transparent 68%); pointer-events: none; }
  .eyebrow { color: #bba4ff; font-size: 9.5px; font-weight: 760; letter-spacing: .13em; }
  h2 { margin: 7px 0 7px; color: #f7f7f9; font-size: 25px; font-weight: 700; line-height: 1.08; letter-spacing: -.04em; }
  .hero p { max-width: 325px; margin: 0; color: #9ca3b1; font-size: 11.5px; line-height: 1.5; }
  .service-badge { display: flex; align-items: center; gap: 10px; margin: 0 14px 13px; padding: 10px 11px; border: 1px solid rgba(88,101,242,.25); border-radius: 13px; background: rgba(88,101,242,.075); }
  .discord-mark { flex: 0 0 auto; width: 32px; height: 32px; display: grid; place-items: center; border-radius: 9px; background: #5865f2; }
  .discord-mark img { display: block; width: 20px; height: auto; }
  .service-badge > span:nth-child(2) { min-width: 0; flex: 1; display: grid; gap: 1px; }
  .service-badge b { font-size: 11.5px; font-weight: 650; }
  .service-badge small { overflow: hidden; color: #9098a8; font-size: 9.5px; text-overflow: ellipsis; white-space: nowrap; }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #3ba55d; box-shadow: 0 0 0 3px rgba(59,165,93,.11); }
  .quick-links { display: grid; gap: 7px; margin: 0 14px 15px; }
  .settings-card { width: 100%; padding: 11px 12px; display: flex; align-items: center; gap: 11px; border: 1px solid rgba(255,255,255,.065); border-radius: 13px; text-align: left; background: #181a21; cursor: pointer; transition: .15s ease; }
  .settings-card:hover { border-color: rgba(139,92,246,.44); background: #1c1a28; transform: translateY(-1px); }
  .settings-icon { flex: 0 0 auto; width: 35px; height: 35px; display: grid; place-items: center; border-radius: 10px; color: #c4b5fd; background: rgba(139,92,246,.16); }
  .settings-icon svg { width: 20px; height: 20px; }
  .settings-card > span:nth-child(2) { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .settings-card b { font-size: 11.5px; font-weight: 660; }
  .settings-card small { color: #8f96a5; font-size: 9.5px; }
  .settings-card > i { color: #a78bfa; font-size: 23px; font-style: normal; line-height: 1; }
  .safe-banner { display: grid; gap: 4px; margin: 0 14px 12px; padding: 12px; border-radius: 13px; background: rgba(236,169,73,.1); border: 1px solid rgba(236,169,73,.28); }
  .safe-banner b { color: #f0bd70; font-size: 11.5px; }
  .safe-banner span { color: #b6a78e; font-size: 9.5px; }
  .safe-banner button { justify-self: start; margin-top: 4px; padding: 6px 9px; border: 0; border-radius: 7px; color: #20190f; background: #f0bd70; font-size: 9px; font-weight: 750; cursor: pointer; }
  footer { display: flex; align-items: center; gap: 9px; padding: 12px 15px 14px; border-top: 1px solid rgba(255,255,255,.06); }
  footer span { width: 1px; height: 14px; background: rgba(255,255,255,.08); }
  footer button { border: 0; padding: 4px 0; color: #858c9b; background: transparent; font-size: 9.5px; cursor: pointer; }
  footer button:hover { color: #e7e9ed; }
`;
