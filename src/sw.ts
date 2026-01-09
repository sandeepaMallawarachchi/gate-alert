/// <reference lib="webworker" />

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: any;
};

// ---- Workbox (PWA offline) ----
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

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

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

onBackgroundMessage(messaging, (payload) => {
  const title = payload.notification?.title || '🚨 Gate Alert!';
  const body = payload.notification?.body || 'Someone is requesting gate access!';

  const senderAvatar = (payload.data as any)?.sender_avatar as string | undefined;

  const options: any = {
    body,
    icon: senderAvatar || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    image: senderAvatar || undefined,
    vibrate: [500, 200, 500, 200, 500],
    requireInteraction: true,
    tag: 'gate-alert',
    renotify: true,
    data: {
      url: '/',
    },
  };

  void self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data as any)?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
