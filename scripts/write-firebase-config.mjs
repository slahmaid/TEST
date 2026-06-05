/**
 * Writes js/firebase-config.js for deploy (GitHub Actions secrets or local env).
 * Required env: FIREBASE_API_KEY, FIREBASE_APP_ID, FIREBASE_MESSAGING_SENDER_ID
 * Optional: FIREBASE_MEASUREMENT_ID (defaults to empty string in output)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const apiKey = process.env.FIREBASE_API_KEY;
const appId = process.env.FIREBASE_APP_ID;
const messagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID;
const measurementId = process.env.FIREBASE_MEASUREMENT_ID || '';

if (!apiKey || !appId || !messagingSenderId) {
  console.error('');
  console.error('Deploy failed: missing Firebase secrets.');
  console.error('Add repository secrets (Settings → Secrets → Actions):');
  console.error('  FIREBASE_API_KEY, FIREBASE_APP_ID, FIREBASE_MESSAGING_SENDER_ID');
  console.error('  (optional) FIREBASE_MEASUREMENT_ID');
  console.error('OR one secret FIREBASE_CONFIG_JS = full contents of js/firebase-config.js');
  console.error('');
  process.exit(1);
}

const content = `/**
 * Prumysl — Firebase web config (generated at deploy; do not commit secrets to git)
 */
window.PRUMYSL_FIREBASE_CONFIG = {
    apiKey: '${apiKey.replace(/'/g, "\\'")}',
    authDomain: 'prumysl-orders.firebaseapp.com',
    projectId: 'prumysl-orders',
    storageBucket: 'prumysl-orders.firebasestorage.app',
    messagingSenderId: '${String(messagingSenderId).replace(/'/g, "\\'")}',
    appId: '${appId.replace(/'/g, "\\'")}',
    measurementId: '${measurementId.replace(/'/g, "\\'")}'
};
`;

const targets = [
  'js/firebase-config.js',
  'moka/js/firebase-config.js',
  'moka-pro-max/js/firebase-config.js',
  'saqr/js/firebase-config.js',
  'projectors/js/firebase-config.js'
];

for (const rel of targets) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  console.log('Wrote', rel);
}
