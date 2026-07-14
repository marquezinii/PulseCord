# PulseCord architecture

## Runtime boundary

PulseCord has three trust zones:

1. **Desktop main process** — owns windows, local settings, media permissions, the tray, and OS integration.
2. **Sandboxed Discord renderer** — loads only `discord.com`, `canary.discord.com`, or `ptb.discord.com`; Node.js is disabled and context isolation is enabled.
3. **Plugin engine** — currently the pinned Equicord ASAR. It supplies Vencord-compatible plugins, settings, QuickCSS, and themes.

IPC calls validate the sending origin. Non-Discord web origins cannot call privileged PulseCord handlers. External links open in the system browser unless the user explicitly chooses otherwise.

## Reliability model

Safe Mode skips both the plugin engine and PulseCord renderer patches. A renderer crash triggers one reload; a second crash within two minutes restarts the app in Safe Mode. This makes recovery independent of the plugin system that may have failed.

Application updates are disabled in preview. The plugin engine is pinned by SHA-256 and downloaded to a temporary file before it replaces the active copy.

## Data locations

PulseCord uses Electron's per-application user-data directory. Discord cookies and sessions stay in the isolated `sessionData` directory. Plugins, themes, QuickCSS, and PulseCord preferences are stored separately from the official Discord installation.

The desktop app does not inject into or modify an installed Discord client.

## Planned plugin model

The target design separates plugins into capability tiers:

- **Core:** reviewed, bundled, minimal privileges, independently recoverable.
- **Curated:** signed metadata, declared permissions, compatibility and performance budgets.
- **Developer:** local-only, visibly marked, disabled after repeated crashes.

The current Equicord engine is a transition layer. The long-term goal is a PulseCord-owned catalog, compatibility tests, startup profiling, and per-plugin health records without collecting user telemetry.
