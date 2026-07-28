import React, { useState } from 'react';
import { X, UserPlus } from 'lucide-react';
import { useMediaStore } from '../context/MediaStoreContext';

export default function AddClientModal({ onClose }: { onClose: () => void; key?: string | number }) {
  const [formData, setFormData] = useState({ name: '', email: '' });
  const { addClient } = useMediaStore();

  const handleAdd = async () => {
    if (!formData.email) return;
    await addClient(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-8 border-b border-zinc-900 flex items-center justify-between">
          <h2 className="text-xl font-black uppercase tracking-tight">New Industry Contact</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-900 rounded-full transition-colors"><X/></button>
        </div>
        <div className="p-8 space-y-6">
          <div className="space-y-4">
            <label className="block">
              <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Display Name</span>
              <input 
                type="text" 
                value={formData.name} 
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-orange-500"
                placeholder="e.g. John Doe"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Email Address</span>
              <input 
                type="email" 
                value={formData.email} 
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-orange-500"
                placeholder="client@industry.com"
              />
            </label>
          </div>
          <button 
            onClick={handleAdd}
            className="w-full py-4 bg-white text-black rounded-full font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
          >
            <UserPlus className="w-4 h-4" /> Initialize Connection
          </button>
        </div>
      </div>
    </div>
  );
}
