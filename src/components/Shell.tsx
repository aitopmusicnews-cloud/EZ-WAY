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
  Cpu,
  Menu,
  X,
  Disc,
  ChevronDown,
  ChevronUp,
  ListMusic,
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
  const [showMoreTools, setShowMoreTools] = useState(false);

  const primaryItems = [
    { id: 'playlists', label: 'Playlists', icon: ListMusic },
    { id: 'tracks', label: 'Tracks', icon: Music },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ];

  const secondaryItems = [
    { id: 'analyzer', label: 'A&R Analyzer', icon: Cpu },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'videos', label: 'Videos', icon: Video },
    { id: 'youtube', label: 'YouTube Hub', icon: Youtube },
    { id: 'releases', label: 'Releases', icon: Disc },
    { id: 'sharing', label: 'Sharing', icon: Share2 },
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const secondaryActive = secondaryItems.some((item) => item.id === activeView);

  const handleMobileNav = (viewId: string) => {
    onViewChange(viewId);
    setIsMobileMenuOpen(false);
  };

  const NavItem = ({ item, mobile = false }: { item: (typeof primaryItems)[number]; mobile?: boolean }) => (
    <button
      key={item.id}
      onClick={() => mobile ? handleMobileNav(item.id) : onViewChange(item.id)}
      className={cn(
        'w-full flex items-center rounded-xl font-black uppercase tracking-widest transition-all',
        mobile ? 'gap-4 px-4 py-3.5 text-xs' : 'gap-3 px-3 py-2.5 text-[11px]',
        activeView === item.id
          ? 'bg-zinc-900 text-orange-500 border border-zinc-800'
          : 'text-zinc-500 hover:text-white hover:bg-zinc-900/50',
        item.id === 'playlists' && activeView !== item.id && 'text-zinc-300',
      )}
    >
      <item.icon className={cn(mobile ? 'w-5 h-5' : 'w-4 h-4', item.id === 'playlists' && 'text-orange-500')} />
      {item.label}
    </button>
  );

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-black text-white overflow-hidden">
      <header className="lg:hidden flex items-center justify-between px-5 py-4 border-b border-zinc-900 bg-black/95 backdrop-blur-md sticky top-0 z-40 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden border border-zinc-800 bg-zinc-950">
            <img src="/ogbeatz_logo.svg" alt="THE BEATZ WAY Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <span className="font-make tracking-tighter text-lg uppercase italic font-black">THE BEATZ WAY</span>
            <p className="text-[8px] uppercase tracking-[0.22em] text-zinc-600 font-black">Playlist workspace</p>
          </div>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 -mr-2 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          aria-label="Toggle navigation menu"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 top-[65px] bg-black/95 z-40 flex flex-col p-5 overflow-y-auto"
          >
            <motion.nav
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -16, opacity: 0 }}
              className="space-y-1.5"
            >
              <div className="pb-2 mb-2 border-b border-zinc-900">
                <p className="px-4 mb-2 text-[9px] font-black uppercase tracking-[0.24em] text-zinc-700">Main workspace</p>
                {primaryItems.map((item) => <NavItem key={item.id} item={item} mobile />)}
              </div>

              <button
                onClick={() => setShowMoreTools((value) => !value)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-black uppercase tracking-widest text-zinc-500"
              >
                <span>More tools</span>
                {showMoreTools ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <AnimatePresence initial={false}>
                {(showMoreTools || secondaryActive) && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-1 overflow-hidden">
                    {secondaryItems.map((item) => <NavItem key={item.id} item={item} mobile />)}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.nav>

            <div className="border-t border-zinc-900 pt-5 mt-auto">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center shrink-0 relative">
                  <Shield className="w-4 h-4 text-orange-500" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-black" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wide text-white">THE BEATZ WAY Admin</span>
                  <p className="text-[8px] font-mono tracking-widest text-emerald-500 uppercase mt-0.5 font-bold">Active now</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <aside className="hidden lg:flex w-56 border-r border-zinc-900 flex-col p-4 h-full shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 mb-5 shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden border border-zinc-800 bg-zinc-950">
            <img src="/ogbeatz_logo.svg" alt="THE BEATZ WAY Logo" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <span className="font-make tracking-tighter text-lg uppercase italic font-black whitespace-nowrap">THE BEATZ WAY</span>
            <p className="text-[8px] uppercase tracking-[0.2em] text-zinc-700 font-black">Playlist workspace</p>
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto pr-1">
          <p className="px-3 mb-2 text-[9px] font-black uppercase tracking-[0.24em] text-zinc-700">Main</p>
          <div className="space-y-1">
            {primaryItems.map((item) => <NavItem key={item.id} item={item} />)}
          </div>

          <div className="mt-5 pt-4 border-t border-zinc-900">
            <button
              onClick={() => setShowMoreTools((value) => !value)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 text-[9px] font-black uppercase tracking-[0.22em] transition-colors',
                secondaryActive ? 'text-orange-500' : 'text-zinc-700 hover:text-zinc-400',
              )}
            >
              <span>More tools</span>
              {showMoreTools ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <AnimatePresence initial={false}>
              {(showMoreTools || secondaryActive) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-1 overflow-hidden mt-1"
                >
                  {secondaryItems.map((item) => <NavItem key={item.id} item={item} />)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </nav>

        <div className="border-t border-zinc-900 pt-4 mt-4 shrink-0">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center shrink-0 relative">
              <Shield className="w-4 h-4 text-orange-500" />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-black" />
            </div>
            <div className="min-w-0">
              <span className="text-[9px] font-black uppercase tracking-wide truncate text-white block">OGBeatz Admin</span>
              <p className="text-[8px] font-mono tracking-widest text-emerald-500 uppercase mt-0.5 font-bold">Active now</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-black">
        {children}
      </main>
    </div>
  );
}
