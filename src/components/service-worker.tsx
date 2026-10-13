"use client";

import { useEffect } from "react";

/** Registers the offline-fallback service worker (public/sw.js) in production. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Installation still works without it; nothing to tell the user.
    });
  }, []);
  return null;
}
