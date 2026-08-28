import React, { useState } from 'react';
import { LockKeyhole, Loader2, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AdminSignIn() {
  const { challenge, completeNewPassword, error, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (challenge) await completeNewPassword(newPassword);
      else await signIn(email, password);
    } catch {
      // AuthContext exposes the safe user-facing error.
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-[2rem] border border-zinc-800 bg-zinc-950 p-8 shadow-2xl">
        <div className="mb-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-black">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-500">EZ-WAY Owner Access</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Secure workspace sign in</h1>
          <p className="mt-2 text-sm text-zinc-500">
            {challenge ? 'Choose your permanent password to finish account setup.' : 'Sign in to manage your catalog and clients.'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {!challenge ? (
            <>
              <label className="block">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-zinc-500">Email</span>
                <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-black px-4">
                  <Mail className="h-4 w-4 text-zinc-600" />
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full bg-transparent py-4 text-sm outline-none"
                    required
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-zinc-500">Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-zinc-800 bg-black px-4 py-4 text-sm outline-none focus:border-orange-500"
                  required
                />
              </label>
            </>
          ) : (
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-zinc-500">New permanent password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={12}
                className="w-full rounded-2xl border border-zinc-800 bg-black px-4 py-4 text-sm outline-none focus:border-orange-500"
                required
              />
              <span className="mt-2 block text-[10px] text-zinc-600">Use at least 12 characters with uppercase, lowercase, a number, and a symbol.</span>
            </label>
          )}

          {error && <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-300">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-xs font-black uppercase tracking-widest text-black transition hover:bg-zinc-200 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {challenge ? 'Set password & enter' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
