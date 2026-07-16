# Clean-room policy

PulseCord is implemented from its own requirements and source tree. This is a permanent architectural boundary, not a temporary milestone.

## Default rule

- Do not import, copy, bundle, download, execute, or adapt source code, runtime modules, plugins, themes, patches, build artifacts, or branding from another modified Discord client.
- Do not add another client as a package, Git dependency, submodule, build input, runtime fallback, or compatibility layer.
- Similar features must be designed and implemented inside PulseCore from the behavior we want, using our own interfaces and tests.
- Integration code may use operating-system APIs, Electron APIs, web standards, and the Discord service loaded by the shell. It must fail safely when the service changes.

An exception is allowed only when the project owner explicitly authorizes that specific external component or source. The exception must be documented with its license, exact scope, pinned provenance, update boundary, and removal plan before it enters the runtime.

## Enforcement

`npm run verify:independence` scans the runtime source and dependency manifests for known client boundaries and rejects production package dependencies. Code review remains mandatory because no automated list can identify every possible client or copied implementation.
