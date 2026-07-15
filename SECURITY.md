# Security policy

PulseCord is in an early development phase. Do not use the public issue tracker for vulnerabilities that could expose account data, tokens, local files, or remote-code-execution paths.

Report sensitive findings privately through GitHub's security advisory flow for this repository.

## Security promises of the current foundation

- Credentials are entered only on the official Discord web origin.
- Renderer pages do not receive Node.js access.
- Context isolation, sandboxing, web security, and navigation allowlisting are enabled.
- IPC validates the sender and every mutable argument.
- External plugins and remote code downloads are disabled.
- PulseCord contains no telemetry pipeline.

The threat model and trust boundaries are documented in `docs/SECURITY_MODEL.md`.
