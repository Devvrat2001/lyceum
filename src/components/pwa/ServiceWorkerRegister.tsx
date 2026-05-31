"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (`public/sw.js`) that powers the
 * installable PWA + offline fallback. Renders nothing.
 *
 * Production-only on purpose: a service worker under `next dev` can
 * serve stale build chunks and confuse HMR, and the offline behaviour
 * only matters on the deployed app. In dev this is a no-op, so the
 * manifest + install affordance still work without a SW intercepting
 * requests.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("[pwa] service worker registration failed", err);
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
