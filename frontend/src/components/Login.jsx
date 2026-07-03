import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { 
  FolderLock, 
  Mail, 
  Lock, 
  LogIn, 
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { loginWithEmail, loginWithGoogle, resetPassword } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      return toast.error('Please enter both email and password.');
    }

    setLoading(true);
    const loadingToast = toast.loading('Signing in...');
    try {
      await loginWithEmail(email, password);
      toast.success('Successfully logged in!', { id: loadingToast });
      navigate('/');
    } catch (err) {
      let friendlyMessage = err.message || 'Login failed';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        friendlyMessage = 'Invalid email or password.';
      }
      toast.error(friendlyMessage, { id: loadingToast });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const loadingToast = toast.loading('Connecting to Google...');
    try {
      await loginWithGoogle();
      toast.success('Successfully logged in with Google!', { id: loadingToast });
      navigate('/');
    } catch (err) {
      toast.error(err.message || 'Google sign-in failed.', { id: loadingToast });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      return toast.error('Please enter your email address in the input field first.');
    }

    setResetLoading(true);
    const loadingToast = toast.loading('Sending password reset email...');
    try {
      await resetPassword(email);
      toast.success('Password reset email sent! Check your inbox.', { id: loadingToast });
    } catch (err) {
      let friendlyMessage = err.message || 'Failed to send reset email.';
      if (err.code === 'auth/user-not-found') {
        friendlyMessage = 'No account found with this email.';
      }
      toast.error(friendlyMessage, { id: loadingToast });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] transition-colors duration-300 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Visual background details */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-brand/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      <Toaster 
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--bg-card)',
            color: 'var(--text-main)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px'
          }
        }}
      />

      <div className="glass-panel w-full max-w-md rounded-[24px] shadow-2xl p-8 border-[var(--border-color)] relative z-10 animate-[fadeIn_0.4s_ease-out]">
        
        {/* Logo and title */}
        <div className="flex flex-col items-center gap-2.5 mb-8 text-center">
          <div className="p-3 bg-brand/15 text-brand rounded-2xl shadow-[0_0_20px_rgba(139,92,246,0.2)]">
            <FolderLock className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-brand to-indigo-400 bg-clip-text text-transparent">
              ZIP Manager Pro
            </h1>
            <p className="text-xs text-[var(--text-muted)] font-medium mt-1">
              Sign in to manage your file archives safely
            </p>
          </div>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                <Mail className="w-4.5 h-4.5" />
              </span>
              <input
                type="email"
                required
                disabled={loading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-11 pr-4 py-3 bg-[var(--input-bg)] border border-[var(--border-color)] focus:border-brand/50 rounded-xl text-sm transition-all outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Password
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetLoading || loading}
                className="text-xs text-brand hover:underline font-semibold transition-all active:scale-95"
              >
                Forgot?
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                <Lock className="w-4.5 h-4.5" />
              </span>
              <input
                type="password"
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3 bg-[var(--input-bg)] border border-[var(--border-color)] focus:border-brand/50 rounded-xl text-sm transition-all outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 gradient-btn font-semibold rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Separator */}
        <div className="relative my-6 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--border-color)]"></div>
          </div>
          <span className="relative px-3 text-xs text-[var(--text-muted)] bg-[var(--bg-card)] uppercase tracking-wider font-semibold">
            Or Continue With
          </span>
        </div>

        {/* Google sign-in */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full py-3 px-4 bg-[var(--bg-card)] hover:bg-[var(--input-bg)] border border-[var(--border-color)] hover:border-brand/40 text-[var(--text-main)] font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
        >
          <svg className="w-4.5 h-4.5 mr-1" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Google Account
        </button>

        {/* Footer */}
        <p className="text-center text-xs text-[var(--text-muted)] mt-8">
          Don't have an account yet?{' '}
          <Link to="/register" className="text-brand hover:underline font-semibold">
            Sign Up
          </Link>
        </p>

      </div>
    </div>
  );
}
