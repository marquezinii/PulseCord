import type { NativeBridge } from "./contracts";

declare global {
  interface Window {
    PulseCord?: Readonly<Pick<NativeBridge, "getEnvironment">> & { readonly brand: "PulseCord" };
    __pulseCordBooted?: boolean;
  }
}

export {};
