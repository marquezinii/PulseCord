import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

interface RecoveryState {
  crashCount: number;
  lastCrashAt: number;
}

const WINDOW_MS = 120_000;

export class RecoveryStore {
  readonly #filePath: string;

  constructor(userDataPath: string) {
    this.#filePath = path.join(userDataPath, "pulsecord-recovery.json");
  }

  async recordCrash(): Promise<boolean> {
    const now = Date.now();
    const previous = await this.#read();
    const crashCount = now - previous.lastCrashAt <= WINDOW_MS ? previous.crashCount + 1 : 1;
    await this.#write({ crashCount, lastCrashAt: now });
    return crashCount >= 2;
  }

  async markStable(): Promise<void> {
    await this.#write({ crashCount: 0, lastCrashAt: 0 });
  }

  async #read(): Promise<RecoveryState> {
    try {
      const parsed = JSON.parse(await readFile(this.#filePath, "utf8")) as Partial<RecoveryState>;
      return {
        crashCount: Number.isSafeInteger(parsed.crashCount) ? Math.max(0, parsed.crashCount ?? 0) : 0,
        lastCrashAt: typeof parsed.lastCrashAt === "number" ? parsed.lastCrashAt : 0
      };
    } catch {
      return { crashCount: 0, lastCrashAt: 0 };
    }
  }

  async #write(state: RecoveryState): Promise<void> {
    const directory = path.dirname(this.#filePath);
    const temporaryPath = `${this.#filePath}.${process.pid}.tmp`;
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.#filePath);
  }
}
