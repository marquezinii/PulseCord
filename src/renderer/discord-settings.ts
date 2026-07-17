import type { AppSettings, NativeBridge } from "../shared/contracts";
import { mountShortcutEditor, type ShortcutEditorController } from "./shortcut-editor";

export const OPEN_SHORTCUTS_SETTINGS_EVENT = "pulsecord:open-shortcuts-settings";

const CUSTOM_ITEM_ATTRIBUTE = "data-pulsecord-settings-item";

interface MountedSettingsPage {
  nav: HTMLElement;
  destroy(): void;
  show(): void;
}

export function mountDiscordSettingsIntegration(settings: AppSettings, bridge: NativeBridge): () => void {
  let mounted: MountedSettingsPage | undefined;
  let pendingOpen = false;
  let syncQueued = false;

  const scheduleSync = (): void => {
    if (syncQueued) return;
    syncQueued = true;
    window.requestAnimationFrame(() => {
      syncQueued = false;
      sync();
    });
  };

  const sync = (): void => {
    if (mounted && !mounted.nav.isConnected) {
      mounted.destroy();
      mounted = undefined;
    }

    const voiceItem = document.querySelector<HTMLElement>('[data-settings-sidebar-item="voice_and_video_panel"]');
    const nav = voiceItem?.closest<HTMLElement>('nav[aria-label="Páginas de configurações"], nav[aria-label="Settings Pages"]');
    if (!voiceItem || !nav) return;

    if (!mounted || mounted.nav !== nav) {
      mounted?.destroy();
      mounted = createSettingsPage(nav, voiceItem, settings, bridge);
    }

    if (pendingOpen) {
      pendingOpen = false;
      mounted.show();
    }
  };

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const openSettings = (): void => {
    pendingOpen = true;
    sync();
    if (mounted) {
      pendingOpen = false;
      mounted.show();
      return;
    }

    const settingsButton = findUserSettingsButton();
    settingsButton?.click();
    window.setTimeout(scheduleSync, 60);
    window.setTimeout(scheduleSync, 250);
  };

  document.addEventListener(OPEN_SHORTCUTS_SETTINGS_EVENT, openSettings);
  scheduleSync();

  return (): void => {
    observer.disconnect();
    document.removeEventListener(OPEN_SHORTCUTS_SETTINGS_EVENT, openSettings);
    mounted?.destroy();
  };
}

function createSettingsPage(
  nav: HTMLElement,
  sourceItem: HTMLElement,
  settings: AppSettings,
  bridge: NativeBridge
): MountedSettingsPage {
  installStyles();

  const sectionList = sourceItem.parentElement;
  const aside = nav.closest<HTMLElement>("aside");
  const content = aside?.nextElementSibling as HTMLElement | null;
  const nativeBody = content?.querySelector<HTMLElement>(":scope > :nth-child(2)");
  if (!sectionList || !content || !nativeBody) {
    throw new Error("PulseCord could not locate the Discord settings layout.");
  }

  const item = sourceItem.cloneNode(true) as HTMLElement;
  item.removeAttribute("data-settings-sidebar-item");
  item.setAttribute(CUSTOM_ITEM_ATTRIBUTE, "shortcuts");
  item.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));

  const link = requireElement<HTMLElement>(item, '[role="link"]');
  link.removeAttribute("aria-current");
  link.removeAttribute("data-list-item-id");
  link.tabIndex = -1;

  const label = item.querySelector<HTMLElement>('[data-text-variant="text-md/medium"]') ?? link.lastElementChild as HTMLElement;
  if (label) label.textContent = "Atalhos PulseCord";

  const icon = item.querySelector("svg");
  icon?.replaceWith(createKeyboardIcon(icon.getAttribute("class") ?? ""));

  const insertAfter = sectionList.querySelector<HTMLElement>('[data-settings-sidebar-item="system_panel"]') ??
    sectionList.querySelector<HTMLElement>('[data-settings-sidebar-item="appearance_panel"]') ?? sourceItem;
  insertAfter.insertAdjacentElement("afterend", item);

  const page = document.createElement("div");
  page.className = "pc-settings-page";
  page.hidden = true;
  page.innerHTML = `
    <div class="pc-settings-scroll">
      <section class="pc-settings-hero">
        <div class="pc-settings-hero-icon" aria-hidden="true">${keyboardGlyph()}</div>
        <div class="pc-settings-hero-copy">
          <span class="pc-settings-kicker">PULSECORE · CONTROLE NATIVO</span>
          <h1>Atalhos PulseCord</h1>
          <p>Crie combinações personalizadas para controlar o Discord e o PulseCord sem interromper o que você está fazendo.</p>
        </div>
        <span class="pc-settings-platform">Windows</span>
      </section>
      <div class="pc-settings-notice">
        <span aria-hidden="true">✓</span>
        <div><strong>Atalhos globais</strong><small>As combinações funcionam mesmo quando outra janela está em primeiro plano.</small></div>
      </div>
      <main class="pc-shortcut-editor" aria-label="Editor de atalhos do PulseCord"></main>
      <aside class="pc-settings-help">
        <strong>Como definir</strong>
        <p>Clique em <b>Definir atalho</b> e pressione a combinação desejada. Use Backspace para remover ou Esc para cancelar.</p>
      </aside>
    </div>
    <div class="pc-settings-toast" role="status" aria-live="polite"></div>
  `;
  content.append(page);

  const editorRoot = requireElement<HTMLElement>(page, ".pc-shortcut-editor");
  const toast = requireElement<HTMLElement>(page, ".pc-settings-toast");
  let toastTimer = 0;
  const editor = mountShortcutEditor(editorRoot, settings, bridge, {
    onStatus(message, kind): void {
      window.clearTimeout(toastTimer);
      toast.textContent = message;
      toast.dataset.kind = kind;
      toast.classList.add("visible");
      toastTimer = window.setTimeout(() => toast.classList.remove("visible"), kind === "info" ? 3200 : 2200);
    }
  });

  const breadcrumb = findBreadcrumb(content);
  let previousBreadcrumb: string | undefined;
  let previousActive: HTMLElement | undefined;
  let activeClass: string | undefined;
  let active = false;
  const previousBodyDisplay = nativeBody.style.display;

  const hide = (): void => {
    if (!active) return;
    active = false;
    editor.cancelRecording();
    page.hidden = true;
    nativeBody.style.display = previousBodyDisplay;

    link.removeAttribute("aria-current");
    if (activeClass) link.classList.remove(activeClass);
    if (previousActive?.isConnected) {
      previousActive.setAttribute("aria-current", "page");
      if (activeClass) previousActive.classList.add(activeClass);
    }
    if (breadcrumb && previousBreadcrumb !== undefined) breadcrumb.textContent = previousBreadcrumb;
  };

  const show = (): void => {
    if (active) return;
    const current = nav.querySelector<HTMLElement>('[aria-current="page"]');
    previousActive = current && current !== link ? current : undefined;
    activeClass = findActiveClass(sourceItem, current);

    if (previousActive) {
      previousActive.removeAttribute("aria-current");
      if (activeClass) previousActive.classList.remove(activeClass);
    }
    if (activeClass) link.classList.add(activeClass);
    link.setAttribute("aria-current", "page");

    previousBreadcrumb = breadcrumb?.textContent ?? undefined;
    if (breadcrumb) breadcrumb.textContent = "Atalhos PulseCord";
    nativeBody.style.display = "none";
    page.hidden = false;
    active = true;
    page.scrollTop = 0;
  };

  const onNavClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest(`[${CUSTOM_ITEM_ATTRIBUTE}]`)) {
      event.preventDefault();
      event.stopPropagation();
      show();
      return;
    }
    if (event.target.closest("[data-settings-sidebar-item]")) hide();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!event.target || !(event.target instanceof Node) || !item.contains(event.target)) return;
    if (event.code !== "Enter" && event.code !== "Space") return;
    event.preventDefault();
    event.stopPropagation();
    show();
  };

  nav.addEventListener("click", onNavClick, true);
  nav.addEventListener("keydown", onKeyDown, true);

  return {
    nav,
    show,
    destroy(): void {
      hide();
      window.clearTimeout(toastTimer);
      editor.destroy();
      nav.removeEventListener("click", onNavClick, true);
      nav.removeEventListener("keydown", onKeyDown, true);
      item.remove();
      page.remove();
    }
  };
}

function findUserSettingsButton(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    /^(?:Configurações de usuário|User Settings)$/i.test(button.getAttribute("aria-label") ?? button.title)
  );
}

function findBreadcrumb(content: HTMLElement): HTMLElement | undefined {
  const breadcrumbNav = content.querySelector<HTMLElement>('nav[aria-label="Sistema de navegação"], nav[aria-label="Breadcrumbs"]');
  if (!breadcrumbNav) return undefined;
  return breadcrumbNav.querySelector<HTMLElement>('[class*="breadcrumbText"]') ??
    [...breadcrumbNav.querySelectorAll<HTMLElement>("div, span")].find((element) => element.children.length === 0 && Boolean(element.textContent?.trim()));
}

function findActiveClass(sourceItem: HTMLElement, active: HTMLElement | null): string | undefined {
  if (!active) return undefined;
  const sourceLink = sourceItem.querySelector<HTMLElement>('[role="link"]');
  const inactiveClasses = new Set(sourceLink?.classList ?? []);
  return [...active.classList].find((className) => !inactiveClasses.has(className) && /active/i.test(className));
}

function createKeyboardIcon(className: string): SVGSVGElement {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "20");
  icon.setAttribute("height", "20");
  icon.setAttribute("aria-hidden", "true");
  icon.style.cssText = "width:20px!important;height:20px!important;flex:0 0 20px;";
  if (className) icon.setAttribute("class", className);
  icon.innerHTML = '<path fill="currentColor" d="M4.25 5.5h15.5A2.75 2.75 0 0 1 22.5 8.25v7.5a2.75 2.75 0 0 1-2.75 2.75H4.25a2.75 2.75 0 0 1-2.75-2.75v-7.5A2.75 2.75 0 0 1 4.25 5.5Zm0 1.75c-.55 0-1 .45-1 1v7.5c0 .55.45 1 1 1h15.5c.55 0 1-.45 1-1v-7.5c0-.55-.45-1-1-1H4.25Zm1.25 2h2v1.75h-2V9.25Zm3.5 0h2V11H9V9.25Zm3.5 0h2V11h-2V9.25Zm3.5 0h2.5V11H16V9.25ZM5.5 12.5h2v1.75h-2V12.5Zm3.5 0h6v1.75H9V12.5Zm7.5 0h2v1.75h-2V12.5Z"/>';
  return icon;
}

function keyboardGlyph(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4.25 5.5h15.5A2.75 2.75 0 0 1 22.5 8.25v7.5a2.75 2.75 0 0 1-2.75 2.75H4.25a2.75 2.75 0 0 1-2.75-2.75v-7.5A2.75 2.75 0 0 1 4.25 5.5Zm0 1.75c-.55 0-1 .45-1 1v7.5c0 .55.45 1 1 1h15.5c.55 0 1-.45 1-1v-7.5c0-.55-.45-1-1-1H4.25Zm1.25 2h2v1.75h-2V9.25Zm3.5 0h2V11H9V9.25Zm3.5 0h2V11h-2V9.25Zm3.5 0h2.5V11H16V9.25ZM5.5 12.5h2v1.75h-2V12.5Zm3.5 0h6v1.75H9V12.5Zm7.5 0h2v1.75h-2V12.5Z"/></svg>';
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`PulseCord settings element not found: ${selector}`);
  return element;
}

function installStyles(): void {
  if (document.getElementById("pulsecord-settings-styles")) return;
  const style = document.createElement("style");
  style.id = "pulsecord-settings-styles";
  style.textContent = SETTINGS_CSS;
  document.head.append(style);
}

const SETTINGS_CSS = `
  [${CUSTOM_ITEM_ATTRIBUTE}] { position: relative; }
  [${CUSTOM_ITEM_ATTRIBUTE}] [role="link"] { min-height: 36px; cursor: pointer; }
  [${CUSTOM_ITEM_ATTRIBUTE}] svg { width: 20px !important; height: 20px !important; flex: 0 0 20px; }
  .pc-settings-page, .pc-settings-page * {
    box-sizing: border-box;
    font-family: "Segoe UI Variable Text", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
  }
  .pc-settings-page {
    position: relative; min-height: 0; flex: 1 1 auto; overflow: auto; color: var(--text-default, #f2f3f5);
    background: var(--background-primary, #313338);
  }
  .pc-settings-page[hidden] { display: none !important; }
  .pc-settings-scroll { width: min(900px, 100%); padding: 36px 40px 80px; }
  .pc-settings-hero {
    position: relative; display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; gap: 20px; align-items: center;
    overflow: hidden; padding: 25px 26px; border: 1px solid color-mix(in srgb, #d43f55 35%, transparent);
    border-radius: 20px; background: linear-gradient(135deg, color-mix(in srgb, #d43f55 13%, var(--background-secondary, #2b2d31)), var(--background-secondary, #2b2d31) 58%);
    box-shadow: 0 16px 38px rgba(0,0,0,.16);
  }
  .pc-settings-hero::after {
    content: ""; position: absolute; width: 240px; height: 240px; right: -110px; top: -160px; border-radius: 50%;
    background: radial-gradient(circle, rgba(212,63,85,.2), transparent 68%); pointer-events: none;
  }
  .pc-settings-hero-icon { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 17px; color: #fff; background: #c7374e; box-shadow: 0 10px 24px rgba(199,55,78,.26); }
  .pc-settings-hero-icon svg { width: 34px; height: 34px; }
  .pc-settings-hero-copy { min-width: 0; }
  .pc-settings-kicker { display: block; margin-bottom: 5px; color: #ee8b9b; font-size: 11px; font-weight: 750; letter-spacing: .12em; }
  .pc-settings-hero h1 { margin: 0; color: var(--header-primary, #f2f3f5); font-size: 27px; font-weight: 720; line-height: 1.18; letter-spacing: -.035em; }
  .pc-settings-hero p { max-width: 590px; margin: 7px 0 0; color: var(--text-muted, #b5bac1); font-size: 14px; line-height: 1.55; }
  .pc-settings-platform { z-index: 1; align-self: start; padding: 6px 9px; border: 1px solid rgba(255,255,255,.11); border-radius: 8px; color: var(--text-muted, #b5bac1); background: rgba(0,0,0,.15); font-size: 11px; font-weight: 650; }
  .pc-settings-notice { display: flex; align-items: center; gap: 12px; margin: 18px 0 26px; padding: 13px 15px; border: 1px solid color-mix(in srgb, #43b581 25%, transparent); border-radius: 13px; background: color-mix(in srgb, #43b581 8%, transparent); }
  .pc-settings-notice > span { display: grid; place-items: center; width: 27px; height: 27px; border-radius: 50%; color: #fff; background: #388f68; font-size: 14px; font-weight: 800; }
  .pc-settings-notice > div { display: grid; gap: 2px; }
  .pc-settings-notice strong { color: var(--header-primary, #f2f3f5); font-size: 13px; font-weight: 680; }
  .pc-settings-notice small { color: var(--text-muted, #b5bac1); font-size: 12px; line-height: 1.35; }
  .pc-shortcut-editor { display: grid; gap: 24px; }
  .pc-shortcut-group { display: grid; gap: 11px; }
  .pc-shortcut-group-heading { display: flex; align-items: end; justify-content: space-between; gap: 16px; }
  .pc-shortcut-group-heading > div { min-width: 0; }
  .pc-shortcut-group-heading h3 { margin: 0; color: var(--header-primary, #f2f3f5); font-size: 16px; font-weight: 690; letter-spacing: -.012em; }
  .pc-shortcut-group-heading p { margin: 4px 0 0; color: var(--text-muted, #949ba4); font-size: 12px; line-height: 1.4; }
  .pc-shortcut-group-heading > span { flex: 0 0 auto; color: var(--text-muted, #949ba4); font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .06em; }
  .pc-shortcut-list { overflow: hidden; border: 1px solid var(--background-modifier-accent, rgba(255,255,255,.08)); border-radius: 14px; background: var(--background-secondary, #2b2d31); }
  .pc-shortcut-row { display: flex; align-items: center; gap: 24px; min-height: 78px; padding: 15px 16px; border-top: 1px solid var(--background-modifier-accent, rgba(255,255,255,.07)); }
  .pc-shortcut-row:first-child { border-top: 0; }
  .pc-shortcut-copy { flex: 1; min-width: 0; display: grid; gap: 4px; }
  .pc-shortcut-copy strong { color: var(--header-primary, #f2f3f5); font-size: 14px; font-weight: 650; line-height: 1.3; }
  .pc-shortcut-copy small { color: var(--text-muted, #949ba4); font-size: 12px; line-height: 1.45; }
  .pc-shortcut-row button { flex: 0 0 auto; min-width: 142px; max-width: 230px; overflow: hidden; padding: 10px 13px; border: 1px solid var(--background-modifier-accent, rgba(255,255,255,.11)); border-radius: 9px; color: var(--interactive-normal, #dbdee1); background: var(--background-tertiary, #1e1f22); font-size: 12px; font-weight: 640; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; transition: border-color .14s ease, background .14s ease, transform .14s ease; }
  .pc-shortcut-row button:hover { border-color: rgba(212,63,85,.65); background: color-mix(in srgb, #d43f55 10%, var(--background-tertiary, #1e1f22)); }
  .pc-shortcut-row button:active { transform: translateY(1px); }
  .pc-shortcut-row button:focus-visible { outline: 2px solid #ed7588; outline-offset: 2px; }
  .pc-shortcut-row button.recording { border-color: #d43f55; color: #fff; background: rgba(212,63,85,.17); box-shadow: 0 0 0 3px rgba(212,63,85,.1); }
  .pc-shortcut-row button:disabled { opacity: .55; cursor: wait; }
  .pc-settings-help { margin-top: 28px; padding: 16px 17px; border-left: 3px solid #d43f55; border-radius: 4px 12px 12px 4px; background: var(--background-secondary, #2b2d31); }
  .pc-settings-help strong { color: var(--header-primary, #f2f3f5); font-size: 13px; font-weight: 680; }
  .pc-settings-help p { margin: 5px 0 0; color: var(--text-muted, #949ba4); font-size: 12px; line-height: 1.5; }
  .pc-settings-toast { position: fixed; left: 50%; bottom: 30px; z-index: 5; max-width: min(440px, calc(100vw - 40px)); padding: 11px 14px; border-radius: 10px; color: #fff; background: #17191f; box-shadow: 0 14px 36px rgba(0,0,0,.38); font-size: 12px; font-weight: 650; opacity: 0; transform: translate(-50%, 8px); pointer-events: none; transition: .16s ease; }
  .pc-settings-toast.visible { opacity: 1; transform: translate(-50%, 0); }
  .pc-settings-toast[data-kind="success"] { background: #287a56; }
  .pc-settings-toast[data-kind="error"] { background: #a92f43; }
  @media (max-width: 760px) {
    .pc-settings-scroll { padding: 24px 18px 70px; }
    .pc-settings-hero { grid-template-columns: 52px minmax(0, 1fr); padding: 20px; }
    .pc-settings-hero-icon { width: 52px; height: 52px; border-radius: 14px; }
    .pc-settings-hero-icon svg { width: 29px; height: 29px; }
    .pc-settings-platform { display: none; }
    .pc-shortcut-row { align-items: stretch; flex-direction: column; gap: 12px; }
    .pc-shortcut-row button { width: 100%; max-width: none; }
  }
`;
