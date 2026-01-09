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

export const initializeFirebase = () => {
  if (!firebaseConfig.apiKey) {
    console.warn('Firebase config not set. Push notifications will not work.');
    return null;
  }

  try {
    app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
    
    // Send config to service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.active?.postMessage({
          type: 'FIREBASE_CONFIG',
          config: firebaseConfig
        });
      });
    }
    
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

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return null;
    }

    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    console.log('FCM Token:', token);
    return token;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
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
