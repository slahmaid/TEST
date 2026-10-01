/**
 * Prumysl — Firebase (copy to firebase-config.js and fill in from Firebase Console)
 *
 * 1. https://console.firebase.google.com → Create project
 * 2. Build → Firestore → Create database (production mode)
 * 3. Build → Authentication → Sign-in method → Email/Password → Enable
 * 4. Project settings → Your apps → Web → Register app → copy config
 * 5. Authentication → Users → Add user (admin email/password)
 * 6. Deploy rules: firebase deploy --only firestore:rules (see firestore.rules)
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
