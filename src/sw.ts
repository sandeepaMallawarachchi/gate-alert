/// <reference lib="webworker" />

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';

import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: any;
};

// ---- Workbox (PWA offline) ----
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Auto-activate new SW versions so users get updates without reinstalling
self.skipWaiting();
clientsClaim();

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});


registerRoute(
  ({ url }) => /\.supabase\.co$/i.test(url.hostname),
  new NetworkFirst({
    cacheName: 'supabase-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24,
      }),
    ],
  })
);

// ---- Firebase Cloud Messaging (background push) ----
const firebaseConfig = {
  apiKey: 'AIzaSyDbJhz9Hb-TdBYjE6hdREfnJgr865qu9Q0',
  authDomain: 'gatealertapp.firebaseapp.com',
  projectId: 'gatealertapp',
  storageBucket: 'gatealertapp.firebasestorage.app',
  messagingSenderId: '510658179336',
  appId: '1:510658179336:web:296b486124dcb43fee7cbd',
};

// Register before Firebase initializes its own notification click handler.
self.addEventListener('notificationclick', (event) => {
  event.stopImmediatePropagation();
  event.notification.close();
  const data = event.notification.data || {};
  // Firebase automatically wraps notification data under FCM_MSG.
  const requested = data.url || data.FCM_MSG?.data?.url || '/';
  let target = new URL('/', self.location.origin);
  try {
    const candidate = new URL(requested, self.location.origin);
    if (candidate.origin === self.location.origin) target = candidate;
  } catch { /* Keep the application home URL for malformed payloads. */ }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
        await client.navigate(target.href);
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(target.href);
  })());
});

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

onBackgroundMessage(messaging, (payload) => {
  console.info('Push received in background', {
    alert_id: payload.data?.alert_id, sent_at: payload.data?.sent_at,
    received_at: new Date().toISOString(), auto_display: !!payload.notification,
  });
  // Notification payloads have already been displayed by Firebase.
  if (payload.notification) return;
  const data = payload.data as any;
  const type = data?.type || 'gate_alert';
  const isLocation = type === 'location_share';
  const title = data?.title || (isLocation ? '📍 Location shared' : '🚨 Gate Alert!');
  const body = data?.body || (isLocation ? 'Someone shared their location' : 'Someone is requesting gate access!');
  const senderAvatar = data?.sender_avatar as string | undefined;
  const tag = data?.tag || (isLocation ? 'location-share' : 'gate-alert');
  const url = data?.url || (isLocation ? '/locations' : '/');

  const options: any = {
    body,
    icon: senderAvatar || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: isLocation ? [200, 100, 200] : [500, 200, 500, 200, 500],
    requireInteraction: !isLocation,
    tag,
    renotify: true,
    data: { url },
  };

  return self.registration.showNotification(title, options);
});
