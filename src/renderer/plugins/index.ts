import type { PluginDefinition } from "../plugin-runtime";

const pulseTheme: PluginDefinition = {
  id: "pulse-theme",
  name: "Pulse Theme",
  description: "Contraste mais limpo, superfícies profundas e acentos PulseCord discretos.",
  version: "0.1.0",
  capabilities: ["styles"],
  start(context) {
    context.addBodyClass("pc-pulse-theme");
    context.addStyle(`
      .pc-pulse-theme {
        --pc-accent: #d43f55;
        --pc-accent-soft: #e36a7b;
        --pc-surface: #161820;
        --pc-surface-raised: #20232d;
        --brand-500: var(--pc-accent) !important;
        --brand-560: #b93449 !important;
        --brand-experiment: var(--pc-accent) !important;
        --brand-experiment-560: #b93449 !important;
      }

      .pc-pulse-theme [class*="appMount_"],
      .pc-pulse-theme [class*="app_"],
      .pc-pulse-theme [class*="bg_"] {
        background-color: var(--pc-surface) !important;
      }

      .pc-pulse-theme [class*="sidebar_"],
      .pc-pulse-theme [class*="chat_"],
      .pc-pulse-theme [class*="container_"] {
        border-color: color-mix(in srgb, var(--pc-accent) 14%, transparent);
      }

      .pc-pulse-theme :focus-visible {
        outline: 2px solid var(--pc-accent-soft) !important;
        outline-offset: 2px;
      }
    `);
  }
};

const focusMode: PluginDefinition = {
  id: "focus-mode",
  name: "Modo Foco",
  description: "Esconde servidores e canais para manter apenas a conversa atual.",
  version: "0.1.0",
  capabilities: ["dom", "styles"],
  start(context) {
    context.addBodyClass("pc-focus-mode");
    context.addStyle(`
      .pc-focus-mode [class*="guilds_"],
      .pc-focus-mode [class*="sidebarList_"] {
        display: none !important;
      }

      .pc-focus-mode [class*="base_"] {
        grid-template-columns: minmax(0, 1fr) !important;
      }
    `);
  }
};

const compactLayout: PluginDefinition = {
  id: "compact-layout",
  name: "Layout Compacto",
  description: "Reduz espaços repetitivos sem diminuir a legibilidade das mensagens.",
  version: "0.1.0",
  capabilities: ["styles"],
  start(context) {
    context.addBodyClass("pc-compact-layout");
    context.addStyle(`
      .pc-compact-layout [class*="messageListItem_"] [class*="message_"],
      .pc-compact-layout [class*="cozyMessage_"] {
        padding-top: 0.18rem !important;
        padding-bottom: 0.18rem !important;
      }

      .pc-compact-layout [class*="membersGroup_"] {
        padding-top: 12px !important;
        height: 32px !important;
      }

      .pc-compact-layout [class*="channel_"],
      .pc-compact-layout [class*="link_"] {
        min-height: 30px !important;
      }
    `);
  }
};

const reducedMotion: PluginDefinition = {
  id: "reduced-motion",
  name: "Movimento Reduzido",
  description: "Desativa animações decorativas e rolagem suave dentro do cliente.",
  version: "0.1.0",
  capabilities: ["styles"],
  start(context) {
    context.addStyle(`
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: 0.001ms !important;
      }
    `);
  }
};

export const BUILTIN_PLUGINS = [pulseTheme, focusMode, compactLayout, reducedMotion] as const;
