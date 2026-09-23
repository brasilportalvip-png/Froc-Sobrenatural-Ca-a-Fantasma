import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import serviceAccount from '../../firebase-service-account.json';

// Initialize Firebase Admin SDK using modular exports
let appInstance: any = null;

if (!getApps().length) {
  try {
    appInstance = initializeApp({
      credential: cert(serviceAccount as any),
      projectId: serviceAccount.project_id || firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
    });
    console.log(`[Firebase Admin] Inicializado com sucesso com Service Account para projeto: ${serviceAccount.project_id}`);
  } catch (err) {
    console.error('[Firebase Admin] Erro ao inicializar com cert:', err);
    try {
      appInstance = initializeApp({
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
      });
    } catch (fallbackErr) {
      console.error('[Firebase Admin] Erro de fallback:', fallbackErr);
    }
  }
} else {
  appInstance = getApps()[0];
}

export const adminAuth = getAuth(appInstance);
export const adminDb = getFirestore(appInstance);

export default appInstance;
