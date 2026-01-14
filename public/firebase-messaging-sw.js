// Firebase messaging service worker for push notifications
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
  console.log('[firebase-messaging-sw.js] Received background message:', payload);
  
  // Handle data-only messages
  const data = payload.data || {};
  const notificationTitle = data.title || payload.notification?.title || '🚨 Gate Alert!';
  const notificationOptions = {
    body: data.body || payload.notification?.body || 'Someone is requesting gate access!',
    icon: data.sender_avatar || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [500, 200, 500, 200, 500],
    requireInteraction: true,
    tag: 'gate-alert',
    renotify: true,
    actions: [
      { action: 'open', title: 'Open App' }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
