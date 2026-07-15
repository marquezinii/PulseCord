# Contributing to PulseCord

PulseCord is built as a clean-room project. Contributions must be authored for this repository and must not paste or mechanically translate source from another client modification.

Before opening a change:

1. Run `npm ci`.
2. Run `npm run check`.
3. Run `npm run build`.
4. Describe any new plugin capability and its cleanup behavior.

Every plugin must stop cleanly: styles, observers, timers, DOM nodes, and listeners created by a plugin must be released when it is disabled. New privileged capabilities require a security review before they are exposed to third-party plugins.
