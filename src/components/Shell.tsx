import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Music, 
  Users, 
  MessageSquare, 
  Settings, 
  Activity, 
  Share2, 
  Video, 
  Shield, 
  Youtube,
  Sparkles,
  Cpu,
  Menu,
  X,
  Disc
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface ShellProps {
  children: React.ReactNode;
  activeView: string;
  onViewChange: (view: any) => void;
}

export default function Shell({ children, activeView, onViewChange }: ShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'tracks', label: 'Tracks', icon: Music },
    { id: 'analyzer', label: 'A&R Analyzer', icon: Cpu },
    { id: 'playlists', label: 'Playlists', icon: LayoutDashboard }, // Using LayoutDashboard for playlists for now
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'videos', label: 'Videos', icon: Video },
    { id: 'youtube', label: 'YouTube Hub', icon: Youtube },
    { id: 'releases', label: 'Releases', icon: Disc },
    { id: 'sharing', label: 'Sharing', icon: Share2 },
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleMobileNav = (viewId: string) => {
    onViewChange(viewId);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-black text-white overflow-hidden">
      {/* Mobile Sticky Header */}
      <header className="lg:hidden flex items-center justify-between px-6 py-4 border-b border-zinc-900 bg-black/95 backdrop-blur-md sticky top-0 z-40 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden border border-zinc-800 bg-zinc-950">
            <img src="/ogbeatz_logo.svg" alt="THE BEATZ WAY Logo" className="w-full h-full object-cover" />
          </div>
          <span className="font-make tracking-tighter text-lg uppercase italic font-black">THE BEATZ WAY</span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 -mr-2 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          aria-label="Toggle navigation menu"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Mobile Animated Drawer Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 top-[65px] bg-black/95 z-40 flex flex-col justify-between p-6 overflow-y-auto"
          >
            <motion.nav 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-1.5"
            >
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleMobileNav(item.id)}
                  className={cn(
                    "w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                    activeView === item.id 
                      ? "bg-zinc-900 text-orange-500 border border-zinc-800" 
                      : "text-zinc-400 hover:text-white hover:bg-zinc-900/40"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              ))}
            </motion.nav>

            {/* Mobile User Profile Footer */}
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ delay: 0.2 }}
              className="border-t border-zinc-900 pt-6 mt-8"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center text-orange-550 shrink-0 relative">
                  <Shield className="w-5 h-5 text-orange-500" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-black" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 leading-none">
                    <span className="text-[10px] font-black uppercase tracking-wide text-white">THE BEATZ WAY Admin</span>
                  </div>
                  <p className="text-[8px] font-mono tracking-widest text-[#10b981] uppercase mt-0.5 font-bold">
                    ACTIVE NOW
                  </p>
                  <div className="inline-block px-1.5 py-0.5 bg-orange-500/10 border border-orange-500/20 rounded-md mt-1">
                    <span className="text-[7px] font-mono font-black text-orange-400 tracking-widest uppercase">PRO PRODUCER</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 border-r border-zinc-900 flex-col p-6 space-y-8 h-full justify-between shrink-0">
        <div className="space-y-8 flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-3 px-2 shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden border border-zinc-800 bg-zinc-950">
              <img src="/ogbeatz_logo.svg" alt="THE BEATZ WAY Logo" className="w-full h-full object-cover" />
            </div>
            <span className="font-make tracking-tighter text-xl uppercase italic font-black">THE BEATZ WAY</span>
          </div>

          <nav className="flex-1 space-y-2 overflow-y-auto pr-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "w-full flex items-center gap-4 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                  activeView === item.id 
                    ? "bg-zinc-900 text-orange-500 border border-zinc-800" 
                    : "text-zinc-500 hover:text-white hover:bg-zinc-900/50"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* User Identity Profile Footer */}
        <div className="border-t border-zinc-900 pt-6 mt-auto shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center text-orange-550 shrink-0 relative">
              <Shield className="w-5 h-5 text-orange-500" />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-black" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="text-[10px] font-black uppercase tracking-wide truncate text-white">OB OGBeatz Admin</span>
              </div>
              <p className="text-[8px] font-mono tracking-widest text-[#10b981] uppercase mt-0.5 font-bold flex items-center gap-1">
                <span>ACTIVE NOW</span>
              </p>
              <div className="inline-block px-1.5 py-0.5 bg-orange-500/10 border border-orange-500/20 rounded-md mt-1">
                <span className="text-[7px] font-mono font-black text-orange-400 tracking-widest uppercase">PRO PRODUCER</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-black">
        {children}
      </main>
    </div>
  );
}
