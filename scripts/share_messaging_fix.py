from pathlib import Path

modal_path = Path('src/components/ShareModal.tsx')
modal = modal_path.read_text()
old_store = "  const { clients, addShareLink, connected } = useMediaStore();"
new_store = "  const { clients, addShareLink, connected, addToast } = useMediaStore();"
assert old_store in modal
modal = modal.replace(old_store, new_store, 1)

start = modal.index("  const handleEmailShare = () => {")
end = modal.index("\n\n  return (", start)
new_share_helpers = r'''  const shareSubject = `Master Reference: ${assetName}`;
  const shareBody = `Hey,\n\nI've uploaded a new master for you to review: ${assetName}.\n\nYou can listen and provide feedback here: ${shareLink || ''}\n\nBest,\nOGBeatz`;
  const gmailShareUrl = shareLink
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(selectedClient?.email || '')}&su=${encodeURIComponent(shareSubject)}&body=${encodeURIComponent(shareBody)}`
    : '#';
  const whatsappShareUrl = shareLink
    ? `https://wa.me/?text=${encodeURIComponent(`Hey, check out this master reference: ${shareLink}`)}`
    : '#';
  const facebookShareUrl = shareLink
    ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`
    : '#';

  const handleMessengerShare = async () => {
    if (!shareLink) return;
    const payload = {
      title: shareSubject,
      text: `Check out this master reference: ${assetName}`,
      url: shareLink,
    };
    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareLink);
      addToast('Share link copied. Paste it into Messenger.', 'info');
    } catch {
      addToast('Opening Messenger. Copy the share link above if needed.', 'info');
    }
    window.location.assign('https://www.messenger.com/');
  };'''
modal = modal[:start] + new_share_helpers + modal[end:]

grid_start = modal.index('                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">')
grid_end = modal.index('\n\n                   <button \n                     onClick={onClose}', grid_start)
new_grid = '''                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <a
                        href={gmailShareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-white h-20 rounded-2xl text-[8px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all"
                      >
                        <Mail className="w-5 h-5 text-orange-500" /> Gmail
                      </a>
                      <a
                        href={whatsappShareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-white h-20 rounded-2xl text-[8px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all"
                      >
                        <MessageCircle className="w-5 h-5 text-emerald-500" /> WhatsApp
                      </a>
                      <button
                        onClick={handleMessengerShare}
                        className="flex flex-col items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-white h-20 rounded-2xl text-[8px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all"
                      >
                        <Share2 className="w-5 h-5 text-blue-500" /> Messenger
                      </button>
                      <a
                        href={facebookShareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-white h-20 rounded-2xl text-[8px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all"
                      >
                        <Facebook className="w-5 h-5 text-blue-600" /> Facebook
                      </a>
                   </div>'''
modal = modal[:grid_start] + new_grid + modal[grid_end:]
modal_path.write_text(modal)

handler_path = Path('aws/app-data/api/handler.mjs')
handler = handler_path.read_text()
old_query = "SELECT * FROM messages WHERE client_id = CAST(:client_id AS uuid) AND direction = 'inbound' ORDER BY timestamp ASC"
new_query = "SELECT * FROM messages WHERE client_id = CAST(:client_id AS uuid) ORDER BY timestamp ASC"
assert handler.count(old_query) == 1
handler = handler.replace(old_query, new_query, 1)
handler_path.write_text(handler)

portal_path = Path('src/components/SharePortal.tsx')
portal = portal_path.read_text()
p_start = portal.index('  const historicalComments = useMemo(() => messages')
p_end = portal.index('  const progressPct =', p_start)
new_conversation = r'''  const conversationMessages = useMemo(() => messages
    .filter((message) => {
      const clientMatches = shareLink.client_id ? message.client_id === shareLink.client_id : true;
      return clientMatches && (message.direction === 'outbound' || message.direction === 'inbound');
    })
    .map((message) => ({
      id: message.id,
      user: message.direction === 'outbound' ? 'OGBeatz' : 'Industry Client',
      text: message.content
        .replace(/^\[Feedback on [^\]]+\]:\s*/i, '')
        .replace(/^\[Industry Feedback on [^\]]+\]:\s*/i, '')
        .replace(/^\[Mix Approval\]:\s*/i, '👍 ')
        .replace(/^\[Revision Request\]:\s*/i, '👎 '),
      time: new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    })), [messages, shareLink.client_id]);

  const comments = [
    ...localComments,
    ...conversationMessages.filter((item) => !localComments.some((local) => local.id === item.id)),
  ];
'''
portal = portal[:p_start] + new_conversation + portal[p_end:]
portal = portal.replace('Review History</div>', 'Messages & Review History</div>', 1)
portal_path.write_text(portal)

Path('.github/workflows/share-messaging-fix-once.yml').unlink(missing_ok=True)
Path('scripts/share_messaging_fix.py').unlink(missing_ok=True)
