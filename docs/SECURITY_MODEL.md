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
- One consistent PulseCord-owned desktop-compatible User-Agent for the trusted
  Discord session, while preserving the explicit `PulseCord/<version>` token.
- Display-capture requests require a user gesture from a trusted Discord origin and
  an explicit screen selection in the native PulseCord picker.
- System-browser handoff for external links.
- Webview blocking.
- Sandboxed renderer with context isolation and no Node integration.
- Minimal, sender-validated IPC.
- Settings schema sanitization, serialized mutations, and atomic writes.
- Shortcut actions are allowlisted, validated, deduplicated, and capped at 64 bindings.
- Custom CSS is capped at 128 KiB and rejects `@import`, HTTP(S), protocol-relative URLs, and other remote resources. Only `data:`, `blob:`, and local fragments are accepted in `url()`.
- Safe mode never applies the custom CSS theme.
- The Home-icon preference is restricted to the `pulsecord | discord` enum.
- No remote plugin download, updater, token access, or telemetry.
- Safe mode after repeated renderer failures.

## Known limitations

PulseCord renders a service that changes independently. Integration selectors can stop matching and must fail harmlessly. User-authored local CSS can still hide or imitate interface elements even though it cannot fetch remote resources; safe mode is the recovery path. Screen sharing depends on Electron, the operating system, Discord service availability, and any platform-level capture restrictions; the current picker supports screens and Windows loopback audio, while app/window-specific sharing is a future improvement. The current plugin system is not a security boundary for third-party code, which is why third-party loading is disabled.
