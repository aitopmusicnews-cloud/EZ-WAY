import React, { useState } from 'react';
import { X, Copy, Mail, MessageCircle, Check, Send, User, Download, Lock, MessageSquare, Share2, Facebook } from 'lucide-react';
import { Track, Playlist, Client } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useMediaStore } from '../context/MediaStoreContext';
import { cn } from '../lib/utils';

interface ShareModalProps {
  track?: Track;
  playlist?: Playlist;
  onClose: () => void;
  key?: string | number;
}

export default function ShareModal({ track, playlist, onClose }: ShareModalProps) {
  const { clients, addShareLink, connected } = useMediaStore();
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [downloadEnabled, setDownloadEnabled] = useState(false);
  const [expiresIn, setExpiresIn] = useState<string>('7d');
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<'select' | 'options' | 'result'>('select');

  const assetName = track?.name || playlist?.name || 'Untitled';
  const assetType = track ? 'Track' : 'Playlist';

  const handleGenerateLink = async () => {
    // Calculate expiration date
    let expiresAt: string | undefined;
    if (expiresIn !== 'never') {
        const date = new Date();
        const days = parseInt(expiresIn);
        date.setDate(date.getDate() + days);
        expiresAt = date.toISOString();
    }

    const link = await addShareLink({
      track_id: track?.id,
      playlist_id: playlist?.id,
      download_enabled: downloadEnabled,
      client_id: selectedClient?.id,
      expires_at: expiresAt
    });
    // Keep link short and clean, avoiding massive encoded data or blob URLs
    let url = `${window.location.origin}/?share=${link.token}`;
    if (!connected) {
      if (track?.name || playlist?.name) {
        url += `&name=${encodeURIComponent(track?.name || playlist?.name || '')}`;
      }
      const coverUrl = track?.image_url || playlist?.image_url;
      if (coverUrl && !coverUrl.startsWith('blob:') && !coverUrl.startsWith('data:') && coverUrl.length < 200) {
        url += `&coverImage=${encodeURIComponent(coverUrl)}`;
      }
    }
    setShareLink(url);
    setStep('result');
  };

  const copyToClipboard = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleEmailShare = () => {
    if (!shareLink) return;
    const subject = encodeURIComponent(`Master Reference: ${assetName}`);
    const body = encodeURIComponent(`Hey,\n\nI've uploaded a new master for you to review: ${assetName}.\n\nYou can listen and provide feedback here: ${shareLink}\n\nBest,\nOGBeatz`);
    window.location.href = `mailto:${selectedClient?.email || ''}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative w-full max-w-lg bg-zinc-950 border border-zinc-900 rounded-[3rem] shadow-2xl overflow-hidden"
      >
        <div className="p-8 space-y-8">
           <div className="flex items-center justify-between">
              <div>
                 <h2 className="text-2xl font-black tracking-tighter uppercase italic">Share {assetType}</h2>
                 <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mt-1">Distribute reference to industry partners.</p>
              </div>
              <button 
                onClick={onClose}
                className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center text-zinc-500 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
           </div>

           <div className="min-h-[300px]">
              {step === 'select' && (
                <div className="space-y-6">
                   <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                      <User className="w-3 h-3" /> Select Recipient
                   </div>
                   <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                      {clients.map(client => (
                        <button 
                          key={client.id}
                          onClick={() => setSelectedClient(client)}
                          className={cn(
                            "flex items-center gap-4 p-4 rounded-2xl border transition-all text-left",
                            selectedClient?.id === client.id ? "bg-orange-500 border-orange-400 text-black shadow-lg shadow-orange-500/20" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                          )}
                        >
                           <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center font-black", selectedClient?.id === client.id ? "bg-black text-orange-500" : "bg-zinc-800 text-zinc-500")}>
                              {client.name[0]}
                           </div>
                           <div className="min-w-0">
                              <p className={cn("text-sm font-black uppercase tracking-tight truncate", selectedClient?.id === client.id ? "text-black" : "text-white")}>{client.name}</p>
                              <p className={cn("text-[10px] font-bold truncate", selectedClient?.id === client.id ? "text-black/60" : "text-zinc-600")}>{client.email}</p>
                           </div>
                        </button>
                      ))}
                      {clients.length === 0 && (
                        <div className="text-center py-8 bg-zinc-900/50 rounded-2xl border border-dashed border-zinc-800">
                           <p className="text-xs text-zinc-600 font-bold uppercase">No clients found</p>
                        </div>
                      )}
                   </div>
                   <button 
                     onClick={() => setStep('options')}
                     disabled={!selectedClient && clients.length > 0}
                     className="w-full bg-white text-black h-14 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale"
                   >
                     Configure Access
                   </button>
                </div>
              )}

              {step === 'options' && (
                <div className="space-y-8">
                   <div className="flex items-center gap-4 p-6 bg-zinc-900/50 rounded-[2rem] border border-zinc-900">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0">
                         <img src={track?.image_url || playlist?.image_url || '/ogbeatz_logo.svg'} className="w-full h-full object-cover" />
                      </div>
                      <div>
                         <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">{assetType}</p>
                         <h3 className="text-lg font-black tracking-tighter uppercase line-clamp-1">{assetName}</h3>
                         <p className="text-xs text-zinc-500 font-bold">Sharing with {selectedClient?.name || 'Public'}</p>
                      </div>
                   </div>

                   <div className="space-y-4">
                      <div className="flex items-center justify-between p-5 bg-zinc-900 rounded-2xl border border-zinc-800">
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-zinc-950 flex items-center justify-center text-zinc-500">
                               <Download className="w-5 h-5" />
                            </div>
                            <div>
                               <p className="text-sm font-black uppercase tracking-tight">Enable Downloads</p>
                               <p className="text-[10px] text-zinc-600 font-bold uppercase">Allow recipient to save master file</p>
                            </div>
                         </div>
                         <button 
                           onClick={() => setDownloadEnabled(!downloadEnabled)}
                           className={cn("w-12 h-6 rounded-full transition-all relative", downloadEnabled ? "bg-orange-500" : "bg-zinc-800")}
                         >
                            <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", downloadEnabled ? "right-1" : "left-1")} />
                         </button>
                      </div>

                      <div className="flex items-center justify-between p-5 bg-zinc-900 rounded-2xl border border-zinc-800">
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-zinc-950 flex items-center justify-center text-zinc-500">
                               <Lock className="w-5 h-5" />
                            </div>
                            <div>
                               <p className="text-sm font-black uppercase tracking-tight">Watermark Stream</p>
                               <p className="text-[10px] text-zinc-600 font-bold uppercase">Always active for preview sets</p>
                            </div>
                         </div>
                         <div className="text-[10px] font-black text-orange-500 uppercase">Enforced</div>
                      </div>

                      <div className="space-y-3">
                         <label className="text-[10px] font-black uppercase tracking-widest text-zinc-600 block ml-1">Access Expiration</label>
                         <div className="grid grid-cols-4 gap-2">
                            {[
                              { label: '24H', value: '1d' },
                              { label: '7 Days', value: '7d' },
                              { label: '30 Days', value: '30d' },
                              { label: 'Never', value: 'never' }
                            ].map(opt => (
                              <button 
                                key={opt.value}
                                onClick={() => setExpiresIn(opt.value)}
                                className={cn(
                                  "py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                                  expiresIn === opt.value ? "bg-orange-500 border-orange-400 text-black" : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                                )}
                              >
                                {opt.label}
                              </button>
                            ))}
                         </div>
                      </div>
                   </div>

                   <div className="flex gap-3">
                      <button 
                        onClick={() => setStep('select')}
                        className="flex-1 bg-zinc-900 text-white h-14 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-zinc-800 transition-all"
                      >
                        Back
                      </button>
                      <button 
                        onClick={handleGenerateLink}
                        className="flex-[2] bg-white text-black h-14 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-[0.98] transition-all"
                      >
                        Generate Link
                      </button>
                   </div>
                </div>
              )}

              {step === 'result' && (
                <div className="space-y-8 text-center py-4">
                   <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
                      <Check className="w-10 h-10" />
                   </div>
                   <div>
                      <h3 className="text-2xl font-black uppercase tracking-tighter">Portal Ready</h3>
                      <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mt-2">Secure access link generated successfully.</p>
                   </div>

                   <div className="relative flex items-center bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden group">
                      <input 
                        readOnly
                        value={shareLink || ''}
                        className="w-full bg-transparent py-4 text-center pl-4 pr-12 text-xs font-mono text-orange-500 focus:outline-none select-all truncate font-semibold"
                      />
                      <button 
                        onClick={copyToClipboard}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-all cursor-pointer hover:border-zinc-700"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                   </div>

                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button 
                        onClick={handleEmailShare}
                        className="flex flex-col items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-white h-20 rounded-2xl text-[8px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all"
                      >
                        <Mail className="w-5 h-5 text-orange-500" /> Gmail
                      </button>
                      <button 
                        onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent('Hey, check out this master reference: ' + shareLink)}`)}
                        className="flex flex-col items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-white h-20 rounded-2xl text-[8px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all"
                      >
                        <MessageCircle className="w-5 h-5 text-emerald-500" /> WhatsApp
                      </button>
                      <button 
                        onClick={() => window.open(`fb-messenger://share/?link=${encodeURIComponent(shareLink!)}`)}
                        className="flex flex-col items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-white h-20 rounded-2xl text-[8px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all"
                      >
                        <Share2 className="w-5 h-5 text-blue-500" /> Messenger
                      </button>
                      <button 
                        onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink!)}`)}
                        className="flex flex-col items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-white h-20 rounded-2xl text-[8px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all"
                      >
                        <Facebook className="w-5 h-5 text-blue-600" /> Facebook
                      </button>
                   </div>

                   <button 
                     onClick={onClose}
                     className="w-full bg-white text-black h-14 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] transition-all"
                   >
                     Done
                   </button>
                </div>
              )}
           </div>
        </div>
      </motion.div>
    </div>
  );
}
