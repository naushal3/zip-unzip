import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { 
  FolderLock, 
  Mail, 
  Lock, 
  UserPlus, 
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { signUpWithEmail } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password || !confirmPassword) {
      return toast.error('Please fill in all input fields.');
    }

    if (password.length < 6) {
      return toast.error('Password must be at least 6 characters long.');
    }

    if (password !== confirmPassword) {
      return toast.error('Passwords do not match.');
    }

    setLoading(true);
    const loadingToast = toast.loading('Creating account...');
    try {
      await signUpWithEmail(email, password);
      toast.success('Account created successfully!', { id: loadingToast });
      navigate('/');
    } catch (err) {
      let friendlyMessage = err.message || 'Registration failed';
      if (err.code === 'auth/email-already-in-use') {
        friendlyMessage = 'An account already exists with this email address.';
      } else if (err.code === 'auth/invalid-email') {
        friendlyMessage = 'Please enter a valid email address.';
      } else if (err.code === 'auth/weak-password') {
        friendlyMessage = 'Password should be at least 6 characters.';
      }
      toast.error(friendlyMessage, { id: loadingToast });
    } finally {
      setLoading(false);
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
              Create Account
            </h1>
            <p className="text-xs text-[var(--text-muted)] font-medium mt-1">
              Join ZIP Manager Pro to store your workspace configs
            </p>
          </div>
        </div>

        {/* Register form */}
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
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Password
            </label>
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
                placeholder="Minimum 6 characters"
                className="w-full pl-11 pr-4 py-3 bg-[var(--input-bg)] border border-[var(--border-color)] focus:border-brand/50 rounded-xl text-sm transition-all outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                <Lock className="w-4.5 h-4.5" />
              </span>
              <input
                type="password"
                required
                disabled={loading}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
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
                <UserPlus className="w-4 h-4" />
                Sign Up
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-[var(--text-muted)] mt-8">
          Already have an account?{' '}
          <Link to="/login" className="text-brand hover:underline font-semibold">
            Sign In
          </Link>
        </p>

      </div>
    </div>
  );
}
