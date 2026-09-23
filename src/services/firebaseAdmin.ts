import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import firebaseConfig from './firebaseConfig';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin SDK
let appInstance: any = null;

if (!getApps().length) {
  let credentials: any = null;

  // 1. Variável de ambiente direta (ideal para Vercel Serverless)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    } catch (e) {
      console.warn('[Firebase Admin] Falha ao parsear FIREBASE_SERVICE_ACCOUNT_KEY do env:', e);
    }
  }

  // 2. Leitura resiliente de arquivo em disco procurando caminhos relativos e absolutos
  if (!credentials) {
    const candidatePaths = [
      path.resolve(process.cwd(), 'firebase-service-account.json'),
      path.resolve(process.cwd(), '..', 'firebase-service-account.json'),
      path.resolve(__dirname, '../../firebase-service-account.json'),
      path.resolve(__dirname, '../firebase-service-account.json'),
    ];

    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf-8');
          credentials = JSON.parse(raw);
          break;
        }
      } catch {
        // Continuar para o próximo candidato
      }
    }
  }

  try {
    if (credentials && credentials.private_key) {
      appInstance = initializeApp({
        credential: cert(credentials),
        projectId: credentials.project_id || firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
      });
      console.log(`[Firebase Admin] Inicializado com sucesso com Service Account para projeto: ${credentials.project_id}`);
    } else {
      console.warn('[Firebase Admin] Credenciais de Service Account não encontradas. Inicializando com projectId de fallback.');
      appInstance = initializeApp({
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
      });
    }
  } catch (err) {
    console.error('[Firebase Admin] Erro durante inicialização do Admin App:', err);
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
