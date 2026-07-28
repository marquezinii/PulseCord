import { desktopCapturer, dialog, shell, type BrowserWindow, type Session } from "electron";

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

export function configureSession(session: Session, getMainWindow: () => BrowserWindow | undefined): void {
  session.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return ALLOWED_PERMISSIONS.has(permission) && isTrustedDiscordUrl(requestingOrigin);
  });

  session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    callback(ALLOWED_PERMISSIONS.has(permission) && isTrustedDiscordUrl(details.requestingUrl));
  });

  configureDisplayMedia(session, getMainWindow);
}

function configureDisplayMedia(session: Session, getMainWindow: () => BrowserWindow | undefined): void {
  let isSelectionOpen = false;

  session.setDisplayMediaRequestHandler((request, callback) => {
    if (!request.videoRequested || !request.userGesture || !isTrustedDiscordUrl(request.securityOrigin)) {
      callback({});
      return;
    }

    if (isSelectionOpen) {
      callback({});
      return;
    }

    isSelectionOpen = true;
    void chooseDisplaySource(getMainWindow)
      .then((source) => {
        if (!source) {
          callback({});
          return;
        }

        callback({
          video: source,
          ...(request.audioRequested && process.platform === "win32" ? { audio: "loopback" as const } : {})
        });
      })
      .catch((error: unknown) => {
        console.error("[PulseCord] Could not enumerate display-capture sources.", error);
        callback({});
      })
      .finally(() => {
        isSelectionOpen = false;
      });
  }, { useSystemPicker: process.platform === "darwin" });
}

async function chooseDisplaySource(
  getMainWindow: () => BrowserWindow | undefined
): Promise<Electron.DesktopCapturerSource | undefined> {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 0, height: 0 }
  });
  if (sources.length === 0) return undefined;

  const cancelId = sources.length;
  const options = {
    type: "question" as const,
    title: "Compartilhar tela — PulseCord",
    message: "Escolha a tela que deseja transmitir",
    detail: "O Discord receberá somente a tela escolhida. Você poderá interromper a transmissão pelo próprio Discord.",
    buttons: [...sources.map((source, index) => source.name || `Tela ${index + 1}`), "Cancelar"],
    defaultId: 0,
    cancelId,
    noLink: true
  };
  const window = getMainWindow();
  const result = window && !window.isDestroyed()
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);

  return result.response === cancelId ? undefined : sources[result.response];
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
