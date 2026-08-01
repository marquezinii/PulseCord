import type { ActivitySnapshot, AppSettings, RuntimeEnvironment } from "../shared/contracts";

/**
 * The Activity screen: PulseCord's own home, shown in the shell's content area
 * when the Discord surface is hidden.
 *
 * It shows two kinds of fact, and keeps them visibly separate. What PulseCord
 * knows about itself is authoritative. What it knows about Discord is one
 * reading of a surface PulseCord does not own, and is labelled as such —
 * including, prominently, when there is no reading at all.
 */

export interface ActivityViewOptions {
  environment: RuntimeEnvironment | undefined;
  settings: AppSettings | undefined;
  onOpenDiscord(): void;
}

export interface ActivityViewController {
  update(snapshot: ActivitySnapshot): void;
}

export function renderActivityScreen(
  target: Document,
  host: HTMLElement,
  options: ActivityViewOptions
): ActivityViewController {
  host.replaceChildren();

  const screen = target.createElement("section");
  screen.className = "screen";
  screen.setAttribute("aria-label", "Central de Atividade");

  const heading = target.createElement("header");
  heading.className = "screen-header";
  const title = target.createElement("h1");
  title.textContent = "Central de Atividade";
  const subtitle = target.createElement("p");
  subtitle.textContent = "O que o PulseCord sabe agora — sobre si mesmo e sobre o serviço conectado.";
  heading.append(title, subtitle);

  const cards = target.createElement("div");
  cards.className = "cards";

  const discordCard = target.createElement("article");
  discordCard.className = "card";
  const discordTitle = target.createElement("h2");
  discordTitle.textContent = "Discord";
  const discordBadge = target.createElement("span");
  discordBadge.className = "pill";
  discordBadge.textContent = "serviço conectado";
  discordTitle.append(discordBadge);

  const mentionValue = target.createElement("strong");
  mentionValue.className = "metric";
  const mentionCaption = target.createElement("p");
  mentionCaption.className = "caption";

  const openDiscord = target.createElement("button");
  openDiscord.type = "button";
  openDiscord.className = "primary";
  openDiscord.textContent = "Abrir Discord";
  openDiscord.addEventListener("click", () => options.onOpenDiscord());

  discordCard.append(discordTitle, mentionValue, mentionCaption, openDiscord);

  const selfCard = target.createElement("article");
  selfCard.className = "card";
  const selfTitle = target.createElement("h2");
  selfTitle.textContent = "Este PulseCord";
  const selfList = target.createElement("dl");
  selfList.className = "facts";

  for (const [term, value] of describeSelf(options)) {
    const dt = target.createElement("dt");
    dt.textContent = term;
    const dd = target.createElement("dd");
    dd.textContent = value;
    selfList.append(dt, dd);
  }

  selfCard.append(selfTitle, selfList);
  cards.append(discordCard, selfCard);
  screen.append(heading, cards);
  host.append(screen);

  const update = (snapshot: ActivitySnapshot): void => {
    if (snapshot.mentions === null) {
      mentionValue.textContent = "—";
      mentionValue.classList.add("muted");
      mentionCaption.textContent =
        "Não foi possível ler as menções do Discord. O PulseCord não usa a API nem as credenciais do Discord: ele apenas lê o que a própria página informa, e isso pode mudar sem aviso.";
      return;
    }

    mentionValue.textContent = String(snapshot.mentions);
    mentionValue.classList.remove("muted");
    mentionCaption.textContent =
      snapshot.mentions === 1 ? "menção não lida, segundo o Discord." : "menções não lidas, segundo o Discord.";
  };

  return { update };
}

function describeSelf(options: ActivityViewOptions): Array<[string, string]> {
  const { environment, settings } = options;
  const facts: Array<[string, string]> = [];

  facts.push(["Versão", environment?.appVersion ?? "desconhecida"]);
  facts.push(["Modo", environment?.safeMode ? "Seguro (recursos opcionais desligados)" : "Normal"]);

  if (settings) {
    const shortcutCount = settings.shortcuts.bindings.length;
    facts.push(["Atalhos", shortcutCount === 1 ? "1 configurado" : `${shortcutCount} configurados`]);
    const active = settings.theme.themes.find((theme) => theme.id === settings.theme.activeThemeId);
    facts.push(["Tema aplicado", active ? active.name : "Nenhum"]);

    const enabledPlugins = Object.values(settings.plugins).filter(Boolean).length;
    facts.push(["Plugins ativos", String(enabledPlugins)]);
  }

  return facts;
}
