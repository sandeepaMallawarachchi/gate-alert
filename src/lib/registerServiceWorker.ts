// Single place that registers the combined PWA + push (FCM) service worker.
// It must never run in dev or in Lovable preview: a worker there serves stale
// files and the dev build of src/sw.ts cannot be evaluated as a classic script.

const SW_URL = "/sw.js";
const APP_SW_PATHS = ["/sw.js", "/dev-sw.js"];

const PREVIEW_LABEL = /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/;
const PREVIEW_PARENTS = [".lovable.app", ".gpt-eng.com", ".gptengineer.run"];
const DEV_LABEL = /^project--[a-z0-9-]+-dev$/;

function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isPreviewHost(hostname: string): boolean {
  const firstLabel = hostname.split(".")[0];
  if (PREVIEW_PARENTS.some((p) => hostname.endsWith(p))) {
    if (PREVIEW_LABEL.test(firstLabel) || DEV_LABEL.test(firstLabel)) return true;
  }
  const suffixes = ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"];
  return suffixes.some((s) => hostname === s || hostname.endsWith(`.${s}`));
}

export function canRegisterServiceWorker(): boolean {
  if (!import.meta.env.PROD) return false;
  if (isInIframe()) return false;
  if (isPreviewHost(window.location.hostname.toLowerCase())) return false;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return false;
  return true;
}

async function unregisterAppWorkers() {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => {
        const url = r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || "";
        try {
          return APP_SW_PATHS.includes(new URL(url).pathname);
        } catch {
          return false;
        }
      })
      .map((r) => r.unregister()),
  );
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  if (!canRegisterServiceWorker()) {
    unregisterAppWorkers().catch(() => {});
    return;
  }

  // Reload once when a new worker takes control so installed apps update
  // without reinstalling.
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .catch((err) => console.error("Service worker registration failed:", err));
  });
}
