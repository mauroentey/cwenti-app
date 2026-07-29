import path from "node:path";

export function isSafeExternalUrl(value, options = {}) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") {
      if (!options.hosts || options.hosts.length === 0) return true;
      return options.hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    }
    return options.allowMailto === true && url.protocol === "mailto:";
  } catch {
    return false;
  }
}

export function secureWebContents(webContents, allowedFilePath) {
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-navigate", (event, targetUrl) => {
    try {
      const url = new URL(targetUrl);
      const expected = path.resolve(allowedFilePath);
      if (url.protocol === "file:" && path.resolve(decodeURIComponent(url.pathname)) === expected) return;
    } catch {
      // Deny malformed navigation.
    }
    event.preventDefault();
  });
  webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  webContents.session.setPermissionCheckHandler(() => false);
}
