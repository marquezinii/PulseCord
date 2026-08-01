# Architecture

PulseCord is deliberately small. The system is split across Electron's trust boundaries instead of sharing a broad global API.

## Shell architecture

PulseCord's window is its own environment, not a full-window loader for `discord.com`. The `BrowserWindow` renders PulseCord's own chrome — today, a navigation rail (`static/shell.html` + `src/shell/`) — and Discord is embedded as a sibling render surface via Electron's `WebContentsView` (`src/main/service-view.ts`), filling the content area to the right of the rail. `src/shared/shell-layout.ts` is the single source of truth for the rail's width, used by both the main process (to size the view) and the shell's own CSS (to size the rail), so they cannot drift apart.

This is additive, not a reimplementation: the embedded view still loads the real `https://discord.com/app`, with the same preload, session, permission handling, and desktop-identity spoofing it had when it was the whole window. PulseCord draws chrome around Discord; it does not draw Discord. The navigation rail currently declares five future destinations (Central de Atividade, Organização, Automações, Temas, Configurações) as explicitly disabled placeholders — `SHELL_DESTINATIONS` in `src/shell/navigation.ts` — so the shape of the product is visible without claiming a screen exists before it does. Each becomes real in its own later milestone.

The shell's own page (`shell.html`) is a static, non-interactive local page today: no preload bridge, no IPC, nothing for `isTrustedIpcSender` to need to trust from it yet. `src/main/security.ts` still names it explicitly (`LOCAL_PAGE_FILENAMES`) alongside `offline.html`, both resolved to exact `file://` URLs at startup, because the moment the rail needs to call into the main process, that trust boundary already exists rather than needing to be retrofitted under pressure.

## Main process

The main process owns the window, the embedded service view, local settings, recovery records, permissions, navigation, display-media selection, and operating-system actions. It exposes a versioned allowlist of narrow IPC operations plus a one-way shortcut event. Every request validates the sender URL and every mutable argument.

The embedded Discord view may only navigate to a trusted Discord origin (`hardenServiceContents`); the shell's own chrome may not navigate anywhere at all (`hardenShellContents`) — a stray link or injected redirect there is cancelled and handed to the system browser instead. Both block window-open (popups either load in place, if trusted, or open externally) and both block attaching `<webview>` tags. External navigation always goes to the system browser. Node integration is disabled, context isolation is enabled, and both render surfaces are sandboxed.

Because the shell window and the embedded Discord view are two independent render surfaces, each can crash independently; both route through the same recovery path (`onRendererCrash` → `RecoveryStore`), since either one going down leaves the user without a usable window.

Global shortcuts raise and focus the shell window, but deliver key events to the embedded Discord view's `WebContents` specifically (`ShortcutManager` takes a `getServiceContents` accessor) — that is where Discord and PulseCore actually live, not in the shell's static chrome.

Desktop identity belongs to PulseCord itself. The Discord page receives a Chromium-compatible User-Agent with an explicit `PulseCord/<version>` product token, so camera and display capture follow the standards-based WebRTC path implemented by Electron. The API and Gateway metadata independently classify the session as `Discord Client`, preserving desktop presence without advertising Discord's proprietary `DiscordNative` bridge. PulseCord neither exposes nor imitates another desktop client's private native bridge.

Display sharing is implemented through Electron's supported display-media request handler. Only a user-initiated request from a trusted Discord origin can open the PulseCord-owned picker. It enumerates screens and application windows through `desktopCapturer`, refreshes local thumbnails while the picker is open, presents them in separate tabs, and grants only the source explicitly selected by the user. Windows system audio is supplied only when Discord requested it. Electron's public handler selects a source but does not expose control over Discord's active WebRTC quality or FPS; those remain owned by Discord after the stream starts. Received Discord streams remain ordinary Chromium/WebRTC media inside the trusted page; PulseCord does not proxy, inspect, or persist their media.

PulseCord also owns its desktop shortcut engine. Electron registers only accelerators explicitly chosen by the user, `SettingsStore` persists them in the versioned local settings schema, and a narrow IPC channel dispatches only allowlisted first-party actions. Discord's private keybind implementation is not loaded or imitated.

Schema version 4 stores shortcut bindings by ID, the local CSS theme, the Home-icon preference, and a per-plugin JSON data bucket (`pluginData`) used by PulseCore's `settings` capability. Shortcut combinations and actions are unique, the store accepts at most 64 bindings, and each plugin's data bucket is capped at 64&nbsp;KB.

## Preload bridge

The preload bundle runs in Electron's isolated world. It exposes only the PulseCord brand and a read-only environment query to the page's main JavaScript world. PulseCore itself stays inside the isolated world and talks to the main process through a private bridge.

This prevents page scripts from gaining direct settings, filesystem, relaunch, or shell capabilities.

## PulseCore

PulseCore is the first-party plugin engine, implemented under `src/renderer/pulsecore/`. It is an original design: it does not patch Discord's private webpack modules the way other Discord client mods do, and it does not reuse code, structure, or naming from any of them. Everything it touches is public DOM, CSS, and browser event surface, consistent with the clean-room policy.

A plugin (`PluginDefinition`) declares an ID, version, description, and the capabilities it needs (`dom`, `events`, `settings`, `commands`). `PluginRuntime` grants access to a `PluginContext` built specifically for that plugin: a facet is only present on the context object when the plugin declared the matching capability, so an undeclared capability is unreachable both at the type level and at runtime, not just by convention.

- **`lifecycle`** (always available): `setInterval`/`setTimeout`/`onDispose`/`cleanup.add` register resources that are automatically unwound, in reverse order, when the plugin stops.
- **`dom`**: `addBodyClass`, `addStyle`, `addEventListener`, `observe`, and `patch(selector, apply)` — the last one applies a function to every element matching a selector, present or future, and calls the function it returns to undo the change when that element leaves the document. This removes the need for plugins to hand-roll `MutationObserver` bookkeeping to survive Discord's own DOM churn.
- **`events`**: `on`/`emit` over a shared `EventBus`, used both for plugin-to-plugin messaging and for core lifecycle notifications (`plugin:state-changed`, `plugin:crashed`).
- **`settings`**: `get`/`set`/`all`, a per-plugin JSON storage bucket persisted by the main process (`AppSettings.pluginData`), isolated from the global schema and from the Discord page's own storage.
- **`commands`**: `register(id, label, handler)` names a plugin action in a shared `CommandRegistry`, without wiring it to any specific input source. This is the seam future integrations (a command palette, a shortcut target) attach to, without the plugin or the engine needing to change.

Every callback a plugin hands to any facet — a listener, an observer callback, a timer, a command handler, a `patch` function — is wrapped so a thrown error is caught and routed to the runtime instead of propagating into PulseCord or the Discord page. A runtime error automatically stops only that plugin (`PluginState` transitions to `"error"`), running its full cleanup stack and emitting `plugin:crashed`; every other plugin and the shell keep running.

Plugins still compile into the bundle rather than loading arbitrary local or remote JavaScript; a signed/permissioned model for out-of-bundle plugins remains future work (see Roadmap). PulseCord 0.2 deliberately registers no built-in plugins yet — the engine is intentionally exercised by nothing until the first real plugin is implemented and reviewed.

## PulsePanel and settings integration

PulsePanel is mounted in a closed Shadow DOM root, inside the embedded Discord view (not the shell's own chrome) — it is independent of the page's component tree and private module loader, and its floating launcher/panel is now visually contained to the Discord view's bounds rather than the whole window. Moving PulsePanel's controls into the shell's own navigation rail is future work, not part of this milestone. PulsePanel is the quick control surface, while detailed configuration lives in a dedicated PulseCord category inside Discord's visible settings shell.

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

## Testing

`tests/` mirrors `src/`'s layout and runs on Node's built-in test runner (`node --test`), not a third-party test framework. `scripts/test.mjs` bundles every `tests/**/*.test.ts` file with esbuild (the same tool `scripts/build.mjs` uses) and hands the result to `node --test`, so no Electron runtime is needed to run the suite. `npm run check` runs it automatically, between the typecheck and the clean-room verification.

What is covered, and how:

- **`shared/contracts.ts`** — every validator and `sanitizeSettings`, run directly as pure functions.
- **`main/security.ts`, `main/desktop-identity.ts`** — the pure/exported functions, plus `configureDesktopIdentity` exercised against a hand-written fake `Session` object (no real Electron `Session` is constructible outside a running app).
- **`main/settings-store.ts`** — fully exercised against a real temporary directory on disk (it only depends on `node:fs/promises`, not Electron), including the corrupt-file quarantine and its rotation.
- **`renderer/pulsecore/`** — `EventBus` and `CommandRegistry` as pure logic; `PluginRuntime` and `buildPluginContext` against a `jsdom` document (installed as ambient globals for the duration of a test) and an in-memory `FakeBridge` standing in for the preload bridge. These tests are what hold the engine's core promises to account: capability gating, resource cleanup ordering, and that a runtime crash in one plugin cannot affect another.
- **`shared/shell-layout.ts`** — `computeServiceViewBounds` as a pure function, including the edge cases that matter for a real window (narrower than the rail, zero-sized while minimizing, fractional sizes).
- **`shell/navigation.ts`** — `mountShellNavigation` against a `jsdom` document: every declared destination renders, unbuilt ones are genuinely disabled (not just styled to look that way), and the safe-mode badge only appears when the runtime environment says so.

What is intentionally not unit-tested: `main/index.ts` (wires everything together and calls `app.whenReady()` at module load — only safe to run inside a real Electron process) and the Electron-native pieces of `main/startup.ts` and `main/security.ts` (`chooseDisplaySource`'s `BrowserWindow`/`desktopCapturer` calls, `app.setLoginItemSettings`). These stay covered by the manual packaged-app smoke check described in the validation rules, not by `tests/`.

`tests/helpers/electron-stub.ts` replaces the real `electron` package at test-bundle time (aliased in `scripts/test.mjs`) — the real package only resolves to a usable API inside an actual Electron process, and under plain Node returns just a path string, which is useless to import and can even throw if its postinstall step didn't run.
