# Project rules

- The combined PWA + FCM service worker (src/sw.ts → /sw.js) is registered only from src/lib/registerServiceWorker.ts, which refuses dev, iframes and Lovable preview hosts; vite-plugin-pwa keeps `injectRegister: null` and `devOptions.enabled: false`. Why: the dev worker fails to evaluate and preview workers serve stale files.
