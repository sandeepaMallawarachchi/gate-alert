import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDbJhz9Hb-TdBYjE6hdREfnJgr865qu9Q0",
  authDomain: "gatealertapp.firebaseapp.com",
  projectId: "gatealertapp",
  storageBucket: "gatealertapp.firebasestorage.app",
  messagingSenderId: "510658179336",
  appId: "1:510658179336:web:296b486124dcb43fee7cbd"
};

const VAPID_KEY = "ovyvtdAYsROQtmv-Yb_X_dbY92OXQFncaQ-OT1986X4";

let app: ReturnType<typeof initializeApp> | null = null;
let messaging: Messaging | null = null;

const getAppServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) return null;

  try {
    // Use the PWA service worker (registered by vite-plugin-pwa at scope '/')
    return await navigator.serviceWorker.ready;
  } catch (error) {
    console.error('Service worker not ready:', error);
    return null;
  }
};

export const initializeFirebase = () => {
  if (!firebaseConfig.apiKey) {
    console.warn('Firebase config not set. Push notifications will not work.');
    return null;
  }

  try {
    app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
    return messaging;
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    return null;
  }
};

export const requestNotificationPermission = async (): Promise<string | null> => {
  if (!messaging) {
    messaging = initializeFirebase();
    if (!messaging) return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(`Notification permission: ${permission}`);
  }

  const swRegistration = await getAppServiceWorker();
  if (!swRegistration) {
    throw new Error('Service worker not ready (PWA SW)');
  }

  try {
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) {
      throw new Error('Empty FCM token returned');
    }

    console.log('FCM Token:', token);
    return token;
  } catch (error) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('FCM token error:', error);
    throw new Error(`FCM token error: ${msg}`);
  }
};

export const onForegroundMessage = (callback: (payload: any) => void) => {
  if (!messaging) {
    messaging = initializeFirebase();
    if (!messaging) return () => {};
  }

  return onMessage(messaging, callback);
};

export { messaging };
