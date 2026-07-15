# PulseCore plugin API

The current API is private to first-party, compiled plugins. This document defines the boundary that future external plugins will build on without granting them unrestricted page or Node.js access.

```ts
interface PluginDefinition {
  id: BuiltinPluginId;
  name: string;
  description: string;
  version: string;
  capabilities: readonly ("dom" | "keyboard" | "styles")[];
  start(context: PluginContext): void | Promise<void>;
}
```

`PluginContext` provides lifecycle-scoped helpers:

- `addStyle(css)` injects a plugin-owned style element.
- `addBodyClass(name)` adds a class to the document root.
- `addEventListener(...)` registers a document listener.
- `observe(...)` starts a mutation observer.

PulseCore releases all registered resources in reverse order when the plugin stops. A plugin must not attach unmanaged resources outside this context.

## Planned external manifest

The external format will separate declarative metadata from signed code and will require explicit user approval per capability. Planned fields include ID, version, compatible PulseCore range, integrity digest, entry point, capabilities, and update source.

Remote plugin execution remains disabled until the following are complete:

1. Manifest and schema validation.
2. Capability prompts and revocation.
3. Package integrity and signature verification.
4. Per-plugin startup deadlines and health records.
5. Recovery UI for a plugin that crashes during activation.
