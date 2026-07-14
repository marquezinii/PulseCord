# Contributing to PulseCord

PulseCord is early. Start with a focused issue before building a large feature so architecture and safety expectations are clear.

## Local workflow

```sh
npm ci --ignore-scripts --legacy-peer-deps
node node_modules/electron/install.js
bun run compileArrpc
bun run check
bun run dev
```

Keep pull requests small, explain user impact, and include a manual test note for UI or Discord-compatibility changes.

Plugins must not automate user accounts, bypass access controls, expose hidden content, collect tokens, add undisclosed telemetry, or weaken Electron isolation. Sensitive capabilities must be declared and opt-in.

All contributions are licensed under GPL-3.0-or-later and must preserve applicable upstream notices.
