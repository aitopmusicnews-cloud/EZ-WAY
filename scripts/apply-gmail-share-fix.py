from pathlib import Path

path = Path('src/components/ShareModal.tsx')
source = path.read_text()

anchor = """  const whatsappShareUrl = shareLink
    ? `https://wa.me/?text=${encodeURIComponent(`Hey, check out this master reference: ${shareLink}`)}`
    : '#';
"""
handler = """  const handleGmailShare = () => {
    if (!shareLink) return;
    try {
      window.location.assign(gmailShareUrl);
    } catch (error) {
      console.error('[ShareModal] Gmail navigation failed', error);
      addToast('Gmail could not be opened. Copy the share link and paste it into Gmail.', 'error');
    }
  };

"""
assert anchor in source
source = source.replace(anchor, handler + anchor, 1)

old = """                      <a
                        href={gmailShareUrl}
                        target=\"_blank\"
                        rel=\"noopener noreferrer\"
                        className=\"flex flex-col items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-white h-20 rounded-2xl text-[8px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all\"
                      >
                        <Mail className=\"w-5 h-5 text-orange-500\" /> Gmail
                      </a>
"""
new = """                      <button
                        type=\"button\"
                        onClick={handleGmailShare}
                        className=\"flex flex-col items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-white h-20 rounded-2xl text-[8px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all\"
                      >
                        <Mail className=\"w-5 h-5 text-orange-500\" /> Gmail
                      </button>
"""
assert old in source
source = source.replace(old, new, 1)

path.write_text(source)
