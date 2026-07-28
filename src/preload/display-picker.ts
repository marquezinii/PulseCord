import { contextBridge, ipcRenderer } from "electron";

interface DisplayPickerSource { id: string; kind: "screen" | "window"; name: string; thumbnail: string; }
declare global { interface Window { PulseCordDisplayPicker?: { ready(): void; cancel(): void; choose(id: string): void; onSources(listener: (sources: DisplayPickerSource[]) => void): () => void; }; } }

const channels = { ready: "pulsecord:display-picker:ready", sources: "pulsecord:display-picker:sources", choose: "pulsecord:display-picker:choose", cancel: "pulsecord:display-picker:cancel" } as const;
contextBridge.exposeInMainWorld("PulseCordDisplayPicker", Object.freeze({
  ready: () => ipcRenderer.send(channels.ready),
  cancel: () => ipcRenderer.send(channels.cancel),
  choose: (id: string) => { if (typeof id === "string" && id.length > 0 && id.length <= 512) ipcRenderer.send(channels.choose, id); },
  onSources: (listener: (sources: DisplayPickerSource[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sources: unknown): void => { if (Array.isArray(sources)) listener(sources as DisplayPickerSource[]); };
    ipcRenderer.on(channels.sources, handler);
    return () => ipcRenderer.removeListener(channels.sources, handler);
  }
}));
