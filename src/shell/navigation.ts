import type { RuntimeEnvironment } from "../shared/contracts";

export interface ShellDestination {
  id: string;
  label: string;
  glyph: string;
  /**
   * Only the Discord surface is built in this milestone. The rest are declared
   * here so the rail shows the shape of the product, and are explicitly marked
   * unavailable rather than rendered as if they worked.
   */
  available: boolean;
}

export const SHELL_DESTINATIONS: readonly ShellDestination[] = [
  { id: "discord", label: "Discord", glyph: chatGlyph(), available: true },
  { id: "activity", label: "Central de Atividade", glyph: pulseGlyph(), available: false },
  { id: "organization", label: "Organização", glyph: boardGlyph(), available: false },
  { id: "automations", label: "Automações", glyph: boltGlyph(), available: false },
  { id: "themes", label: "Temas", glyph: paletteGlyph(), available: false },
  { id: "settings", label: "Configurações", glyph: gearGlyph(), available: false }
];

export function mountShellNavigation(target: Document, environment: RuntimeEnvironment | undefined): void {
  const rail = target.getElementById("pulsecord-nav");
  if (!rail) throw new Error("The shell navigation rail is missing from the document.");

  rail.replaceChildren();

  const brand = target.createElement("div");
  brand.className = "brand";
  brand.title = environment ? `PulseCord ${environment.appVersion}` : "PulseCord";
  brand.setAttribute("aria-label", brand.title);
  rail.append(brand);

  const list = target.createElement("nav");
  list.className = "destinations";
  list.setAttribute("aria-label", "Áreas do PulseCord");

  for (const destination of SHELL_DESTINATIONS) {
    const button = target.createElement("button");
    button.type = "button";
    button.className = "destination";
    button.dataset.destination = destination.id;
    button.innerHTML = destination.glyph;

    if (destination.available) {
      button.title = destination.label;
      button.setAttribute("aria-label", destination.label);
      button.setAttribute("aria-current", "page");
      button.classList.add("active");
    } else {
      button.title = `${destination.label} — em breve`;
      button.setAttribute("aria-label", `${destination.label}, em breve`);
      button.disabled = true;
    }

    list.append(button);
  }

  rail.append(list);

  if (environment?.safeMode) {
    const badge = target.createElement("span");
    badge.className = "safe-badge";
    badge.textContent = "SAFE";
    badge.title = "Modo seguro ativo";
    rail.append(badge);
  }
}

function chatGlyph(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3c-5 0-9 3.4-9 7.6 0 2.4 1.3 4.5 3.4 5.9-.2 1.2-.8 2.4-1.8 3.4 1.8-.2 3.4-.9 4.7-1.9 .9.2 1.8.3 2.7.3 5 0 9-3.4 9-7.7C21 6.4 17 3 12 3Z"/></svg>';
}

function pulseGlyph(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 12h3.5l2.5 6 4-14 2.5 8H21"/></svg>';
}

function boardGlyph(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h6v10H4V4Zm10 0h6v6h-6V4ZM4 16h6v4H4v-4Zm10-4h6v8h-6v-8Z"/></svg>';
}

function boltGlyph(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 2 4 13.5h6L9.5 22 20 10.5h-6.5L13.5 2Z"/></svg>';
}

function paletteGlyph(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5a9.5 9.5 0 0 0 0 19h1.2a2.4 2.4 0 0 0 0-4.9H12a1.5 1.5 0 0 1 0-3h2.3c3.9 0 7.2-2.7 7.2-6.1 0-3.4-4.1-5-9.5-5Zm-4.8 9.4a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm1.4-4.2a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm4.3-1.1a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm4 1.9a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Z"/></svg>';
}

function gearGlyph(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Zm8.5 3.6c0 .5 0 1-.1 1.4l2 1.5-1.9 3.3-2.4-1a7.6 7.6 0 0 1-2.4 1.4l-.4 2.5h-3.8l-.4-2.5a7.6 7.6 0 0 1-2.4-1.4l-2.4 1L2 14.9l2-1.5a8.6 8.6 0 0 1 0-2.8L2 9.1 3.9 5.8l2.4 1a7.6 7.6 0 0 1 2.4-1.4l.4-2.5h3.8l.4 2.5c.9.3 1.7.8 2.4 1.4l2.4-1L22 9.1l-2 1.5c.1.4.1.9.1 1.4Z"/></svg>';
}
