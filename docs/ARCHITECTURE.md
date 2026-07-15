# Architecture

PulseCord 0.2 is deliberately small. The system is split across Electron's trust boundaries instead of sharing a broad global API.

## Main process

The main process owns the window, local settings, recovery records, permissions, navigation, and operating-system actions. It exposes six narrow IPC operations. Every request validates the sender URL and every mutable argument.

The main window loads only the official Discord web application. External navigation is opened in the system browser. Webviews are blocked, Node integration is disabled, context isolation is enabled, and the renderer is sandboxed.

## Preload bridge

The preload bundle runs in Electron's isolated world. It exposes only the PulseCord brand and a read-only environment query to the page's main JavaScript world. PulseCore itself stays inside the isolated world and talks to the main process through a private bridge.

This prevents page scripts from gaining direct settings, filesystem, relaunch, or shell capabilities.

## PulseCore

PulseCore is the first-party plugin lifecycle. A plugin declares an ID, version, description, and capabilities before receiving a restricted context. The context currently supports scoped styles, root classes, document events, and mutation observers.

Every resource registered through the context receives a cleanup function. Disabling a plugin reverses its cleanup stack, so experiments do not leave stale styles or observers behind.

The first milestone compiles plugins into the preload bundle. Loading arbitrary local or remote JavaScript is intentionally unsupported until manifest validation, permissions, signatures, and crash isolation are implemented.

## PulsePanel

PulsePanel is mounted in a closed Shadow DOM root. It is independent of the page's component tree and private module loader. Discord interface changes can still affect individual CSS plugins, but they do not remove the PulseCord settings panel or corrupt the core runtime.

## Persistence and recovery

Settings are sanitized against a versioned schema and written atomically inside Electron's user-data directory. Two renderer failures within two minutes trigger a relaunch in safe mode. After one stable minute, the crash counter resets.
