// Firebase messaging service worker for push notifications
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

importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDbJhz9Hb-TdBYjE6hdREfnJgr865qu9Q0",
  authDomain: "gatealertapp.firebaseapp.com",
  projectId: "gatealertapp",
  storageBucket: "gatealertapp.firebasestorage.app",
  messagingSenderId: "510658179336",
  appId: "1:510658179336:web:296b486124dcb43fee7cbd"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.info('Push received in legacy worker', {
    alert_id: payload.data?.alert_id, sent_at: payload.data?.sent_at,
    received_at: new Date().toISOString(), auto_display: !!payload.notification,
  });
  if (payload.notification) return;
  
  // Handle data-only messages
  const data = payload.data || {};
  const notificationTitle = data.title || payload.notification?.title || '🚨 Gate Alert!';
  const notificationOptions = {
    body: data.body || payload.notification?.body || 'Someone is requesting gate access!',
    icon: data.sender_avatar || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [500, 200, 500, 200, 500],
    requireInteraction: true,
    tag: data.tag || 'gate-alert',
    data: { url: data.url || '/' },
    renotify: true,
    actions: [
      { action: 'open', title: 'Open App' }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});
