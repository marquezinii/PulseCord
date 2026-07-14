/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

import { VENCORD_DIR } from "../vencordDir";
import { downloadFile } from "./http";

// PulseCord deliberately pins the mod engine instead of silently executing a new
// upstream build. Updating this digest is an explicit, reviewable repository change.
export const MOD_ENGINE = {
    source: "Equicord/Equicord",
    assetUpdatedAt: "2026-07-10T00:06:11Z",
    url: "https://github.com/Equicord/Equicord/releases/download/latest/equibop.asar",
    sha256: "950abb54508b97718ed345e93d40c1e13ae7e583c18c4cacb476964946cd925a"
} as const;

function sha256(file: string) {
    return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export async function downloadVencordAsar() {
    if (!VENCORD_DIR.endsWith(".asar")) {
        throw new Error("Cannot repair while a custom Equicord directory is selected.");
    }

    const temporaryFile = `${VENCORD_DIR}.download`;
    rmSync(temporaryFile, { force: true });

    try {
        await downloadFile(MOD_ENGINE.url, temporaryFile, {}, { retryOnNetworkError: true });

        const actualDigest = sha256(temporaryFile);
        if (actualDigest !== MOD_ENGINE.sha256) {
            throw new Error(
                `Plugin engine integrity check failed. Expected ${MOD_ENGINE.sha256}, received ${actualDigest}.`
            );
        }

        rmSync(VENCORD_DIR, { force: true });
        renameSync(temporaryFile, VENCORD_DIR);
    } finally {
        rmSync(temporaryFile, { force: true });
    }
}

export function isValidVencordInstall(dir: string) {
    return existsSync(join(dir, "equibop/main.js"));
}

export async function ensureVencordFiles() {
    if (existsSync(VENCORD_DIR)) return;

    await downloadVencordAsar();
}
