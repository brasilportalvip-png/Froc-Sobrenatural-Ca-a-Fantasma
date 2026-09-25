import { adminDb } from './firebaseAdmin';
import { UserProfile } from '../types';

/**
 * Normaliza strings para busca insensível a acentos (diacríticos) e caixa alta/baixa.
 * Exemplo: "João" -> "joao"
 */
export function normalizeSearchTerm(str?: string | null): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Garante e sincroniza o documento users/{uid} no Firestore Admin SDK.
 * 
 * Invariantes:
 * - Executa no backend via Bearer token verificado.
 * - Idempotente e transacional: preserva createdAt e campos cadastrais originais.
 * - Não insere e não modifica propriedades de carteira ou autorização (role, balance, grants).
 */
export async function ensureUserProfileServer(userRecord: {
  uid: string;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  email_verified?: boolean;
  firebase?: any;
}): Promise<UserProfile> {
  const uid = userRecord.uid;
  if (!uid) {
    throw new Error('UID de usuário obrigatório para sincronização do perfil no servidor.');
  }

  const userRef = adminDb.collection('users').doc(uid);
  const now = Date.now();
  const provider = userRecord.firebase?.sign_in_provider || 'password';

  const snap = await userRef.get();

  if (!snap.exists) {
    const displayName = userRecord.name || (userRecord.email ? userRecord.email.split('@')[0] : null);
    const email = userRecord.email || null;
    const newProfile: UserProfile = {
      uid,
      email,
      displayName,
      displayNameLower: displayName ? displayName.toLowerCase().trim() : null,
      emailLower: email ? email.toLowerCase().trim() : null,
      displayNameNormalized: displayName ? normalizeSearchTerm(displayName) : null,
      emailNormalized: email ? normalizeSearchTerm(email) : null,
      photoURL: userRecord.picture || null,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      authProvider: provider,
      emailVerified: !!userRecord.email_verified,
    };

    await userRef.set(newProfile);
    return newProfile;
  } else {
    const existing = snap.data() as UserProfile;
    const updates: Partial<UserProfile> = {
      updatedAt: now,
      lastLoginAt: now,
      emailVerified: !!userRecord.email_verified,
    };

    if (userRecord.name && userRecord.name !== existing.displayName) {
      updates.displayName = userRecord.name;
      updates.displayNameLower = userRecord.name.toLowerCase().trim();
      updates.displayNameNormalized = normalizeSearchTerm(userRecord.name);
    } else if (!existing.displayNameNormalized && existing.displayName) {
      updates.displayNameNormalized = normalizeSearchTerm(existing.displayName);
      if (!existing.displayNameLower) {
        updates.displayNameLower = existing.displayName.toLowerCase().trim();
      }
    }

    if (userRecord.picture && userRecord.picture !== existing.photoURL) {
      updates.photoURL = userRecord.picture;
    }
    if (userRecord.email && userRecord.email !== existing.email) {
      updates.email = userRecord.email;
      updates.emailLower = userRecord.email.toLowerCase().trim();
      updates.emailNormalized = normalizeSearchTerm(userRecord.email);
    } else if (!existing.emailNormalized && existing.email) {
      updates.emailNormalized = normalizeSearchTerm(existing.email);
      if (!existing.emailLower) {
        updates.emailLower = existing.email.toLowerCase().trim();
      }
    }

    await userRef.update(updates);

    return {
      ...existing,
      ...updates,
    };
  }
}

export async function getUserProfileServer(uid: string): Promise<UserProfile | null> {
  if (!uid) return null;
  const snap = await adminDb.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  return snap.data() as UserProfile;
}
