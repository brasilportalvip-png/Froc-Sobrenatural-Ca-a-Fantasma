import { User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { UserProfile } from '../types';

/**
 * Sincroniza ou cria o documento de perfil users/{uid} no Firestore.
 * 
 * Invariantes de Segurança:
 * - Documento criado com UID autenticado (garantido por rules e Firebase Auth).
 * - Sem campos financeiros ou administrativos (balance, role, admin, grants são proibidos).
 * - Idempotente: se já existir, atualiza lastLoginAt e emailVerified sem sobrescrever createdAt.
 * - Migração automática: usuários antigos sem users/{uid} são provisionados no primeiro acesso.
 */
export async function syncUserProfileClient(
  user: User,
  options?: { isNewRegistration?: boolean; idToken?: string | null }
): Promise<UserProfile> {
  if (!user || !user.uid) {
    throw new Error('Usuário inválido para sincronização de perfil.');
  }

  const userDocRef = doc(db, 'users', user.uid);
  const now = Date.now();
  const providerId = user.providerData?.[0]?.providerId || 'password';

  try {
    const snap = await getDoc(userDocRef);

    if (!snap.exists()) {
      // 1. Criar novo perfil seguro ou migrar usuário existente sem perfil
      const newProfile: UserProfile = {
        uid: user.uid,
        email: user.email || null,
        displayName: user.displayName || (user.email ? user.email.split('@')[0] : null),
        photoURL: user.photoURL || null,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
        authProvider: providerId,
        emailVerified: !!user.emailVerified,
      };

      await setDoc(userDocRef, newProfile);
      return newProfile;
    } else {
      // 2. Atualizar perfil existente
      const existingData = snap.data();
      const updates: Record<string, any> = {
        updatedAt: now,
        lastLoginAt: now,
        emailVerified: !!user.emailVerified,
      };

      if (user.displayName && user.displayName !== existingData.displayName) {
        updates.displayName = user.displayName;
      }
      if (user.photoURL && user.photoURL !== existingData.photoURL) {
        updates.photoURL = user.photoURL;
      }
      if (user.email && user.email !== existingData.email) {
        updates.email = user.email;
      }
      if (providerId && providerId !== existingData.authProvider) {
        updates.authProvider = providerId;
      }

      await updateDoc(userDocRef, updates);

      return {
        uid: user.uid,
        email: updates.email || existingData.email || user.email || null,
        displayName: updates.displayName || existingData.displayName || (user.email ? user.email.split('@')[0] : null),
        photoURL: updates.photoURL || existingData.photoURL || user.photoURL || null,
        createdAt: existingData.createdAt || now,
        updatedAt: now,
        lastLoginAt: now,
        authProvider: updates.authProvider || existingData.authProvider || providerId,
        emailVerified: !!user.emailVerified,
      };
    }
  } catch (err: any) {
    console.warn('[UserProfileClient] Falha ao sincronizar via Firestore Client SDK, tentando sincronização backend:', err?.message);

    // Fallback de resiliência: se o Firestore SDK falhar no browser, sincroniza via API com Bearer token
    if (options?.idToken) {
      try {
        const res = await fetch('/api/user/sync-profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.idToken}`,
          },
        });
        if (res.ok) {
          const result = await res.json();
          if (result.profile) return result.profile;
        }
      } catch (backendErr) {
        console.warn('[UserProfileClient] Falha no fallback backend:', backendErr);
      }
    }

    // Se foi cadastro explícito e falhou tanto client quanto server, reportar erro
    if (options?.isNewRegistration) {
      throw new Error(`Falha ao registrar perfil de usuário no Firestore: ${err.message || 'Erro desconhecido'}`);
    }

    // Fallback in-memory profile para não travar a UI
    return {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || (user.email ? user.email.split('@')[0] : null),
      photoURL: user.photoURL || null,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      authProvider: providerId,
      emailVerified: !!user.emailVerified,
    };
  }
}

export async function fetchUserProfileClient(uid: string): Promise<UserProfile | null> {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
  } catch (err) {
    console.warn('[UserProfileClient] Erro ao buscar perfil:', err);
    return null;
  }
}
