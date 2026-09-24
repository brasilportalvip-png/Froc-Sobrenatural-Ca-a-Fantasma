import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { UserProfile } from '../types';

export interface SyncProfileResult {
  profile: UserProfile | null;
  persisted: boolean;
  error?: string;
}

/**
 * Sincroniza o perfil do usuário de forma autoritativa através do backend (Firebase Admin).
 * O cliente NUNCA escreve diretamente em users/{uid}, respeitando o princípio de menor privilégio
 * e firestore.rules (`allow write: if false`).
 *
 * Invariantes:
 * - A identidade e claims são validadas pelo Firebase Admin SDK a partir do Bearer ID token.
 * - emailVerified, authProvider, uid e timestamps são derivados exclusivamente do token/servidor.
 * - Não mascara falha com perfil falso de sucesso: retorna claramente se foi persistido ou não.
 */
export async function syncUserProfileAuthoritative(
  user: User,
  idToken: string
): Promise<SyncProfileResult> {
  if (!user || !user.uid) {
    return {
      profile: null,
      persisted: false,
      error: 'Usuário inválido para sincronização.',
    };
  }

  if (!idToken) {
    return {
      profile: null,
      persisted: false,
      error: 'Token de autenticação não fornecido.',
    };
  }

  try {
    const res = await fetch('/api/user/sync-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        profile: null,
        persisted: false,
        error: errData.error || `Erro de sincronização HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    return {
      profile: data.profile as UserProfile,
      persisted: true,
    };
  } catch (err: any) {
    console.warn('[UserProfileClient] Erro de rede ao sincronizar perfil no backend:', err?.message);
    return {
      profile: null,
      persisted: false,
      error: err?.message || 'Falha de conexão com o servidor',
    };
  }
}

/**
 * Busca o perfil de users/{uid}.
 * O cliente tem permissão de LEITURA direta no Firestore se autenticado (allow read: if isOwner(userId)),
 * com fallback transparente para a API autenticada se necessário.
 */
export async function fetchUserProfileClient(uid: string, idToken?: string): Promise<UserProfile | null> {
  if (!uid) return null;

  // 1. Tentar leitura direta via Firestore SDK (leitura rápida em cache/tempo real)
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
  } catch (err: any) {
    // Se o cliente não conseguiu ler diretamente (ex: offline ou erro de rede do Firestore)
    console.warn('[UserProfileClient] Leitura client Firestore falhou, tentando fallback API:', err?.message);
  }

  // 2. Fallback via API backend autenticada
  if (idToken) {
    try {
      const res = await fetch('/api/user/profile', {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (res.ok) {
        return (await res.json()) as UserProfile;
      }
    } catch (apiErr) {
      console.warn('[UserProfileClient] Fallback API de perfil falhou:', apiErr);
    }
  }

  return null;
}
