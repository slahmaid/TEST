/**
 * Prumysl Admin — roles (copy to admin-config.js next to firebase-config.js)
 *
 * inventoryAdminEmails: users who see «مخزون المنتجات» in the admin panel.
 * sheetSyncIntervalMs: Google Sheet sync interval in milliseconds (min 10000).
 * Add the exact email of the Firebase Auth user you create for inventory.
 *
 * Also add the same email(s) in firebase/firestore.rules → isInventoryAdmin()
 * then publish rules in Firebase Console.
 */
window.PRUMYSL_ADMIN_CONFIG = {
    inventoryAdminEmails: [
        'prumyslmaroc@gmail.com'
    ],
    sheetSyncIntervalMs: 45000
};
