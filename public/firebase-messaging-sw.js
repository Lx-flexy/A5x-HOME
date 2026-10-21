// Firebase Cloud Messaging Service Worker
// This runs in the background even when the web app is closed

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
const firebaseConfig = {
  apiKey: "AIzaSyCjPTuY4QnhRbM8ZmbcNgY49TdfS5poxZQ",
  authDomain: "home-automation-a5x.firebaseapp.com",
  databaseURL: "https://home-automation-a5x-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "home-automation-a5x",
  storageBucket: "home-automation-a5x.firebasestorage.app",
  messagingSenderId: "412536927952",
  appId: "1:412536927952:web:a98ab4de410986d78e10d5"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handle background messages (when app is not in focus)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);
  
  const notificationTitle = payload.notification?.title || 'A5X Home Automation';
  const notificationOptions = {
    body: payload.notification?.body || 'New notification',
    icon: '/logo.png',
    badge: '/logo.png',
    tag: payload.data?.notificationId || 'default',
    data: payload.data,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    actions: [
      {
        action: 'open',
        title: 'Open App',
        icon: '/logo.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click:', event);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  // Open the app when notification is clicked
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if app is already open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window if app is not open
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
