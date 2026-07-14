# PulseCord

PulseCord is an open-source, privacy-minded Discord desktop client mod built for a long development horizon: a stable shell, a large plugin and theme ecosystem, and safety rails that let different kinds of users choose how much customization they want.

> [!IMPORTANT]
> PulseCord is currently a development preview. There are no public installers, signed binaries, releases, or automatic application updates yet. The repository is public so the architecture and progress can be reviewed openly.

## What exists today

- A standalone Electron client that loads Discord only from its official web origins.
- The Equicord engine, providing the Vencord-compatible ecosystem and 300+ built-in plugins.
- Custom CSS and BetterDiscord-compatible theme support.
- Sandboxed Discord rendering with Node.js integration disabled and context isolation enabled.
- A pinned, SHA-256-verified plugin-engine build rather than an unreviewed silent update.
- Safe Mode (`--safe-mode`) that starts without plugins, themes, or renderer patches.
- Automatic recovery into Safe Mode after repeated renderer crashes.
- Rich Presence as an explicit opt-in on first launch.
- Public application updates disabled until releases are signed and intentionally enabled.

## Current status

This first milestone establishes the desktop foundation and project guardrails. PulseCord still depends on the upstream Equicord plugin engine; progressively owning and curating that layer is part of the roadmap.

Public installation is intentionally not available. Because this is open source, developers can still build it from source.

## Development

Requirements: Git, Node.js 24 with npm 11, and Bun 1.3 or newer.

```sh
npm ci --ignore-scripts --legacy-peer-deps
node node_modules/electron/install.js
bun run compileArrpc
bun run dev
```

Useful checks:

```sh
bun run check
bun run build
bun run package:dir
```

The Windows desktop shortcut created during local setup points to `scripts/dev-launch.ps1`. It rebuilds before every launch, so it always runs the latest workspace changes.

## Safety and account notice

PulseCord never asks for a Discord token or password. Authentication happens on Discord's official login page inside the sandboxed client. Do not install plugins from sources you do not trust.

Discord client modifications are against Discord's Terms of Service. PulseCord is not affiliated with or endorsed by Discord Inc. Using any client mod can carry account risk; use a non-critical account while the project is in preview.

## Project principles

1. Secure defaults and explicit consent for sensitive features.
2. Recovery before customization: one broken plugin should not brick the client.
3. Curated capabilities instead of arbitrary plugin power by default.
4. Measured performance, accessible UI, and useful presets for different users.
5. Reproducible, reviewable updates with no hidden telemetry.
6. Upstream credit and GPL compliance.

See [Architecture](docs/ARCHITECTURE.md), [Roadmap](docs/ROADMAP.md), [Security Policy](SECURITY.md), and [Contributing](CONTRIBUTING.md).

## Credits and license

PulseCord is based on [Equibop](https://github.com/Equicord/Equibop), which is based on [Vesktop](https://github.com/Vencord/Vesktop), and currently uses the [Equicord](https://github.com/Equicord/Equicord) plugin engine, a fork of [Vencord](https://github.com/Vendicated/Vencord). See [third-party notices](THIRD_PARTY_NOTICES.md).

Licensed under the GNU General Public License v3.0 or later. See [LICENSE](LICENSE).
