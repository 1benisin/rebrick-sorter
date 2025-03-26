import * as admin from 'firebase-admin';
import * as path from 'path';

// Initialize Firebase Admin
const serviceAccount = require(path.join(process.cwd(), 'credentials', 'firebase-service-account.json'));

const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

// Export the admin SDK instances
export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const adminStorage = admin.storage();

// Export the admin app instance if needed
export default app;
