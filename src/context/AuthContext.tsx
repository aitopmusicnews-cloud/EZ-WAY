import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  completeNewPassword as completeChallenge,
  isPublicShareLocation,
  NewPasswordChallenge,
  restoreSession,
  signIn as cognitoSignIn,
  signOut as cognitoSignOut,
} from '../services/auth';

interface AuthContextValue {
  authenticated: boolean;
  loading: boolean;
  challenge: NewPasswordChallenge | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  completeNewPassword: (password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const publicShare = typeof window !== 'undefined' && isPublicShareLocation(window.location.href);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(!publicShare);
  const [challenge, setChallenge] = useState<NewPasswordChallenge | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (publicShare) {
      setLoading(false);
      return () => { active = false; };
    }
    restoreSession()
      .then((ok) => { if (active) setAuthenticated(ok); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [publicShare]);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await cognitoSignIn(email, password);
      if (result.status === 'signed_in') {
        setAuthenticated(true);
        setChallenge(null);
      } else {
        setAuthenticated(false);
        setChallenge(result.challenge);
      }
    } catch (err: any) {
      setError(err?.message || 'Sign-in failed.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const completeNewPassword = async (password: string) => {
    if (!challenge) throw new Error('No password challenge is active.');
    setLoading(true);
    setError(null);
    try {
      await completeChallenge(challenge, password);
      setChallenge(null);
      setAuthenticated(true);
    } catch (err: any) {
      setError(err?.message || 'Password update failed.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    cognitoSignOut();
    setAuthenticated(false);
    setChallenge(null);
    setError(null);
  };

  const value = useMemo(() => ({
    authenticated, loading, challenge, error, signIn, completeNewPassword, signOut,
  }), [authenticated, loading, challenge, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
