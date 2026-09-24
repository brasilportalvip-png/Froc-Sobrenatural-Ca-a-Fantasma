import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import firebaseConfig from './firebaseConfig';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper para parsear credenciais de diversas fontes com máxima resiliência
function parseServiceAccount(): any | null {
  const envCandidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
    process.env.FIREBASE_SERVICE_ACCOUNT,
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
  ];

  for (const raw of envCandidates) {
    if (!raw || typeof raw !== 'string' || raw.trim().length === 0) continue;
    let clean = raw.trim();

    // Remove aspas simples ou duplas envolventes se presentes
    if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
      clean = clean.slice(1, -1).trim();
    }

    // Tentativa 1: Parse direto como JSON
    try {
      const parsed = JSON.parse(clean);
      if (parsed && typeof parsed === 'object' && (parsed.private_key || parsed.client_email)) {
        return parsed;
      }
    } catch {
      // Pode ser base64
    }

    // Tentativa 2: Decodificação Base64
    try {
      const decoded = Buffer.from(clean, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed === 'object' && (parsed.private_key || parsed.client_email)) {
        return parsed;
      }
    } catch {
      // Ignorar se não for base64 válido
    }
  }

  // Tentativa 3: Variáveis de ambiente individuais (FIREBASE_PRIVATE_KEY e FIREBASE_CLIENT_EMAIL)
  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    return {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY,
    };
  }

  // Tentativa 4: Arquivo em disco (desenvolvimento local ou testes)
  const candidatePaths = [
    path.resolve(process.cwd(), 'firebase-service-account.json'),
    path.resolve(process.cwd(), '..', 'firebase-service-account.json'),
    path.resolve(__dirname, '../../firebase-service-account.json'),
    path.resolve(__dirname, '../firebase-service-account.json'),
  ];

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_APPLICATION_CREDENTIALS.startsWith('{')) {
    candidatePaths.unshift(path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS));
  }

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.private_key) {
          return parsed;
        }
      }
    } catch {
      // Continuar para o próximo candidato
    }
  }

  return null;
}

// Initialize Firebase Admin SDK
let appInstance: any = null;
let hasServiceAccount = false;

if (!getApps().length) {
  let credentials = parseServiceAccount();

  if (credentials) {
    try {
      // CRÍTICO: Normalizar quebras de linha da private_key (\n literais copiados de variáveis de ambiente)
      if (typeof credentials.private_key === 'string') {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }

      const projectId = credentials.project_id || firebaseConfig.projectId;

      appInstance = initializeApp({
        credential: cert(credentials),
        projectId,
        storageBucket: firebaseConfig.storageBucket,
      });

      hasServiceAccount = true;
      console.log(`[Firebase Admin] Inicializado com sucesso com Service Account para projeto: ${projectId}`);
    } catch (err) {
      console.error('[Firebase Admin] Erro ao inicializar com credencial de Service Account:', err);
    }
  }

  if (!appInstance) {
    console.warn(
      '[Firebase Admin] ATENÇÃO: Nenhuma credencial de Service Account foi encontrada (FIREBASE_SERVICE_ACCOUNT_KEY). ' +
      'Na Vercel ou fora do Google Cloud, adicione FIREBASE_SERVICE_ACCOUNT_KEY nas variáveis de ambiente com o conteúdo do JSON da conta de serviço para permitir acesso ao Firestore e Auth.'
    );
    try {
      appInstance = initializeApp({
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
      });
    } catch (fallbackErr) {
      console.error('[Firebase Admin] Erro ao inicializar app de fallback:', fallbackErr);
    }
  }
} else {
  appInstance = getApps()[0];
  hasServiceAccount = true;
}

export function isFirebaseAdminConfigured(): boolean {
  return hasServiceAccount;
}

export const adminAuth = getAuth(appInstance);
export const adminDb = getFirestore(appInstance);

export default appInstance;
