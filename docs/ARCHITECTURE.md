# Architecture

PulseCord 0.2 is deliberately small. The system is split across Electron's trust boundaries instead of sharing a broad global API.

## Main process

The main process owns the window, local settings, recovery records, permissions, navigation, display-media selection, and operating-system actions. It exposes a versioned allowlist of narrow IPC operations plus a one-way shortcut event. Every request validates the sender URL and every mutable argument.

The main window loads only the official Discord web application. External navigation is opened in the system browser. Webviews are blocked, Node integration is disabled, context isolation is enabled, and the renderer is sandboxed.

Desktop identity belongs to PulseCord itself. The Discord page receives a Chromium-compatible User-Agent with an explicit `PulseCord/<version>` product token, so camera and display capture follow the standards-based WebRTC path implemented by Electron. The API and Gateway metadata independently classify the session as `Discord Client`, preserving desktop presence without advertising Discord's proprietary `DiscordNative` bridge. PulseCord neither exposes nor imitates another desktop client's private native bridge.

Display sharing is implemented through Electron's supported display-media request handler. Only a user-initiated request from a trusted Discord origin can open the PulseCord-owned native display picker. The handler enumerates screens, grants only the screen explicitly selected by the user, and supplies Windows system audio only when Discord requested it. Received Discord streams remain ordinary Chromium/WebRTC media inside the trusted page; PulseCord does not proxy, inspect, or persist their media.

PulseCord also owns its desktop shortcut engine. Electron registers only accelerators explicitly chosen by the user, `SettingsStore` persists them in the versioned local settings schema, and a narrow IPC channel dispatches only allowlisted first-party actions. Discord's private keybind implementation is not loaded or imitated.

Schema version 3 stores shortcut bindings by ID, the local CSS theme, and the Home-icon preference. Shortcut combinations and actions are unique, and the store accepts at most 64 bindings.

## Preload bridge

The preload bundle runs in Electron's isolated world. It exposes only the PulseCord brand and a read-only environment query to the page's main JavaScript world. PulseCore itself stays inside the isolated world and talks to the main process through a private bridge.

This prevents page scripts from gaining direct settings, filesystem, relaunch, or shell capabilities.

## PulseCore

PulseCore is the first-party plugin lifecycle. A plugin declares an ID, version, description, and capabilities before receiving a restricted context. The context currently supports scoped styles, root classes, document events, and mutation observers.

Every resource registered through the context receives a cleanup function. Disabling a plugin reverses its cleanup stack, so experiments do not leave stale styles or observers behind.

The first milestone compiles plugins into the preload bundle. Loading arbitrary local or remote JavaScript is intentionally unsupported until manifest validation, permissions, signatures, and crash isolation are implemented. PulseCord 0.2 deliberately registers no built-in plugins.

## PulsePanel and settings integration

PulsePanel is mounted in a closed Shadow DOM root. It is independent of the page's component tree and private module loader. PulsePanel is the quick control surface, while detailed configuration lives in a dedicated PulseCord category inside Discord's visible settings shell.

The category contains Plugins, Themes, and PulseCord Shortcuts. When a native System shortcut page is available, the PulseCord entry routes to that already-rendered page and hides the duplicate System navigation item. This preserves Discord's unchanged standard-shortcut list and keycaps while mounting original PulseCord editor markup and behavior above it. No private Discord module or modified-client code is imported.

A compatibility observer remounts the category when Discord recreates the settings modal, and PulsePanel remains available if that optional integration needs adapting.

## Custom themes

The Themes page provides an original CSS editor with local preview and explicit persistence. Saved CSS is applied through one PulseCord-owned `<style>` element and is removed when disabled. Safe mode never applies the custom theme. The main-process contract rejects oversized CSS, imports, and remote resource URLs before writing settings.

## Branding and appearance

The project-supplied artwork is the PulseCord desktop and in-app identity. A reversible overlay replaces only the visual content of Discord's Home button and preserves the original interactive element. The Appearance integration offers `PulseCord` and `Follow Discord`; Discord's existing Nitro icon grid remains untouched and continues to be managed by Discord.

## Development launcher

The Windows desktop shortcut targets the unpacked `pulsecord.exe` directly. Development packaging is an explicit maintenance action (`npm run package:dir`), rather than work performed while the user waits to open the app. This avoids console-host windows, fragile process-name detection, and a second launcher process; the visible application is the native PulseCord executable itself.

## Persistence and recovery

Settings are sanitized against a versioned schema, serialized through a transaction queue, and written atomically inside Electron's user-data directory. Two renderer failures within two minutes trigger a relaunch in safe mode. After one stable minute, the crash counter resets.
