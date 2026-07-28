import type { Session } from "electron";

const DISCORD_API_FILTER = {
  urls: ["https://discord.com/api/*", "https://canary.discord.com/api/*", "https://ptb.discord.com/api/*"]
};
const DESKTOP_BROWSER_CLASS = "Discord Client";

export function createDesktopUserAgent(appVersion: string): string {
  const chromeVersion = process.versions.chrome || "140.0.0.0";
  const electronVersion = process.versions.electron || "41.0.0";

  return [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "AppleWebKit/537.36 (KHTML, like Gecko)",
    `Discord/${appVersion}`,
    `Chrome/${chromeVersion}`,
    `Electron/${electronVersion}`,
    "Safari/537.36",
    `PulseCord/${appVersion}`
  ].join(" ");
}

export function configureDesktopIdentity(session: Session, userAgent: string): void {
  session.setUserAgent(userAgent);

  session.webRequest.onBeforeSendHeaders(DISCORD_API_FILTER, (details, callback) => {
    const headers = { ...details.requestHeaders };
    const headerName = Object.keys(headers).find((name) => name.toLowerCase() === "x-super-properties");
    if (!headerName) {
      callback({ requestHeaders: headers });
      return;
    }

    const currentValue = headers[headerName];
    if (typeof currentValue === "string") headers[headerName] = rewriteSuperProperties(currentValue, userAgent);
    callback({ requestHeaders: headers });
  });
}

function rewriteSuperProperties(value: string, userAgent: string): string {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64").toString("utf8")) as Record<string, unknown>;
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return value;

    decoded.browser = DESKTOP_BROWSER_CLASS;
    decoded.browser_user_agent = userAgent;
    return Buffer.from(JSON.stringify(decoded), "utf8").toString("base64");
  } catch {
    return value;
  }
}
