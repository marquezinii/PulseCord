import discordSymbol from "../../assets/discord-symbol.svg";
import pulseCordLogo from "../../assets/pulsecord-logo.png";
import type { AppSettings, HomeIconPreference, NativeBridge } from "../shared/contracts";

export const HOME_ICON_CHANGED_EVENT = "pulsecord:home-icon-changed";
export const HOME_ICON_SAVE_ERROR_EVENT = "pulsecord:home-icon-save-error";

export type HomeIconMode = HomeIconPreference;
export type BrandingSettings = Pick<AppSettings, "appearance">;
export type BrandingBridge = Pick<NativeBridge, "setHomeIcon">;

interface HomeIconEventDetail {
  mode: HomeIconMode;
}

/**
 * Keeps PulseCord branding attached to Discord's live DOM without replacing any
 * native click handler. The returned function removes every injected element.
 */
export function mountPulseCordBranding(settings: BrandingSettings, bridge: BrandingBridge): () => void {
  let mode = isHomeIconMode(settings.appearance?.homeIcon) ? settings.appearance.homeIcon : "pulsecord";
  let syncQueued = false;
  let saveVersion = 0;

  installStyles();

  const scheduleSync = (): void => {
    if (syncQueued) return;
    syncQueued = true;
    window.requestAnimationFrame(() => {
      syncQueued = false;
      syncHomeIcon(mode);
      syncAppearanceSelector(mode, onSelectMode);
    });
  };

  const setModeLocally = (nextMode: HomeIconMode): void => {
    mode = nextMode;
    syncHomeIcon(mode);
    syncAppearanceSelector(mode, onSelectMode);
  };

  async function onSelectMode(nextMode: HomeIconMode): Promise<void> {
    if (nextMode === mode) return;

    const previousMode = mode;
    const currentSave = ++saveVersion;
    setSelectorBusy(true);
    setModeLocally(nextMode);

    try {
      await bridge.setHomeIcon(nextMode);
      if (currentSave !== saveVersion) return;
      emitHomeIconChanged(nextMode);
    } catch (error) {
      if (currentSave !== saveVersion) return;
      setModeLocally(previousMode);
      document.dispatchEvent(new CustomEvent(HOME_ICON_SAVE_ERROR_EVENT, { detail: { mode: nextMode, error } }));
      console.error("[PulseCord] Could not save the home icon preference.", error);
    } finally {
      if (currentSave === saveVersion) setSelectorBusy(false);
    }
  }

  const onExternalChange = (event: Event): void => {
    const detail = (event as CustomEvent<Partial<HomeIconEventDetail>>).detail;
    if (!isHomeIconMode(detail?.mode)) return;
    if (detail.mode === mode) {
      setSelectorBusy(false);
      return;
    }
    saveVersion += 1;
    setModeLocally(detail.mode);
    setSelectorBusy(false);
  };

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener(HOME_ICON_CHANGED_EVENT, onExternalChange);
  scheduleSync();

  return (): void => {
    observer.disconnect();
    document.removeEventListener(HOME_ICON_CHANGED_EVENT, onExternalChange);
    document.querySelectorAll<HTMLElement>("[data-pulsecord-home-logo]").forEach((element) => element.remove());
    document.querySelectorAll<HTMLElement>("[data-pulsecord-home-host]").forEach((element) =>
      element.removeAttribute("data-pulsecord-home-host")
    );
    document.getElementById("pulsecord-appearance-icon-choice")?.remove();
    document.getElementById("pulsecord-branding-styles")?.remove();
  };
}

/** Updates a mounted branding runtime after another PulseCord surface saves the preference. */
export function emitHomeIconChanged(mode: HomeIconMode): void {
  document.dispatchEvent(new CustomEvent<HomeIconEventDetail>(HOME_ICON_CHANGED_EVENT, { detail: { mode } }));
}

export function isHomeIconMode(value: unknown): value is HomeIconMode {
  return value === "pulsecord" || value === "discord";
}

function syncHomeIcon(mode: HomeIconMode): void {
  const existingLogos = [...document.querySelectorAll<HTMLElement>("[data-pulsecord-home-logo]")];

  if (mode === "discord") {
    for (const logo of existingLogos) logo.remove();
    document.querySelectorAll<HTMLElement>("[data-pulsecord-home-host]").forEach((element) =>
      element.removeAttribute("data-pulsecord-home-host")
    );
    return;
  }

  const homeItem = findHomeItem();
  if (!homeItem) return;
  const host = findHomeIconSurface(homeItem);

  for (const logo of existingLogos) {
    if (!host.contains(logo)) logo.remove();
  }
  document.querySelectorAll<HTMLElement>("[data-pulsecord-home-host]").forEach((element) => {
    if (element !== host) element.removeAttribute("data-pulsecord-home-host");
  });

  host.setAttribute("data-pulsecord-home-host", "");
  if (host.querySelector(":scope > [data-pulsecord-home-logo]")) return;

  const overlay = document.createElement("span");
  overlay.setAttribute("data-pulsecord-home-logo", "");
  overlay.setAttribute("aria-hidden", "true");
  const image = document.createElement("img");
  image.src = pulseCordLogo;
  image.alt = "";
  overlay.append(image);
  host.append(overlay);
}

function findHomeItem(): HTMLElement | undefined {
  const nativeHome = document.querySelector<HTMLElement>('[data-list-item-id="guildsnav___home"]');
  if (nativeHome) return nativeHome;

  return [...document.querySelectorAll<HTMLElement>("[aria-label]")].find((element) => {
    const label = normalizeText(element.getAttribute("aria-label") ?? "");
    return label === "mensagens diretas" || label === "direct messages";
  });
}

function findHomeIconSurface(homeItem: HTMLElement): HTMLElement {
  const knownSurface = homeItem.querySelector<HTMLElement>(
    '[class*="childWrapper"], [class*="iconChild"], [class*="homeIcon"]'
  );
  if (knownSurface) return knownSurface;

  const candidates = [...homeItem.querySelectorAll<HTMLElement>("div, a, button")];
  const measuredSurface = candidates.find((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.width >= 36 && bounds.width <= 56 && bounds.height >= 36 && bounds.height <= 56;
  });
  return measuredSurface ?? homeItem;
}

function syncAppearanceSelector(mode: HomeIconMode, onSelect: (nextMode: HomeIconMode) => Promise<void>): void {
  const existing = document.getElementById("pulsecord-appearance-icon-choice");
  const heading = findAppIconHeading();

  if (!heading?.parentElement) {
    existing?.remove();
    return;
  }

  let selector = existing;
  if (!selector || !selector.isConnected) {
    selector = createAppearanceSelector(onSelect);
    heading.insertAdjacentElement("afterend", selector);
  } else if (selector.previousElementSibling !== heading) {
    heading.insertAdjacentElement("afterend", selector);
  }

  selector.querySelectorAll<HTMLButtonElement>("button[data-home-icon]").forEach((button) => {
    const active = button.dataset.homeIcon === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function findAppIconHeading(): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>("h1, h2, h3, [role='heading']")].find((element) => {
    const text = normalizeText(element.textContent ?? "");
    return text === "icone do aplicativo" || text === "app icon";
  });
}

function createAppearanceSelector(onSelect: (nextMode: HomeIconMode) => Promise<void>): HTMLElement {
  const section = document.createElement("section");
  section.id = "pulsecord-appearance-icon-choice";
  section.setAttribute("aria-labelledby", "pulsecord-home-icon-title");

  const header = document.createElement("div");
  header.className = "pc-appearance-choice-header";
  header.innerHTML = `
    <span>PulseCord</span>
    <strong id="pulsecord-home-icon-title">Ícone da página inicial</strong>
    <small>Escolha o símbolo do botão de Mensagens Diretas. Os ícones Nitro abaixo continuam sendo gerenciados pelo Discord.</small>
  `;

  const choices = document.createElement("div");
  choices.className = "pc-appearance-choices";
  choices.setAttribute("role", "group");
  choices.setAttribute("aria-label", "Ícone da página inicial");
  choices.append(
    createIconChoice("pulsecord", "PulseCord", "Ativo por padrão", pulseCordLogo, false),
    createIconChoice("discord", "Seguir Discord", "Usa o ícone escolhido abaixo", discordSymbol, true)
  );
  choices.addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button[data-home-icon]");
    if (!button || button.disabled || !isHomeIconMode(button.dataset.homeIcon)) return;
    void onSelect(button.dataset.homeIcon);
  });

  section.append(header, choices);
  return section;
}

function createIconChoice(
  mode: HomeIconMode,
  label: string,
  description: string,
  imageSource: string,
  discord: boolean
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pc-appearance-choice";
  button.dataset.homeIcon = mode;
  button.setAttribute("aria-pressed", "false");

  const preview = document.createElement("span");
  preview.className = discord ? "pc-icon-preview is-discord" : "pc-icon-preview";
  const image = document.createElement("img");
  image.src = imageSource;
  image.alt = "";
  preview.append(image);

  const copy = document.createElement("span");
  copy.className = "pc-icon-choice-copy";
  const strong = document.createElement("strong");
  strong.textContent = label;
  const small = document.createElement("small");
  small.textContent = description;
  copy.append(strong, small);

  const check = document.createElement("span");
  check.className = "pc-choice-check";
  check.setAttribute("aria-hidden", "true");
  check.textContent = "✓";
  button.append(preview, copy, check);
  return button;
}

function setSelectorBusy(busy: boolean): void {
  document.querySelectorAll<HTMLButtonElement>("#pulsecord-appearance-icon-choice button[data-home-icon]").forEach((button) => {
    button.disabled = busy;
  });
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function installStyles(): void {
  if (document.getElementById("pulsecord-branding-styles")) return;
  const style = document.createElement("style");
  style.id = "pulsecord-branding-styles";
  style.textContent = BRANDING_CSS;
  document.head.append(style);
}

const BRANDING_CSS = `
  [data-pulsecord-home-host] { position: relative !important; }
  [data-pulsecord-home-logo] {
    position: absolute; inset: 0; z-index: 5; display: grid; place-items: center;
    overflow: hidden; border-radius: inherit; background: #0b0c0f; pointer-events: none;
  }
  [data-pulsecord-home-logo] img {
    display: block; width: 100%; height: 100%; object-fit: cover; pointer-events: none;
  }
  #pulsecord-appearance-icon-choice, #pulsecord-appearance-icon-choice * { box-sizing: border-box; }
  #pulsecord-appearance-icon-choice {
    margin: 16px 0 24px; padding: 17px; border: 1px solid color-mix(in srgb, #ed4245 28%, transparent);
    border-radius: 14px; color: var(--text-default, #dbdee1);
    background: linear-gradient(135deg, color-mix(in srgb, #ed4245 7%, var(--background-secondary, #2b2d31)), var(--background-secondary, #2b2d31));
  }
  .pc-appearance-choice-header { display: grid; gap: 3px; margin-bottom: 13px; }
  .pc-appearance-choice-header > span { color: #ef6b6d; font-size: 10px; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; }
  .pc-appearance-choice-header strong { color: var(--header-primary, #f2f3f5); font-size: 15px; font-weight: 680; }
  .pc-appearance-choice-header small { max-width: 620px; color: var(--text-muted, #b5bac1); font-size: 12px; line-height: 1.45; }
  .pc-appearance-choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .pc-appearance-choice {
    min-width: 0; display: grid; grid-template-columns: 42px minmax(0, 1fr) 22px; gap: 11px; align-items: center;
    padding: 10px; border: 1px solid var(--background-modifier-accent, rgba(255,255,255,.09)); border-radius: 11px;
    color: inherit; text-align: left; background: color-mix(in srgb, var(--background-primary, #313338) 84%, transparent); cursor: pointer;
    transition: border-color .15s ease, background .15s ease, transform .15s ease;
  }
  .pc-appearance-choice:hover { border-color: color-mix(in srgb, #ed4245 46%, transparent); background: color-mix(in srgb, #ed4245 7%, var(--background-primary, #313338)); transform: translateY(-1px); }
  .pc-appearance-choice:focus-visible { outline: 2px solid var(--brand-500, #5865f2); outline-offset: 2px; }
  .pc-appearance-choice:disabled { opacity: .72; cursor: wait; transform: none; }
  .pc-appearance-choice.is-active { border-color: #ed4245; box-shadow: 0 0 0 1px color-mix(in srgb, #ed4245 24%, transparent); }
  .pc-icon-preview { width: 42px; height: 42px; overflow: hidden; border-radius: 12px; background: #0b0c0f; }
  .pc-icon-preview img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .pc-icon-preview.is-discord { display: grid; place-items: center; background: #5865f2; }
  .pc-icon-preview.is-discord img { width: 26px; height: auto; object-fit: contain; }
  .pc-icon-choice-copy { min-width: 0; display: grid; gap: 2px; }
  .pc-icon-choice-copy strong { overflow: hidden; color: var(--header-primary, #f2f3f5); font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
  .pc-icon-choice-copy small { overflow: hidden; color: var(--text-muted, #949ba4); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .pc-choice-check { width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; color: transparent; background: var(--background-modifier-accent, rgba(255,255,255,.08)); font-size: 12px; font-weight: 800; }
  .pc-appearance-choice.is-active .pc-choice-check { color: #fff; background: #ed4245; }
  @media (max-width: 620px) { .pc-appearance-choices { grid-template-columns: 1fr; } }
`;
