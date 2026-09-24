import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { auth } from './firebaseClient';
import { UserWallet, LedgerEntry, CreditPackage, UserProfile } from '../types';
import { syncUserProfileClient, fetchUserProfileClient } from './userProfileClient';

// Configuração explícita da política de persistência local da sessão
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('[Auth] Falha ao definir browserLocalPersistence:', err);
  });
}

export function getFriendlyAuthErrorMessage(err: any): string {
  const code = err?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'O formato do e-mail informado é inválido.';
    case 'auth/user-disabled':
      return 'Esta conta de usuário foi temporariamente desativada pelo administrador.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'E-mail ou senha incorretos. Verifique suas credenciais.';
    case 'auth/email-already-in-use':
      return 'Este e-mail já está cadastrado. Tente entrar ou recupere sua senha.';
    case 'auth/weak-password':
      return 'A senha é muito fraca. Utilize pelo menos 6 caracteres.';
    case 'auth/popup-closed-by-user':
      return 'A janela de autenticação do Google foi fechada antes de concluir o acesso.';
    case 'auth/popup-blocked':
      return 'A janela pop-up foi bloqueada pelo navegador. Permita pop-ups para fazer login.';
    case 'auth/network-request-failed':
      return 'Falha de conexão com a rede. Verifique sua conexão com a internet.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas consecutivas. Aguarde alguns instantes antes de tentar novamente.';
    default:
      return err?.message || 'Falha na autenticação do usuário.';
  }
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  wallet: UserWallet | null;
  ledger: LedgerEntry[];
  packages: CreditPackage[];
  isAdmin: boolean;
  refreshWallet: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  claimFreeBonus: () => Promise<{ success: boolean; message: string }>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logoutUser: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  reloadUser: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // Get current Bearer ID token for authorized API calls
  const getIdToken = async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    try {
      return await auth.currentUser.getIdToken(true);
    } catch {
      return null;
    }
  };

  // Check admin role from secure server route
  const checkAdminRole = async () => {
    if (!auth.currentUser) {
      setIsAdmin(false);
      return;
    }
    try {
      const token = await getIdToken();
      if (!token) {
        setIsAdmin(false);
        return;
      }
      const res = await fetch('/api/user/role', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIsAdmin(!!data.isAdmin);
      } else {
        setIsAdmin(false);
      }
    } catch {
      setIsAdmin(false);
    }
  };

  // Fetch Wallet and Ledger from secure backend
  const refreshWallet = async () => {
    if (!auth.currentUser) {
      setWallet(null);
      setLedger([]);
      return;
    }

    try {
      const token = await getIdToken();
      if (!token) return;

      const res = await fetch('/api/wallet', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setWallet(data.wallet);
        setLedger(data.ledger || []);
      }
    } catch (err) {
      console.warn('[AuthProvider] Erro ao sincronizar carteira:', err);
    }
  };

  // Fetch Packages catalog
  const fetchPackages = async () => {
    try {
      const res = await fetch('/api/packages');
      if (res.ok) {
        const data = await res.json();
        setPackages(data);
      }
    } catch (err) {
      console.warn('[AuthProvider] Erro ao buscar pacotes:', err);
    }
  };

  // Claim 25 Free credits once
  const claimFreeBonus = async (): Promise<{ success: boolean; message: string }> => {
    const token = await getIdToken();
    if (!token) {
      return { success: false, message: 'Usuário não autenticado.' };
    }

    try {
      const res = await fetch('/api/wallet/claim-free', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          message: data.error || data.details || 'Falha ao processar bônus gratuito.',
        };
      }
      await refreshWallet();
      return {
        success: data.success,
        message: data.message,
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao resgatar bônus.' };
    }
  };

  const refreshProfile = async () => {
    if (!auth.currentUser) {
      setProfile(null);
      return;
    }
    try {
      const token = await getIdToken();
      const updated = await syncUserProfileClient(auth.currentUser, { idToken: token });
      setProfile(updated);
    } catch (err) {
      console.warn('[AuthContext] Erro ao atualizar perfil:', err);
    }
  };

  // Auth operations
  const loginWithEmail = async (email: string, pass: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    if (cred.user) {
      const token = await cred.user.getIdToken().catch(() => null);
      const syncedProfile = await syncUserProfileClient(cred.user, { idToken: token });
      setProfile(syncedProfile);
      await refreshWallet();
      await checkAdminRole();
    }
  };

  const registerWithEmail = async (email: string, pass: string) => {
    // 1. Cria Firebase Auth
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    if (!cred.user) {
      throw new Error('Falha ao registrar usuário no Firebase Auth.');
    }

    // 2. Cria / sincroniza perfil no Firestore users/{uid} (com dados mínimos e seguros)
    let token: string | null = null;
    try {
      token = await cred.user.getIdToken();
      const syncedProfile = await syncUserProfileClient(cred.user, {
        isNewRegistration: true,
        idToken: token,
      });
      setProfile(syncedProfile);
    } catch (profileError: any) {
      console.error('[AuthContext] Falha na sincronização do perfil Firestore:', profileError);
      throw new Error(
        `Conta criada no Firebase Auth, porém ocorreu erro ao inicializar o perfil: ${
          profileError?.message || 'Falha de comunicação'
        }. Tente efetuar login para sincronizar.`
      );
    }

    // 3. Envia e-mail de verificação
    try {
      await sendEmailVerification(cred.user);
    } catch (emailErr) {
      console.warn('[AuthContext] Aviso no envio de verificação de e-mail:', emailErr);
    }

    // 4. Provisiona carteira e atualiza estado
    await refreshWallet();
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const cred = await signInWithPopup(auth, provider);
      if (cred.user) {
        const token = await cred.user.getIdToken().catch(() => null);
        const syncedProfile = await syncUserProfileClient(cred.user, { idToken: token });
        setProfile(syncedProfile);
        await refreshWallet();
        await checkAdminRole();
      }
    } catch (popupErr: any) {
      if (popupErr.code === 'auth/popup-blocked') {
        console.warn('[Auth] Popup bloqueado, tentando redirecionamento:', popupErr);
        await signInWithRedirect(auth, provider);
      } else {
        throw popupErr;
      }
    }
  };

  const logoutUser = async () => {
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setWallet(null);
    setLedger([]);
    setIsAdmin(false);
  };

  const sendVerificationEmail = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  const sendPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const reloadUser = async () => {
    const current = auth.currentUser;
    if (current) {
      try {
        await current.reload();
        // Force refresh ID token to get latest claims and email_verified state
        await current.getIdToken(true);
        // Atualizar estado com a instância genuína de User do Firebase Auth
        if (auth.currentUser) {
          setUser(auth.currentUser);
          const token = await auth.currentUser.getIdToken().catch(() => null);
          const updated = await syncUserProfileClient(auth.currentUser, { idToken: token });
          setProfile(updated);
        }
        await refreshWallet();
        await checkAdminRole();
      } catch (reloadErr) {
        console.warn('[AuthContext] Falha ao recarregar usuário:', reloadErr);
      }
    }
  };

  useEffect(() => {
    fetchPackages();

    // Processar retorno de redirecionamento Google (para navegadores móveis / popup bloqueado)
    getRedirectResult(auth)
      .then(async (cred) => {
        if (cred && cred.user) {
          const token = await cred.user.getIdToken().catch(() => null);
          const syncedProfile = await syncUserProfileClient(cred.user, { idToken: token });
          setProfile(syncedProfile);
        }
      })
      .catch((redirectErr) => {
        console.warn('[Auth] Erro ao processar redirect login:', redirectErr);
      });

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const token = await currentUser.getIdToken().catch(() => null);
          // Migração automática de usuários existentes sem users/{uid}
          const syncedProfile = await syncUserProfileClient(currentUser, { idToken: token });
          setProfile(syncedProfile);
        } catch (profErr) {
          console.warn('[AuthContext] Erro ao sincronizar perfil do usuário na sessão:', profErr);
        }
        await refreshWallet();
        await checkAdminRole();
      } else {
        setProfile(null);
        setWallet(null);
        setLedger([]);
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        wallet,
        ledger,
        packages,
        isAdmin,
        refreshWallet,
        refreshProfile,
        claimFreeBonus,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        logoutUser,
        sendVerificationEmail,
        sendPasswordReset,
        reloadUser,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser utilizado dentro de AuthProvider');
  }
  return ctx;
};
