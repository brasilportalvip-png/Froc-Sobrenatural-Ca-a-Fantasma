import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import firebaseConfig from './firebaseConfig';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServiceAccountCredentials {
  projectId: string;
  project_id: string;
  clientEmail: string;
  client_email: string;
  privateKey: string;
  private_key: string;
  type?: string;
  [key: string]: any;
}

/**
 * Validação rigorosa dos campos e integridade de uma Service Account.
 * Exige conjuntamente project_id, client_email e private_key como strings não-vazias.
 */
export function validateServiceAccountCredentials(cred: any): ServiceAccountCredentials | null {
  if (!cred || typeof cred !== 'object' || Array.isArray(cred)) {
    return null;
  }

  const { project_id, client_email, private_key } = cred;

  if (typeof project_id !== 'string' || project_id.trim().length === 0) {
    return null;
  }

  if (typeof client_email !== 'string' || client_email.trim().length === 0 || !client_email.includes('@')) {
    return null;
  }

  if (typeof private_key !== 'string' || private_key.trim().length === 0) {
    return null;
  }

  let normalizedKey = private_key.trim();
  // Normalizar quebras de linha caso estejam escapadas como \n literais
  if (normalizedKey.includes('\\n')) {
    normalizedKey = normalizedKey.replace(/\\n/g, '\n');
  }

  if (!normalizedKey.includes('BEGIN PRIVATE KEY') || !normalizedKey.includes('END PRIVATE KEY')) {
    return null;
  }

  return {
    ...cred,
    project_id: project_id.trim(),
    client_email: client_email.trim(),
    private_key: normalizedKey,
    projectId: project_id.trim(),
    clientEmail: client_email.trim(),
    privateKey: normalizedKey,
  };
}

// Helper para parsear credenciais com separação explícita entre Desenvolvimento e Produção (Vercel)
export function parseServiceAccount(): ServiceAccountCredentials | null {
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

  // 1. Variáveis de ambiente com JSON completo ou Base64 (Prioridade obrigatória em Produção / Vercel)
  const envCandidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
    process.env.FIREBASE_SERVICE_ACCOUNT,
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
  ];

  for (const raw of envCandidates) {
    if (!raw || typeof raw !== 'string' || raw.trim().length === 0) continue;
    let clean = raw.trim();

    // Remove aspas envolventes se presentes
    if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
      clean = clean.slice(1, -1).trim();
    }

    // Tentativa A: Parse direto como JSON
    try {
      const parsed = JSON.parse(clean);
      const validated = validateServiceAccountCredentials(parsed);
      if (validated) {
        return validated;
      }
    } catch {
      // Pode ser base64
    }

    // Tentativa B: Decodificação Base64
    try {
      // Validar formato base64 antes de decodificar
      if (/^[A-Za-z0-9+/=]+$/.test(clean.replace(/\s+/g, ''))) {
        const decoded = Buffer.from(clean, 'base64').toString('utf-8');
        const parsed = JSON.parse(decoded);
        const validated = validateServiceAccountCredentials(parsed);
        if (validated) {
          return validated;
        }
      }
    } catch {
      // Não é base64 válido
    }
  }

  // 2. Variáveis de ambiente individuais
  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    const candidate = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY,
    };
    const validated = validateServiceAccountCredentials(candidate);
    if (validated) {
      return validated;
    }
  }

  // 3. Em Produção (Vercel / Cloud Run), NUNCA depender de arquivos no sistema de arquivos local
  if (isProduction) {
    return null;
  }

  // 4. Somente em Desenvolvimento Local ou Testes automatizados locais: tentar arquivo de credenciais local
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
        const validated = validateServiceAccountCredentials(parsed);
        if (validated) {
          return validated;
        }
      }
    } catch {
      // Continuar para o próximo candidato local
    }
  }

  return null;
}

// Initialize Firebase Admin SDK
let appInstance: any = null;
let hasValidServiceAccount = false;

const existingApps = getApps();
if (existingApps.length > 0) {
  appInstance = existingApps[0];
  // IMPORTANTE: Não assumir automaticamente que hasValidServiceAccount é true só porque um app existe.
  // Testar se as opções do app contêm credencial válida ou tentar carregar as credenciais.
  const credentials = parseServiceAccount();
  if (credentials && credentials.private_key && credentials.project_id && credentials.client_email) {
    hasValidServiceAccount = true;
  }
} else {
  const credentials = parseServiceAccount();

  if (credentials) {
    try {
      // Normalizar quebras de linha da private_key (\n literais copiados de variáveis de ambiente)
      if (typeof credentials.private_key === 'string') {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }

      const projectId = credentials.project_id || firebaseConfig.projectId;

      appInstance = initializeApp({
        credential: cert(credentials),
        projectId,
        storageBucket: firebaseConfig.storageBucket,
      });

      hasValidServiceAccount = true;
      console.log(`[Firebase Admin] Inicializado com sucesso com Service Account para projeto: ${projectId}`);
    } catch (err) {
      console.error('[Firebase Admin] Erro ao inicializar com credencial de Service Account:', err);
    }
  }

  if (!appInstance) {
    console.warn(
      '[Firebase Admin] ATENÇÃO: Nenhuma credencial de Service Account configurada (FIREBASE_SERVICE_ACCOUNT_KEY). ' +
      'Firestore e Auth de servidor exigem essa variável no ambiente de execução.'
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
}

/**
 * Retorna true APENAS se o Firebase Admin foi configurado com credenciais válidas de Service Account.
 * Evita falsos positivos de getApps().length.
 */
export function isFirebaseAdminConfigured(): boolean {
  return hasValidServiceAccount;
}

export const adminAuth = getAuth(appInstance);
export const adminDb = getFirestore(appInstance);

export default appInstance;
