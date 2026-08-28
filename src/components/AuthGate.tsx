import React from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isPublicShareLocation } from '../services/auth';
import AdminSignIn from './AdminSignIn';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { authenticated, loading } = useAuth();
  const publicShare = typeof window !== 'undefined' && isPublicShareLocation(window.location.href);

  if (publicShare) return <>{children}</>;

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          Securing workspace
        </div>
      </div>
    );
  }

  if (!authenticated) return <AdminSignIn />;
  return <>{children}</>;
}
