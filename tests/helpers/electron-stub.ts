/**
 * Stands in for the "electron" module when bundling tests. The real package
 * only resolves to a usable API inside an actual Electron runtime; under
 * plain Node (where these tests run) it just exposes the path to the
 * Electron binary, which is useless here and can even throw if the
 * postinstall step that writes that path never ran. Nothing under test
 * calls these at import time — they only appear as unused value bindings in
 * modules like src/main/security.ts, so empty stand-ins are enough.
 */
export class BrowserWindow {}
export const desktopCapturer = {};
export const ipcMain = { on: () => undefined, removeListener: () => undefined };
export const shell = { openExternal: async () => undefined };
