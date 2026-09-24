import React, { useState } from 'react';
import { useAuth, getFriendlyAuthErrorMessage } from '../services/AuthContext';
import { User, LogIn, UserPlus, Key, Mail, ShieldAlert, CheckCircle } from 'lucide-react';

export const AuthModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const {
    user,
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    logoutUser,
    sendPasswordReset,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
        onClose();
      } else if (mode === 'register') {
        await registerWithEmail(email, password);
        setFeedback({
          message: 'Conta criada com sucesso! Enviamos um link de verificação para o seu e-mail. Verifique sua caixa de entrada para desbloquear seus 25 créditos.',
          isError: false,
        });
      } else if (mode === 'forgot') {
        await sendPasswordReset(email);
        setFeedback({
          message: 'E-mail de recuperação enviado com sucesso!',
          isError: false,
        });
      }
    } catch (err: any) {
      setFeedback({
        message: getFriendlyAuthErrorMessage(err),
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      await loginWithGoogle();
      onClose();
    } catch (err: any) {
      setFeedback({
        message: getFriendlyAuthErrorMessage(err),
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#090f1a] border border-cyan-500/50 rounded-xl shadow-2xl p-5 text-slate-100 space-y-4">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold font-mono text-white uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-cyan-400" />
              <span>{user ? 'PERFIL DO INVESTIGADOR' : 'ACESSO AO SISTEMA'}</span>
            </h2>
            <p className="text-[11px] text-slate-400 font-mono">
              Froc Sobrenatural Caça Fantasma · Firebase Auth
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 font-mono text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {user ? (
          /* Usuário Logado */
          <div className="space-y-4 font-mono text-xs">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">E-mail Cadastrado:</span>
                <strong className="text-white text-sm">{user.email}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">Status de Verificação:</span>
                <span className={`inline-flex items-center gap-1 font-bold ${user.emailVerified ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {user.emailVerified ? <CheckCircle className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                  <span>{user.emailVerified ? 'E-mail Verificado (Apto ao bônus)' : 'E-mail Não Verificado'}</span>
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">Identificador UID:</span>
                <span className="text-slate-400 text-[10px]">{user.uid}</span>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={logoutUser}
                className="px-4 py-2 bg-rose-950 hover:bg-rose-900 border border-rose-600/50 text-rose-200 rounded text-xs font-mono font-bold cursor-pointer transition"
              >
                Encerrar Sessão (Logout)
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-mono cursor-pointer"
              >
                Continuar
              </button>
            </div>
          </div>
        ) : (
          /* Formulário de Login / Registro */
          <div className="space-y-4">
            <div className="flex border-b border-slate-800 text-xs font-mono">
              <button
                onClick={() => setMode('login')}
                className={`flex-1 pb-2 border-b-2 font-semibold transition cursor-pointer ${
                  mode === 'login'
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Entrar
              </button>
              <button
                onClick={() => setMode('register')}
                className={`flex-1 pb-2 border-b-2 font-semibold transition cursor-pointer ${
                  mode === 'register'
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Criar Conta
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1 uppercase">E-mail:</label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="investigador@froc.app"
                    className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-700 rounded text-white focus:outline-none focus:border-cyan-400 font-sans text-xs"
                  />
                </div>
              </div>

              {mode !== 'forgot' && (
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 uppercase">Senha:</label>
                  <div className="relative">
                    <Key className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-700 rounded text-white focus:outline-none focus:border-cyan-400 font-sans text-xs"
                    />
                  </div>
                </div>
              )}

              {feedback && (
                <div
                  className={`p-2.5 rounded text-[11px] ${
                    feedback.isError ? 'bg-rose-950/80 text-rose-300 border border-rose-800' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded cursor-pointer transition shadow"
              >
                {loading
                  ? 'Processando...'
                  : mode === 'login'
                  ? 'Entrar no Sistema'
                  : mode === 'register'
                  ? 'Cadastrar & Obter 25 Créditos'
                  : 'Recuperar Senha'}
              </button>

              <div className="text-center pt-1">
                {mode === 'login' ? (
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-[10px] text-slate-400 hover:text-cyan-300 underline cursor-pointer"
                  >
                    Esqueceu sua senha?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-[10px] text-slate-400 hover:text-cyan-300 underline cursor-pointer"
                  >
                    Já tem conta? Clique para entrar
                  </button>
                )}
              </div>
            </form>

            <div className="pt-2 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={handleGoogle}
                disabled={loading}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded text-xs font-mono cursor-pointer transition flex items-center justify-center gap-2"
              >
                <span>Entrar com Conta Google</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
