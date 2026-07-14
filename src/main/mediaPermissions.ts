/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { session, systemPreferences } from "electron";

import { DISCORD_HOSTNAMES } from "./constants";

const allowedDiscordPermissions = new Set([
    "clipboard-sanitized-write",
    "display-capture",
    "fullscreen",
    "media",
    "mediaKeySystem",
    "notifications",
    "pointerLock"
]);

function isTrustedDiscordUrl(url: string) {
    try {
        return DISCORD_HOSTNAMES.includes(new URL(url).hostname);
    } catch {
        return false;
    }
}

export function registerMediaPermissionsHandler() {
    session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
        return isTrustedDiscordUrl(requestingOrigin) && allowedDiscordPermissions.has(permission);
    });

    session.defaultSession.setPermissionRequestHandler(async (webContents, permission, callback, details) => {
        if (!isTrustedDiscordUrl(webContents.getURL()) || !allowedDiscordPermissions.has(permission)) {
            callback(false);
            return;
        }

        let granted = true;

        if (process.platform === "darwin" && "mediaTypes" in details) {
            if (details.mediaTypes?.includes("audio")) {
                granted &&= await systemPreferences.askForMediaAccess("microphone");
            }
            if (details.mediaTypes?.includes("video")) {
                granted &&= await systemPreferences.askForMediaAccess("camera");
            }
        }

        callback(granted);
    });
}
