/**
 * Prumysl — Firebase (copy to firebase-config.js or edit firebase-config.js directly)
 *
 * Project: prumysl-orders
 * Setup:
 * 1. Authentication → Sign-in method → Email/Password → Enable
 * 2. Authentication → Users → Add user (admin login)
 * 3. Firestore Database → Create database → copy rules from firebase/firestore.rules → Publish
 * Admin: https://prumysl.cc/admin/
 * Inventory role: copy js/admin-config.example.js → js/admin-config.js (see firebase/firestore.rules)
 */
window.PRUMYSL_FIREBASE_CONFIG = {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'prumysl-orders.firebaseapp.com',
    projectId: 'prumysl-orders',
    storageBucket: 'prumysl-orders.firebasestorage.app',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId: 'YOUR_APP_ID',
    measurementId: 'YOUR_MEASUREMENT_ID'
};
