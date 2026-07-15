# Security model

## Protected assets

- Discord session cookies and account state.
- Local PulseCord settings.
- Files outside the PulseCord data directory.
- Microphone, camera, notification, clipboard, and screen-capture permissions.

## Trust boundaries

The Discord web page is remote content and is not trusted with Node.js or raw Electron IPC. The preload bridge is trusted but sandboxed. The main process is privileged and validates every message.

First-party plugins are trusted source code reviewed in this repository, but PulseCore still scopes their resources so they can be disabled reliably. Future external plugins will be untrusted by default.

## Controls in 0.2

- HTTPS origin allowlist for top-level navigation and permission requests.
- System-browser handoff for external links.
- Webview blocking.
- Sandboxed renderer with context isolation and no Node integration.
- Minimal, sender-validated IPC.
- Settings schema sanitization and atomic writes.
- No remote plugin download, updater, token access, or telemetry.
- Safe mode after repeated renderer failures.

## Known limitations

PulseCord renders a service that changes independently. CSS selectors used by visual plugins may stop matching and must fail harmlessly. Screen sharing still depends on Electron and operating-system behavior and needs dedicated cross-platform work. The current plugin system is not a security boundary for third-party code, which is why third-party loading is disabled.
