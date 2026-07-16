# PulseCord

PulseCord is an independent, open-source desktop shell for Discord with its own plugin runtime, theme layer, settings storage, recovery mode, and user interface.

This repository is a clean-room implementation. The current runtime does not import, bundle, download, or execute the codebase of another Discord client modification. Its only application dependency at runtime is Electron; the Discord experience itself is loaded from `https://discord.com/app`.

The permanent clean-room boundary and its exception process are defined in [`docs/CLEAN_ROOM_POLICY.md`](docs/CLEAN_ROOM_POLICY.md).

> PulseCord is an unofficial community project. It is not created, sponsored, or endorsed by Discord Inc. Discord and its brand assets belong to Discord Inc.

## Current milestone

- Secure Electron shell with context isolation and sandboxing.
- Login directly on the official Discord web origin. PulseCord never asks for or stores a Discord password.
- PulseCore, our capability-based lifecycle for first-party plugins.
- Four original built-in plugins: Pulse Theme, Focus Mode, Compact Layout, and Reduced Motion.
- PulsePanel, a Shadow DOM control center that does not depend on Discord's private module system.
- Atomic local settings, safe mode, renderer crash recovery, and an offline screen.
- A development shortcut that rebuilds the latest workspace before every launch.

External plugin loading and public installers are intentionally disabled. This repository publishes source code only while the security model and plugin format are being established.

## Development on Windows

Requirements: Node.js 24+ and npm 11+.

```powershell
npm ci
npm run check
npm run build
npm start
```

Create or refresh the desktop shortcut:

```powershell
npm run shortcut:windows
```

The shortcut points to `scripts/dev-launch.ps1`, not to a frozen executable. Every launch therefore builds and opens the current checkout.

## Project map

- `src/main` — application lifecycle, secure window, IPC, persistence, and recovery.
- `src/preload` — the narrow bridge between Electron and PulseCore.
- `src/renderer` — PulseCore, built-in plugins, and PulsePanel.
- `src/shared` — versioned contracts shared by the processes.
- `docs` — architecture, plugin API, security model, and roadmap.

## Useful commands

- `npm run check` — type-checks and verifies clean-room boundaries.
- `npm run build` — creates local application bundles in `dist/`.
- `npm start` — builds and opens the development client.
- `npm run package:dir` — creates an unpacked local build; it does not publish a release.
- `npm run safe-mode` — opens PulseCord with all optional plugins disabled.

## License

PulseCord source code is licensed under GPL-3.0-or-later. The unmodified Discord symbol used only for service attribution is excluded from that license and remains property of Discord Inc.; see `BRAND_ASSETS.md`.
