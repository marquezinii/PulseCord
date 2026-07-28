import { contextBridge, type ExecutionScript } from "electron";

const GATEWAY_BROWSER_CLASS = "Discord Client";

export function installDesktopGatewayIdentity(userAgent: string): void {
  contextBridgeExecute({
    func: (browserClass: string, desktopUserAgent: string) => {
      const marker = Symbol.for("pulsecord.desktop-identity");
      const prototype = WebSocket.prototype as WebSocket & Record<PropertyKey, unknown>;
      if (prototype[marker] === true) return;

      const originalSend = WebSocket.prototype.send;
      Object.defineProperty(prototype, marker, { value: true });
      Object.defineProperty(prototype, "send", {
        configurable: true,
        writable: true,
        value(this: WebSocket, data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
          let outgoing = data;

          try {
            const gateway = new URL(this.url);
            if (gateway.protocol === "wss:" && gateway.hostname === "gateway.discord.gg" && typeof data === "string") {
              const payload = JSON.parse(data) as {
                op?: unknown;
                d?: { properties?: Record<string, unknown> };
              };

              if (payload.op === 2 && payload.d?.properties) {
                payload.d.properties.browser = browserClass;
                payload.d.properties.browser_user_agent = desktopUserAgent;
                outgoing = JSON.stringify(payload);
              }
            }
          } catch {
            // Malformed or non-Gateway frames must pass through untouched.
          }

          Reflect.apply(originalSend, this, [outgoing]);
        }
      });
    },
    args: [GATEWAY_BROWSER_CLASS, userAgent]
  });
}

function contextBridgeExecute(script: ExecutionScript): void {
  // Kept behind a tiny wrapper so the rest of the preload never receives page-world access.
  contextBridge.executeInMainWorld(script);
}
