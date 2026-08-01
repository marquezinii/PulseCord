import { BrowserWindow, desktopCapturer, ipcMain, shell, type Session } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { isTrustedDiscordUrl } from "../shared/contracts";

export { isTrustedDiscordUrl };

const ALLOWED_PERMISSIONS = new Set<string>(["clipboard-sanitized-write", "display-capture", "fullscreen", "media", "notifications"]);
const PICKER_READY = "pulsecord:display-picker:ready";
const PICKER_SOURCES = "pulsecord:display-picker:sources";
const PICKER_CHOOSE = "pulsecord:display-picker:choose";
const PICKER_CANCEL = "pulsecord:display-picker:cancel";
/**
 * The only local pages PulseCord itself ships and trusts as IPC senders. The
 * shell window's own chrome and the offline fallback are separate renderer
 * contexts, so both need to be named explicitly — anything else under file://
 * stays untrusted.
 */
export const LOCAL_PAGE_FILENAMES = ["shell.html", "offline.html"] as const;

export function localPageUrls(directory: string): ReadonlySet<string> {
  return new Set(LOCAL_PAGE_FILENAMES.map((name) => pathToFileURL(path.join(directory, name)).toString()));
}

const TRUSTED_LOCAL_PAGES = localPageUrls(__dirname);
const DISPLAY_SOURCES_TIMEOUT_MS = 8_000;

export function isTrustedIpcSender(value: string): boolean {
  if (isTrustedDiscordUrl(value)) return true;
  return TRUSTED_LOCAL_PAGES.has(value);
}

export function configureSession(session: Session, getMainWindow: () => BrowserWindow | undefined): void {
  session.setPermissionCheckHandler((_contents, permission, origin) => ALLOWED_PERMISSIONS.has(permission) && isTrustedDiscordUrl(origin));
  session.setPermissionRequestHandler((_contents, permission, callback, details) => callback(ALLOWED_PERMISSIONS.has(permission) && isTrustedDiscordUrl(details.requestingUrl)));
  let open = false;
  session.setDisplayMediaRequestHandler((request, callback) => {
    if (!request.videoRequested || !request.userGesture || !isTrustedDiscordUrl(request.securityOrigin) || open) { callback({}); return; }
    open = true;
    void chooseDisplaySource(getMainWindow()).then((source) => callback(source ? { video: source, ...(request.audioRequested && process.platform === "win32" ? { audio: "loopback" as const } : {}) } : {})).catch((error: unknown) => { console.error("[PulseCord] Could not enumerate display sources.", error); callback({}); }).finally(() => { open = false; });
  }, { useSystemPicker: process.platform === "darwin" });
}

async function chooseDisplaySource(parent: BrowserWindow | undefined): Promise<Electron.DesktopCapturerSource | undefined> {
  const sources = await withTimeout(
    desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 480, height: 270 }, fetchWindowIcons: true }),
    DISPLAY_SOURCES_TIMEOUT_MS,
    "desktopCapturer.getSources timed out"
  );
  if (!sources.length) return undefined;
  const toPickerSources = (items: readonly Electron.DesktopCapturerSource[]) => items.map((source, index) => ({ id: source.id, kind: source.id.startsWith("screen:") ? "screen" : "window", name: source.name || `Fonte ${index + 1}`, thumbnail: source.thumbnail.toDataURL() }));
  const data = toPickerSources(sources);
  const byId = new Map(sources.map((source) => [source.id, source]));
  return new Promise((resolve) => {
    const picker = new BrowserWindow({ width: 930, height: 670, minWidth: 740, minHeight: 520, show: false, backgroundColor: "#17151f", title: "Compartilhar tela — PulseCord", ...(parent && !parent.isDestroyed() ? { parent, modal: true } : {}), webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, "display-picker.cjs") } });
    let settled = false;
    const previewTimer = setInterval(() => { void desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 480, height: 270 }, fetchWindowIcons: true }).then((latest) => { if (!settled && !picker.isDestroyed()) picker.webContents.send(PICKER_SOURCES, toPickerSources(latest)); }).catch(() => undefined); }, 900);
    const finish = (id?: string): void => { if (settled) return; settled = true; clearInterval(previewTimer); ipcMain.removeListener(PICKER_READY, onReady); ipcMain.removeListener(PICKER_CHOOSE, onChoose); ipcMain.removeListener(PICKER_CANCEL, onCancel); if (!picker.isDestroyed()) picker.close(); resolve(id ? byId.get(id) : undefined); };
    const owns = (sender: Electron.WebContents): boolean => sender.id === picker.webContents.id;
    const onReady = (event: Electron.IpcMainEvent): void => { if (owns(event.sender)) picker.webContents.send(PICKER_SOURCES, data); };
    const onChoose = (event: Electron.IpcMainEvent, id: unknown): void => { if (owns(event.sender) && typeof id === "string" && byId.has(id)) finish(id); };
    const onCancel = (event: Electron.IpcMainEvent): void => { if (owns(event.sender)) finish(); };
    ipcMain.on(PICKER_READY, onReady); ipcMain.on(PICKER_CHOOSE, onChoose); ipcMain.on(PICKER_CANCEL, onCancel);
    picker.once("closed", () => finish()); picker.once("ready-to-show", () => picker.show()); void picker.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PICKER_HTML)}`);
  });
}

/**
 * Locks the embedded service surface to Discord: in-place navigation may only
 * reach a trusted Discord origin, popups are never opened as real windows (a
 * trusted target loads in place, anything else goes to the system browser),
 * and webviews cannot be attached.
 */
export function hardenServiceContents(webContents: Electron.WebContents): void {
  webContents.on("will-navigate", (event, url) => { if (isTrustedDiscordUrl(url)) return; event.preventDefault(); void openExternalSafely(url); });
  webContents.setWindowOpenHandler(({ url }) => { if (isTrustedDiscordUrl(url)) void webContents.loadURL(url); else void openExternalSafely(url); return { action: "deny" }; });
  webContents.on("will-attach-webview", (event) => event.preventDefault());
}

/**
 * The shell's own chrome renders a local page and must never navigate at all.
 * Any attempt — a stray link, an injected redirect — is cancelled and handed
 * to the system browser instead.
 */
export function hardenShellContents(webContents: Electron.WebContents): void {
  webContents.on("will-navigate", (event, url) => { event.preventDefault(); void openExternalSafely(url); });
  webContents.setWindowOpenHandler(({ url }) => { void openExternalSafely(url); return { action: "deny" }; });
  webContents.on("will-attach-webview", (event) => event.preventDefault());
}
async function openExternalSafely(value: string): Promise<void> { try { const url = new URL(value); if (["https:", "http:", "mailto:"].includes(url.protocol)) await shell.openExternal(url.toString()); } catch { /* ignore invalid URLs */ } }

function withTimeout<T>(task: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    task.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); }
    );
  });
}

const PICKER_HTML = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><style>*{box-sizing:border-box}body{margin:0;background:#17151f;color:#f7f5ff;font:14px 'Segoe UI',sans-serif}main{display:grid;grid-template-rows:auto auto 1fr auto;min-height:100vh}header{padding:28px 30px 16px}.brand{color:#a78bfa;font-size:11px;font-weight:800;letter-spacing:.14em}h1{margin:7px 0;font-size:26px}p{margin:0;color:#aaa5b9}.tabs{display:flex;gap:8px;padding:0 30px 16px;border-bottom:1px solid #302a3d}.tabs button,.footer button{font:inherit;cursor:pointer}.tabs button{border:0;border-radius:9px;padding:9px 16px;background:transparent;color:#aaa5b9;font-weight:700}.tabs button[aria-selected=true]{background:#2c2345;color:#e9ddff}.sources{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;align-content:start;overflow:auto;padding:22px 30px}.source{overflow:hidden;padding:0;border:1px solid #393346;border-radius:14px;background:#201c29;color:inherit;text-align:left;cursor:pointer}.source:hover,.source[aria-pressed=true]{border-color:#9a70ff;box-shadow:0 0 0 2px #8b5cf644}.source img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#121018}.source strong,.source small{display:block;padding:10px 12px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.source small{padding:3px 12px 12px;color:#aaa5b9;font-size:11px}.empty{grid-column:1/-1;padding:40px;color:#aaa5b9;text-align:center}.footer{display:flex;gap:16px;align-items:center;padding:16px 30px;border-top:1px solid #302a3d}.note{flex:1;color:#aaa5b9;font-size:11px;line-height:1.4}.footer button{min-height:38px;padding:0 15px;border-radius:9px;font-weight:750}.cancel{border:1px solid #423a51;background:transparent;color:#ddd}.share{margin-left:8px;border:0;background:#8b5cf6;color:white}.share:disabled{opacity:.45}</style><main><header><div class="brand">PULSECORD</div><h1>Compartilhar sua tela</h1><p>Escolha uma tela inteira ou um aplicativo para compartilhar no Discord.</p></header><div class="tabs"><button data-tab="screen" aria-selected="true">Telas</button><button data-tab="window" aria-selected="false">Aplicativos</button></div><section class="sources"></section><footer class="footer"><span class="note">Pré-visualizações locais em tempo real. A qualidade e o FPS da transmissão são definidos pelo Discord/WebRTC após o início.</span><span><button class="cancel">Cancelar</button><button class="share" disabled>Compartilhar</button></span></footer></main><script>const a=window.PulseCordDisplayPicker,l=document.querySelector('.sources'),s=document.querySelector('.share');let x=[],k='screen',v='';function r(){l.replaceChildren();const z=x.filter(q=>q.kind===k);if(!z.length){l.innerHTML='<p class="empty">Nenhuma fonte disponível nesta aba.</p>';return}z.forEach(q=>{const b=document.createElement('button');b.className='source';b.setAttribute('aria-pressed',v===q.id);b.innerHTML='<img alt=""><strong></strong><small>'+ (q.kind==='screen'?'Tela inteira':'Aplicativo')+'</small>';b.querySelector('img').src=q.thumbnail;b.querySelector('img').alt='Prévia de '+q.name;b.querySelector('strong').textContent=q.name;b.onclick=()=>{v=q.id;s.disabled=false;r()};b.ondblclick=()=>a.choose(q.id);l.append(b)})}document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{k=b.dataset.tab;v='';s.disabled=true;document.querySelectorAll('[data-tab]').forEach(t=>t.setAttribute('aria-selected',t===b));r()});document.querySelector('.cancel').onclick=()=>a.cancel();s.onclick=()=>v&&a.choose(v);a.onSources(q=>{x=q;r()});a.ready()</script>`;
