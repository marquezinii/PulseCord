import type { Session } from "electron";

const DISCORD_API_FILTER = {
  urls: ["https://discord.com/api/*", "https://canary.discord.com/api/*", "https://ptb.discord.com/api/*"]
};
const DESKTOP_BROWSER_CLASS = "Discord Client";

export function configureDesktopIdentity(session: Session): void {
  session.webRequest.onBeforeSendHeaders(DISCORD_API_FILTER, (details, callback) => {
    const headers = { ...details.requestHeaders };
    const headerName = Object.keys(headers).find((name) => name.toLowerCase() === "x-super-properties");
    if (!headerName) {
      callback({ requestHeaders: headers });
      return;
    }

    const currentValue = headers[headerName];
    if (typeof currentValue === "string") headers[headerName] = rewriteSuperProperties(currentValue);
    callback({ requestHeaders: headers });
  });
}

function rewriteSuperProperties(value: string): string {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64").toString("utf8")) as Record<string, unknown>;
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return value;

    decoded.browser = DESKTOP_BROWSER_CLASS;
    return Buffer.from(JSON.stringify(decoded), "utf8").toString("base64");
  } catch {
    return value;
  }
}
