import { shell, type BrowserWindow, type Session } from "electron";

const TRUSTED_HOSTS = new Set(["discord.com", "canary.discord.com", "ptb.discord.com"]);
const ALLOWED_PERMISSIONS = new Set<string>([
  "clipboard-sanitized-write",
  "display-capture",
  "fullscreen",
  "media",
  "notifications"
]);

export function isTrustedDiscordUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && TRUSTED_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isTrustedIpcSender(value: string): boolean {
  return isTrustedDiscordUrl(value) || value.startsWith("file://");
}

export function configureSession(session: Session): void {
  session.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return ALLOWED_PERMISSIONS.has(permission) && isTrustedDiscordUrl(requestingOrigin);
  });

  session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    callback(ALLOWED_PERMISSIONS.has(permission) && isTrustedDiscordUrl(details.requestingUrl));
  });
}

export function hardenWindow(window: BrowserWindow): void {
  const { webContents } = window;

  webContents.on("will-navigate", (event, url) => {
    if (isTrustedDiscordUrl(url)) return;
    event.preventDefault();
    void openExternalSafely(url);
  });

  webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedDiscordUrl(url)) {
      void window.loadURL(url);
    } else {
      void openExternalSafely(url);
    }
    return { action: "deny" };
  });

  webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
}

async function openExternalSafely(value: string): Promise<void> {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:") {
      await shell.openExternal(url.toString());
    }
  } catch {
    // Invalid URLs are ignored at the trust boundary.
  }
}
