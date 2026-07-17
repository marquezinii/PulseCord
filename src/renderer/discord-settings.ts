import type { AppSettings, NativeBridge } from "../shared/contracts";
import { mountShortcutEditor, type ShortcutEditorController } from "./shortcut-editor";
import { mountThemeEditor, type ThemeEditorController } from "./theme-editor";

export type PulseCordSettingsPage = "plugins" | "themes" | "shortcuts";

export const OPEN_PULSECORD_SETTINGS_EVENT = "pulsecord:open-settings";
export const OPEN_SHORTCUTS_SETTINGS_EVENT = "pulsecord:open-shortcuts-settings";

const CUSTOM_ITEM_ATTRIBUTE = "data-pulsecord-settings-item";
const SYSTEM_HIDDEN_ATTRIBUTE = "data-pulsecord-system-hidden";

interface MountedSettingsIntegration {
  readonly nav: HTMLElement;
  readonly section: HTMLElement;
  destroy(): void;
  isAlive(): boolean;
  show(page: PulseCordSettingsPage): void;
  sync(): void;
}

export function mountDiscordSettingsIntegration(settings: AppSettings, bridge: NativeBridge): () => void {
  let mounted: MountedSettingsIntegration | undefined;
  let pendingPage: PulseCordSettingsPage | undefined;
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
    if (mounted && !mounted.isAlive()) {
      mounted.destroy();
      mounted = undefined;
    }

    if (!mounted) {
      const systemItem = document.querySelector<HTMLElement>('[data-settings-sidebar-item="system_panel"]');
      const sourceItem = document.querySelector<HTMLElement>('[data-settings-sidebar-item="appearance_panel"]') ??
        document.querySelector<HTMLElement>('[data-settings-sidebar-item="voice_and_video_panel"]');
      const nav = sourceItem?.closest<HTMLElement>("nav");
      const content = nav ? findSettingsContent(nav) : undefined;

      if (systemItem && sourceItem && nav && content) {
        try {
          mounted = createSettingsIntegration(nav, content, sourceItem, systemItem, settings, bridge);
        } catch (error) {
          systemItem.removeAttribute(SYSTEM_HIDDEN_ATTRIBUTE);
          console.error("[PulseCord] Settings integration could not be mounted.", error);
        }
      }
    }

    mounted?.sync();
    if (mounted && pendingPage) {
      const page = pendingPage;
      pendingPage = undefined;
      mounted.show(page);
    }
  };

  const openPage = (page: PulseCordSettingsPage): void => {
    pendingPage = page;
    sync();
    if (mounted) {
      pendingPage = undefined;
      mounted.show(page);
      return;
    }

    findUserSettingsButton()?.click();
    window.setTimeout(scheduleSync, 60);
    window.setTimeout(scheduleSync, 250);
    window.setTimeout(scheduleSync, 700);
  };

  const onOpenSettings = (event: Event): void => {
    const page = event instanceof CustomEvent ? event.detail : undefined;
    openPage(isPulseCordPage(page) ? page : "plugins");
  };
  const onOpenShortcuts = (): void => openPage("shortcuts");

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener(OPEN_PULSECORD_SETTINGS_EVENT, onOpenSettings);
  document.addEventListener(OPEN_SHORTCUTS_SETTINGS_EVENT, onOpenShortcuts);
  scheduleSync();

  return (): void => {
    observer.disconnect();
    document.removeEventListener(OPEN_PULSECORD_SETTINGS_EVENT, onOpenSettings);
    document.removeEventListener(OPEN_SHORTCUTS_SETTINGS_EVENT, onOpenShortcuts);
    mounted?.destroy();
  };
}

function createSettingsIntegration(
  nav: HTMLElement,
  content: HTMLElement,
  sourceItem: HTMLElement,
  systemItem: HTMLElement,
  settings: AppSettings,
  bridge: NativeBridge
): MountedSettingsIntegration {
  installStyles();

  const nativeSection = systemItem.parentElement ?? sourceItem.parentElement;
  if (!nativeSection?.parentElement) throw new Error("PulseCord could not locate the settings section.");

  const section = document.createElement("section");
  section.className = "pc-settings-category";
  section.setAttribute("aria-label", "PulseCord");
  const heading = document.createElement("div");
  heading.className = "pc-settings-category-title";
  heading.textContent = "PulseCord";
  section.append(heading);

  const items = new Map<PulseCordSettingsPage, HTMLElement>([
    ["plugins", createNavItem(sourceItem, "plugins", "Plugins", puzzleGlyph())],
    ["themes", createNavItem(sourceItem, "themes", "Temas", paletteGlyph())],
    ["shortcuts", createNavItem(sourceItem, "shortcuts", "Atalhos PulseCord", keyboardGlyph())]
  ]);
  section.append(...items.values());
  nativeSection.insertAdjacentElement("afterend", section);

  systemItem.setAttribute(SYSTEM_HIDDEN_ATTRIBUTE, "true");

  const customPage = document.createElement("div");
  customPage.className = "pc-settings-page";
  customPage.hidden = true;
  customPage.innerHTML = `
    <div class="pc-settings-scroll">
      <section class="pc-page-view" data-page="plugins" hidden>
        <header class="pc-page-heading">
          <span class="pc-page-icon" aria-hidden="true">${puzzleGlyph()}</span>
          <div><span class="pc-page-kicker">PULSECORD</span><h1>Plugins</h1><p>Este espaço está sendo preparado para os plugins próprios do PulseCord.</p></div>
        </header>
        <div class="pc-empty-state">
          <span aria-hidden="true">${constructionGlyph()}</span>
          <div><h2>Área em construção</h2><p>Ainda não distribuímos nenhum plugin. A infraestrutura existe, mas o catálogo só será aberto quando cada recurso estiver pronto e revisado.</p></div>
          <em>Em breve</em>
        </div>
      </section>
      <section class="pc-page-view" data-page="themes" hidden>
        <header class="pc-page-heading">
          <span class="pc-page-icon" aria-hidden="true">${paletteGlyph()}</span>
          <div><span class="pc-page-kicker">PULSECORD</span><h1>Temas</h1><p>Escreva e aplique seu próprio CSS diretamente no cliente.</p></div>
        </header>
        <main class="pc-theme-editor" aria-label="Editor de tema CSS"></main>
      </section>
    </div>
  `;
  content.append(customPage);

  const themeRoot = requireElement<HTMLElement>(customPage, ".pc-theme-editor");
  const themeEditor: ThemeEditorController = mountThemeEditor(themeRoot, settings, bridge);

  let currentPage: PulseCordSettingsPage | undefined;
  let shortcutExtension: HTMLElement | undefined;
  let shortcutEditor: ShortcutEditorController | undefined;
  let hiddenNativeBody: HTMLElement | undefined;
  let openingSystemProxy = false;
  let currentActiveClass: string | undefined;

  const clearCustomActiveState = (): void => {
    for (const item of items.values()) {
      const link = getItemLink(item);
      link.removeAttribute("aria-current");
      if (currentActiveClass) link.classList.remove(currentActiveClass);
    }
  };

  const activateCustomItem = (page: PulseCordSettingsPage): void => {
    const activeNative = nav.querySelector<HTMLElement>('[aria-current="page"]:not([data-pulsecord-link])');
    currentActiveClass = findActiveClass(sourceItem, activeNative) ?? currentActiveClass;
    activeNative?.removeAttribute("aria-current");
    if (currentActiveClass) activeNative?.classList.remove(currentActiveClass);
    clearCustomActiveState();

    const link = getItemLink(requireMapValue(items, page));
    if (currentActiveClass) link.classList.add(currentActiveClass);
    link.setAttribute("aria-current", "page");
  };

  const restoreNativeBody = (): void => {
    if (hiddenNativeBody?.isConnected) hiddenNativeBody.style.removeProperty("display");
    hiddenNativeBody = undefined;
  };

  const showOwnPage = (page: "plugins" | "themes"): void => {
    restoreNativeBody();
    const nativeBody = findNativeBody(content);
    if (nativeBody) {
      hiddenNativeBody = nativeBody;
      nativeBody.style.setProperty("display", "none", "important");
    }

    customPage.hidden = false;
    for (const view of customPage.querySelectorAll<HTMLElement>(".pc-page-view")) {
      view.hidden = view.dataset.page !== page;
    }
    currentPage = page;
    activateCustomItem(page);
    setBreadcrumb(content, pageTitle(page));
    customPage.scrollTop = 0;
  };

  const mountShortcutsExtension = (nativeBody: HTMLElement): boolean => {
    const standardHeading = findTextLeaf(nativeBody, /^(?:atalhos padrão|default shortcuts)$/i);
    if (shortcutExtension?.isConnected) return true;
    shortcutEditor?.destroy();

    const extension = document.createElement("section");
    extension.className = "pc-shortcuts-extension";
    extension.innerHTML = `
      <header class="pc-shortcuts-heading">
        <div><span class="pc-page-kicker">PULSECORD</span><h2>Adicionar atalho</h2><p>Escolha uma ação e grave uma combinação. Os atalhos padrão do Discord continuam logo abaixo.</p></div>
        <span class="pc-desktop-badge">Desktop</span>
      </header>
      <main class="pc-shortcut-editor" aria-label="Editor de atalhos do PulseCord"></main>
      <div class="pc-settings-toast" role="status" aria-live="polite"></div>
    `;

    const customHeading = findTextLeaf(nativeBody, /^(?:atalhos (?:do teclado )?personalizados|custom (?:keyboard )?shortcuts|custom keybinds)$/i);
    const common = customHeading && standardHeading
      ? findCommonAncestor(customHeading, standardHeading, nativeBody)
      : undefined;
    const standardBlock = standardHeading
      ? (common ? directChildUnder(standardHeading, common) : standardHeading.parentElement)
      : undefined;
    const customBlock = common && customHeading ? directChildUnder(customHeading, common) : undefined;
    if (customBlock && customBlock !== standardBlock) customBlock.setAttribute("data-pulsecord-native-warning", "true");

    if (standardBlock?.parentElement) standardBlock.parentElement.insertBefore(extension, standardBlock);
    else nativeBody.prepend(extension);

    const editorRoot = requireElement<HTMLElement>(extension, ".pc-shortcut-editor");
    const toast = requireElement<HTMLElement>(extension, ".pc-settings-toast");
    let toastTimer = 0;
    shortcutEditor = mountShortcutEditor(editorRoot, settings, bridge, {
      onStatus(message, kind): void {
        window.clearTimeout(toastTimer);
        toast.textContent = message;
        toast.dataset.kind = kind;
        toast.classList.add("visible");
        toastTimer = window.setTimeout(() => toast.classList.remove("visible"), kind === "info" ? 3200 : 2200);
      }
    });
    shortcutExtension = extension;
    return true;
  };

  const syncShortcutsPage = (): void => {
    if (currentPage !== "shortcuts") return;
    const nativeBody = findNativeBody(content);
    if (!nativeBody) return;

    restoreNativeBody();
    customPage.hidden = true;
    if (mountShortcutsExtension(nativeBody)) {
      activateCustomItem("shortcuts");
      setBreadcrumb(content, "Atalhos PulseCord");
    }
  };

  const showShortcuts = (): void => {
    restoreNativeBody();
    customPage.hidden = true;
    currentPage = "shortcuts";
    openingSystemProxy = true;
    const systemLink = systemItem.querySelector<HTMLElement>('[role="link"]') ?? systemItem;
    systemLink.click();
    openingSystemProxy = false;
    activateCustomItem("shortcuts");
    setBreadcrumb(content, "Atalhos PulseCord");
    window.setTimeout(syncShortcutsPage, 0);
    window.setTimeout(syncShortcutsPage, 80);
    window.setTimeout(syncShortcutsPage, 260);
  };

  const show = (page: PulseCordSettingsPage): void => {
    if (page === "shortcuts") showShortcuts();
    else showOwnPage(page);
  };

  const leavePulseCord = (): void => {
    currentPage = undefined;
    shortcutEditor?.cancelRecording();
    customPage.hidden = true;
    restoreNativeBody();
    clearCustomActiveState();
  };

  const onNavClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const customItem = event.target.closest<HTMLElement>(`[${CUSTOM_ITEM_ATTRIBUTE}]`);
    if (customItem) {
      const page = customItem.getAttribute(CUSTOM_ITEM_ATTRIBUTE);
      if (!isPulseCordPage(page)) return;
      event.preventDefault();
      event.stopPropagation();
      show(page);
      return;
    }

    if (!openingSystemProxy && event.target.closest("[data-settings-sidebar-item]")) leavePulseCord();
  };

  const onNavKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!(event.target instanceof Element)) return;
    const customItem = event.target.closest<HTMLElement>(`[${CUSTOM_ITEM_ATTRIBUTE}]`);
    const page = customItem?.getAttribute(CUSTOM_ITEM_ATTRIBUTE);
    if (!isPulseCordPage(page)) return;
    event.preventDefault();
    event.stopPropagation();
    show(page);
  };

  nav.addEventListener("click", onNavClick, true);
  nav.addEventListener("keydown", onNavKeyDown, true);

  return {
    nav,
    section,
    show,
    sync(): void {
      if (currentPage === "shortcuts") syncShortcutsPage();
      if (currentPage === "plugins" || currentPage === "themes") {
        const nativeBody = findNativeBody(content);
        if (nativeBody && nativeBody !== hiddenNativeBody) {
          restoreNativeBody();
          hiddenNativeBody = nativeBody;
          nativeBody.style.setProperty("display", "none", "important");
        }
        activateCustomItem(currentPage);
      }
    },
    isAlive(): boolean {
      return nav.isConnected && section.isConnected && content.isConnected && systemItem.isConnected;
    },
    destroy(): void {
      leavePulseCord();
      themeEditor.destroy();
      shortcutEditor?.destroy();
      nav.removeEventListener("click", onNavClick, true);
      nav.removeEventListener("keydown", onNavKeyDown, true);
      systemItem.removeAttribute(SYSTEM_HIDDEN_ATTRIBUTE);
      section.remove();
      customPage.remove();
      shortcutExtension?.remove();
    }
  };
}

function createNavItem(sourceItem: HTMLElement, page: PulseCordSettingsPage, label: string, glyph: string): HTMLElement {
  const item = sourceItem.cloneNode(true) as HTMLElement;
  item.removeAttribute("data-settings-sidebar-item");
  item.setAttribute(CUSTOM_ITEM_ATTRIBUTE, page);
  item.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));

  const link = getItemLink(item);
  link.dataset.pulsecordLink = page;
  link.removeAttribute("aria-current");
  link.removeAttribute("data-list-item-id");
  link.setAttribute("role", "link");
  link.tabIndex = 0;

  const textNode = item.querySelector<HTMLElement>('[data-text-variant="text-md/medium"]') ?? findLastTextLeaf(link);
  if (textNode) textNode.textContent = label;

  const nativeIcon = item.querySelector("svg");
  if (nativeIcon) {
    const icon = createSvgIcon(glyph, nativeIcon.getAttribute("class") ?? "");
    nativeIcon.replaceWith(icon);
  }
  return item;
}

function getItemLink(item: HTMLElement): HTMLElement {
  return item.querySelector<HTMLElement>('[role="link"]') ?? item;
}

function findSettingsContent(nav: HTMLElement): HTMLElement | undefined {
  const aside = nav.closest<HTMLElement>("aside");
  return (aside?.nextElementSibling as HTMLElement | null) ?? undefined;
}

function findNativeBody(content: HTMLElement): HTMLElement | undefined {
  const candidate = content.querySelector<HTMLElement>(":scope > :nth-child(2)");
  return candidate && !candidate.classList.contains("pc-settings-page") ? candidate : undefined;
}

function findUserSettingsButton(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    /^(?:Configurações de usuário|User Settings)$/i.test(button.getAttribute("aria-label") ?? button.title)
  );
}

function findBreadcrumb(content: HTMLElement): HTMLElement | undefined {
  const navs = [...content.querySelectorAll<HTMLElement>("nav")];
  const breadcrumb = navs.find((candidate) => /(?:navegação|breadcrumbs)/i.test(candidate.getAttribute("aria-label") ?? ""));
  if (!breadcrumb) return undefined;
  return breadcrumb.querySelector<HTMLElement>('[class*="breadcrumbText"]') ?? findLastTextLeaf(breadcrumb);
}

function setBreadcrumb(content: HTMLElement, value: string): void {
  const breadcrumb = findBreadcrumb(content);
  if (breadcrumb) breadcrumb.textContent = value;
}

function findActiveClass(sourceItem: HTMLElement, active: HTMLElement | null): string | undefined {
  if (!active) return undefined;
  const sourceClasses = new Set(getItemLink(sourceItem).classList);
  const difference = [...active.classList].filter((className) => !sourceClasses.has(className));
  return difference.find((className) => /active|selected/i.test(className)) ?? difference[0];
}

function findTextLeaf(root: ParentNode, pattern: RegExp): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, div, span")].find((element) => {
    if (element.children.length > 0) return false;
    return pattern.test(element.textContent?.trim() ?? "");
  });
}

function findLastTextLeaf(root: ParentNode): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>("div, span")]
    .reverse()
    .find((element) => element.children.length === 0 && Boolean(element.textContent?.trim()));
}

function findCommonAncestor(first: HTMLElement, second: HTMLElement, boundary: HTMLElement): HTMLElement | undefined {
  const ancestors = new Set<HTMLElement>();
  let current: HTMLElement | null = first;
  while (current) {
    ancestors.add(current);
    if (current === boundary) break;
    current = current.parentElement;
  }

  current = second;
  while (current) {
    if (ancestors.has(current)) return current;
    if (current === boundary) break;
    current = current.parentElement;
  }
  return undefined;
}

function directChildUnder(element: HTMLElement, ancestor: HTMLElement): HTMLElement | undefined {
  let current = element;
  while (current.parentElement && current.parentElement !== ancestor) current = current.parentElement;
  return current.parentElement === ancestor ? current : undefined;
}

function pageTitle(page: PulseCordSettingsPage): string {
  return { plugins: "Plugins", themes: "Temas", shortcuts: "Atalhos PulseCord" }[page];
}

function isPulseCordPage(value: unknown): value is PulseCordSettingsPage {
  return value === "plugins" || value === "themes" || value === "shortcuts";
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`PulseCord settings element not found: ${selector}`);
  return element;
}

function requireMapValue<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (!value) throw new Error(`PulseCord settings item not found: ${String(key)}`);
  return value;
}

function createSvgIcon(glyph: string, className: string): SVGSVGElement {
  const template = document.createElement("template");
  template.innerHTML = glyph.trim();
  const icon = template.content.firstElementChild as SVGSVGElement | null;
  if (!icon) throw new Error("PulseCord settings icon could not be created.");
  if (className) icon.setAttribute("class", className);
  icon.setAttribute("aria-hidden", "true");
  return icon;
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

function constructionGlyph(): string {
  return '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m14.7 3.1 1.2-1.2a5 5 0 0 1 6.2 6.2l-1.2 1.2-2.8-2.8-4.6 4.6 2.8 2.8-7.8 7.8a1.8 1.8 0 0 1-2.5 0L2.3 18a1.8 1.8 0 0 1 0-2.5l7.8-7.8 2.8 2.8 4.6-4.6-2.8-2.8ZM4 16.8l3.2 3.2 6.6-6.6-3.2-3.2L4 16.8Z"/></svg>';
}

function installStyles(): void {
  if (document.getElementById("pulsecord-settings-styles")) return;
  const style = document.createElement("style");
  style.id = "pulsecord-settings-styles";
  style.textContent = SETTINGS_CSS;
  document.head.append(style);
}

const SETTINGS_CSS = `
  [data-settings-sidebar-item="system_panel"][${SYSTEM_HIDDEN_ATTRIBUTE}] { display: none !important; }
  [data-pulsecord-native-warning="true"] { display: none !important; }
  .pc-settings-category { display: grid; gap: 2px; margin: 16px 8px 0; padding-top: 15px; border-top: 1px solid var(--background-modifier-accent, rgba(255,255,255,.08)); }
  .pc-settings-category-title { padding: 0 10px 7px; color: var(--channels-default, #949ba4); font-size: 11px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; }
  [${CUSTOM_ITEM_ATTRIBUTE}] { position: relative; margin: 0 !important; }
  [${CUSTOM_ITEM_ATTRIBUTE}] [role="link"] { min-height: 36px; cursor: pointer; }
  [${CUSTOM_ITEM_ATTRIBUTE}] svg { width: 20px !important; height: 20px !important; flex: 0 0 20px; }
  .pc-settings-page, .pc-settings-page *, .pc-shortcuts-extension, .pc-shortcuts-extension * {
    box-sizing: border-box;
    font-family: "gg sans", "Noto Sans", "Segoe UI Variable Text", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
  }
  .pc-settings-page { position: relative; min-height: 0; flex: 1 1 auto; overflow: auto; color: var(--text-default, #f2f3f5); background: var(--background-primary, #313338); }
  .pc-settings-page[hidden], .pc-page-view[hidden] { display: none !important; }
  .pc-settings-scroll { width: min(820px, 100%); padding: 38px 40px 80px; }
  .pc-page-heading { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
  .pc-page-icon { display: grid; place-items: center; flex: 0 0 48px; width: 48px; height: 48px; border: 1px solid color-mix(in srgb, #e53045 36%, transparent); border-radius: 14px; color: #f3a5b0; background: color-mix(in srgb, #e53045 12%, var(--background-secondary, #2b2d31)); }
  .pc-page-icon svg { width: 25px; height: 25px; }
  .pc-page-kicker { display: block; margin-bottom: 3px; color: #e87889; font-size: 10px; font-weight: 760; letter-spacing: .13em; }
  .pc-page-heading h1, .pc-shortcuts-heading h2 { margin: 0; color: var(--header-primary, #f2f3f5); font-size: 25px; font-weight: 700; line-height: 1.16; letter-spacing: -.03em; }
  .pc-page-heading p, .pc-shortcuts-heading p { margin: 5px 0 0; color: var(--text-muted, #949ba4); font-size: 13px; line-height: 1.45; }
  .pc-empty-state { display: grid; grid-template-columns: 46px minmax(0,1fr) auto; align-items: center; gap: 15px; padding: 19px; border: 1px solid var(--background-modifier-accent, rgba(255,255,255,.08)); border-radius: 15px; background: var(--background-secondary, #2b2d31); }
  .pc-empty-state > span { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 13px; color: #aeb4bf; background: var(--background-tertiary, #1e1f22); }
  .pc-empty-state svg { width: 24px; height: 24px; }
  .pc-empty-state h2 { margin: 0 0 4px; color: var(--header-primary, #f2f3f5); font-size: 15px; font-weight: 680; }
  .pc-empty-state p { max-width: 560px; margin: 0; color: var(--text-muted, #949ba4); font-size: 12px; line-height: 1.5; }
  .pc-empty-state em, .pc-desktop-badge { padding: 5px 8px; border: 1px solid rgba(255,255,255,.08); border-radius: 7px; color: var(--text-muted, #949ba4); background: rgba(0,0,0,.12); font-size: 10px; font-style: normal; font-weight: 650; white-space: nowrap; }
  .pc-shortcuts-extension { position: relative; margin: 4px 0 32px; padding: 19px; border: 1px solid color-mix(in srgb, #e53045 28%, var(--background-modifier-accent, transparent)); border-radius: 15px; color: var(--text-default, #f2f3f5); background: linear-gradient(145deg, color-mix(in srgb, #e53045 7%, var(--background-secondary, #2b2d31)), var(--background-secondary, #2b2d31) 68%); }
  .pc-shortcuts-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 17px; }
  .pc-shortcuts-heading h2 { font-size: 19px; }
  .pc-shortcuts-heading p { max-width: 610px; font-size: 12px; }
  .pc-settings-toast { position: fixed; left: 50%; bottom: 30px; z-index: 5; max-width: min(440px, calc(100vw - 40px)); padding: 11px 14px; border-radius: 10px; color: #fff; background: #17191f; box-shadow: 0 14px 36px rgba(0,0,0,.38); font-size: 12px; font-weight: 650; opacity: 0; transform: translate(-50%, 8px); pointer-events: none; transition: .16s ease; }
  .pc-settings-toast.visible { opacity: 1; transform: translate(-50%, 0); }
  .pc-settings-toast[data-kind="success"] { background: #287a56; }
  .pc-settings-toast[data-kind="error"] { background: #a92f43; }
  @media (max-width: 760px) {
    .pc-settings-scroll { padding: 26px 18px 70px; }
    .pc-empty-state { grid-template-columns: 42px minmax(0,1fr); }
    .pc-empty-state em { display: none; }
    .pc-shortcuts-heading { flex-direction: column; }
    .pc-desktop-badge { display: none; }
  }
`;
