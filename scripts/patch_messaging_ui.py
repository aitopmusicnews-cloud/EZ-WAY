from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_exact(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Expected text not found in {path}: {old[:80]!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


def replace_regex(path: str, pattern: str, replacement: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'Expected one regex match in {path}, got {count}: {pattern[:80]!r}')
    target.write_text(updated, encoding='utf-8')


# MediaStoreContext: general attachment plumbing and durable S3 key preservation.
replace_exact(
    'src/context/MediaStoreContext.tsx',
    "import type { Track, Playlist, Client, Activity, ShareLink, UserProfile, Message, PromoVideo } from '@/src/types';",
    "import type { Track, Playlist, Client, Activity, ShareLink, UserProfile, Message, MessageAttachment, PromoVideo } from '@/src/types';",
)
replace_exact(
    'src/context/MediaStoreContext.tsx',
    "  sendMessage: (clientId: string, content: string, image_url?: string | null, direction?: 'inbound' | 'outbound') => Promise<void>;",
    "  sendMessage: (clientId: string, content: string, image_url?: string | null, direction?: 'inbound' | 'outbound', attachment?: MessageAttachment | null) => Promise<void>;",
)
replace_exact(
    'src/context/MediaStoreContext.tsx',
    "  if (normalized === 'messages' || normalized === 'message-image' || normalized === 'message_images') return 'message-image';",
    "  if (normalized === 'message-image' || normalized === 'message_images') return 'message-image';\n  if (normalized === 'messages' || normalized === 'message-attachment' || normalized === 'message_attachments') return 'message-attachment';",
)
replace_exact(
    'src/context/MediaStoreContext.tsx',
    "      ['thumbnail_url', 'thumbnail_key'],\n    ] as const;",
    "      ['thumbnail_url', 'thumbnail_key'],\n      ['attachment_url', 'attachment_key'],\n    ] as const;",
)
replace_regex(
    'src/context/MediaStoreContext.tsx',
    r"  const sendMessage = async \(clientId: string, content: string, image_url\?: string \| null, direction: 'inbound' \| 'outbound' = 'outbound'\) => \{.*?\n  \};\n\n  const addPromoVideo",
    """  const sendMessage = async (\n    clientId: string,\n    content: string,\n    image_url?: string | null,\n    direction: 'inbound' | 'outbound' = 'outbound',\n    attachment?: MessageAttachment | null,\n  ) => {\n    const client = clients.find((item) => item.id === clientId);\n    const candidate = withPendingKeys({\n      id: uuidv4(),\n      client_id: clientId,\n      recipient_id: direction === 'outbound' ? (client?.email || 'unknown@client.com') : 'producer@ogbeatz.com',\n      content,\n      image_url: image_url || null,\n      attachment_url: attachment?.attachment_url || null,\n      attachment_key: attachment?.attachment_key || null,\n      attachment_name: attachment?.attachment_name || null,\n      attachment_type: attachment?.attachment_type || null,\n      attachment_size: Number(attachment?.attachment_size || 0),\n      direction,\n      timestamp: new Date().toISOString(),\n      is_read: false,\n    } as Message);\n    try {\n      const saved = connected ? await dataStore.createMessage(candidate as Message) : candidate as Message;\n      setMessages((prev) => [...prev, saved]);\n      void addActivity({\n        type: 'social',\n        user: direction === 'inbound' ? (client?.name || 'Client') : 'OGBeatz',\n        action: direction === 'inbound' ? 'submitted feedback' : `Sent message to ${client?.name || 'Client'}`,\n        details: content || attachment?.attachment_name || 'Attachment',\n        client_id: clientId,\n      });\n    } catch (error: any) {\n      addToast(`Message failed: ${error?.message || error}`, 'error');\n      throw error;\n    }\n  };\n\n  const addPromoVideo""",
)

# Admin composer: keep the File object until send, upload it to S3, then persist attachment metadata.
replace_exact(
    'src/App.tsx',
    '  const [chatAttachment, setChatAttachment] = useState<string | null>(null);',
    '  const [chatAttachment, setChatAttachment] = useState<File | null>(null);',
)
replace_regex(
    'src/App.tsx',
    r"  const handleChatImageUpload = \(e: React\.ChangeEvent<HTMLInputElement>\) => \{.*?\n  \};",
    """  const handleChatAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {\n    const file = e.target.files?.[0] || null;\n    e.target.value = '';\n    if (!file) return;\n    if (file.size > 100 * 1024 * 1024) {\n      addToast('Message attachments are limited to 100 MB.', 'error');\n      return;\n    }\n    setChatAttachment(file);\n  };""",
)
replace_regex(
    'src/App.tsx',
    r"    const handleSendClientMessage = async \(\) => \{.*?\n    \};",
    """    const handleSendClientMessage = async () => {\n      if ((!clientMessageDraft.trim() && !chatAttachment) || !selectedMessageClientId) return;\n      try {\n        let attachment = null;\n        if (chatAttachment) {\n          const attachmentUrl = await uploadFile('messages', chatAttachment);\n          if (!attachmentUrl) throw new Error('Attachment upload failed.');\n          attachment = {\n            attachment_url: attachmentUrl,\n            attachment_name: chatAttachment.name,\n            attachment_type: chatAttachment.type || 'application/octet-stream',\n            attachment_size: chatAttachment.size,\n          };\n        }\n        await sendMessage(\n          selectedMessageClientId,\n          clientMessageDraft.trim(),\n          null,\n          'outbound',\n          attachment,\n        );\n        setClientMessageDraft('');\n        setChatAttachment(null);\n      } catch (error: any) {\n        addToast(`Message failed: ${error?.message || error}`, 'error');\n      }\n    };""",
)
replace_exact(
    'src/App.tsx',
    "                    {msg.content}\n                    <div",
    """                    {msg.attachment_url && (\n                      <a\n                        href={msg.attachment_url}\n                        target=\"_blank\"\n                        rel=\"noreferrer\"\n                        download={msg.attachment_name || undefined}\n                        className=\"mt-4 flex items-center gap-3 rounded-2xl border border-current/20 bg-black/10 px-4 py-3 text-xs font-black\"\n                      >\n                        <FileArchive className=\"w-5 h-5 shrink-0\" />\n                        <span className=\"truncate\">{msg.attachment_name || 'Download attachment'}</span>\n                      </a>\n                    )}\n                    {msg.content}\n                    <div""",
)
replace_regex(
    'src/App.tsx',
    r"                  \{chatAttachment && \(\n                    <div className=\"absolute bottom-full.*?\n                  \)\}\n                  <textarea",
    """                  {chatAttachment && (\n                    <div className=\"absolute bottom-full left-0 mb-6 max-w-md p-4 bg-zinc-950 border border-zinc-900 rounded-[2rem] flex items-center gap-4 shadow-2xl\">\n                      <div className=\"w-12 h-12 rounded-2xl bg-black border border-zinc-900 flex items-center justify-center text-orange-500 shrink-0\">\n                        <FileArchive className=\"w-6 h-6\" />\n                      </div>\n                      <div className=\"min-w-0\">\n                        <div className=\"text-xs font-black truncate\">{chatAttachment.name}</div>\n                        <div className=\"text-[9px] text-zinc-600 uppercase tracking-widest\">{Math.max(1, Math.round(chatAttachment.size / 1024))} KB</div>\n                      </div>\n                      <button onClick={() => setChatAttachment(null)} className=\"p-2 hover:text-rose-500 transition-colors\">\n                        <X className=\"w-5 h-5\" />\n                      </button>\n                    </div>\n                  )}\n                  <textarea""",
)
replace_exact(
    'src/App.tsx',
    '                      onChange={handleChatImageUpload}\n                      accept="image/*"',
    '                      onChange={handleChatAttachmentUpload}',
)

# Public client portal: live token-scoped message refresh and attachments in both directions.
replace_exact(
    'src/components/SharePortal.tsx',
    '  Clock, Download, Globe, Lock, MessageSquare, Music, Pause, Play,\n  Send, Sparkles, ThumbsDown, ThumbsUp, Volume2,',
    '  Clock, Download, FileArchive, Globe, Lock, MessageSquare, Music, Paperclip, Pause, Play,\n  Send, Sparkles, ThumbsDown, ThumbsUp, Volume2, X,',
)
replace_exact(
    'src/components/SharePortal.tsx',
    "import type { Playlist, ShareLink, Track } from '../types';",
    "import type { Message, Playlist, ShareLink, Track } from '../types';",
)
replace_exact(
    'src/components/SharePortal.tsx',
    "  const [comment, setComment] = useState('');\n  const [localComments, setLocalComments] = useState<Array<{ id: string; user: string; text: string; time: string }>>([]);",
    "  const [comment, setComment] = useState('');\n  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(null);\n  const [liveMessages, setLiveMessages] = useState<Message[]>([]);\n  const [localComments, setLocalComments] = useState<Array<{ id: string; user: string; text: string; time: string; attachment_url?: string | null; attachment_name?: string | null }>>([]);",
)
replace_exact(
    'src/components/SharePortal.tsx',
    "  useEffect(() => {\n    if (!activeTrack && playlistTracks.length) setActiveTrack(playlistTracks[0]);\n  }, [activeTrack, playlistTracks]);",
    """  useEffect(() => {\n    if (!activeTrack && playlistTracks.length) setActiveTrack(playlistTracks[0]);\n  }, [activeTrack, playlistTracks]);\n\n  useEffect(() => {\n    let cancelled = false;\n    const refreshMessages = async () => {\n      try {\n        const next = await dataStore.getPublicShareMessages(shareLink.token);\n        if (!cancelled) setLiveMessages(next);\n      } catch (error) {\n        console.warn('[SharePortal] Message refresh failed', error);\n      }\n    };\n    void refreshMessages();\n    const timer = window.setInterval(refreshMessages, 5000);\n    return () => {\n      cancelled = true;\n      window.clearInterval(timer);\n    };\n  }, [shareLink.token]);""",
)
replace_regex(
    'src/components/SharePortal.tsx',
    r"  const handleComment = async \(event: React\.FormEvent\) => \{.*?\n  \};",
    """  const handleComment = async (event: React.FormEvent) => {\n    event.preventDefault();\n    const content = comment.trim();\n    if ((!content && !selectedAttachment) || !activeTrack) return;\n    if (selectedAttachment && selectedAttachment.size > 100 * 1024 * 1024) {\n      addToast('Message attachments are limited to 100 MB.', 'error');\n      return;\n    }\n    const optimistic = {\n      id: `local-${Date.now()}`,\n      user: 'Industry Client',\n      text: content || selectedAttachment?.name || 'Attachment',\n      time: 'Just now',\n    };\n    setLocalComments((prev) => [optimistic, ...prev]);\n    setComment('');\n    try {\n      let attachment = {};\n      if (selectedAttachment) {\n        const uploaded = await dataStore.uploadPublicShareAttachment(shareLink.token, selectedAttachment);\n        attachment = {\n          attachment_key: uploaded.objectKey,\n          attachment_name: selectedAttachment.name,\n          attachment_type: selectedAttachment.type || 'application/octet-stream',\n          attachment_size: selectedAttachment.size,\n        };\n      }\n      if (isPublicPortal()) {\n        await postPublic({ type: 'comment', track_id: activeTrack.id, content, ...attachment });\n      } else {\n        await addActivity({\n          type: 'message',\n          user: `Industry Client${shareLink.recipient_email ? ` (${shareLink.recipient_email})` : ''}`,\n          action: 'commented on',\n          target: activeTrack.name,\n          details: content || selectedAttachment?.name || 'Attachment',\n          client_id: shareLink.client_id,\n          track_id: activeTrack.id,\n          playlist_id: playlist?.id,\n        });\n        if (shareLink.client_id) {\n          await sendMessage(shareLink.client_id, `[Feedback on ${activeTrack.name}]: ${content}`, null, 'inbound', attachment as any);\n        }\n      }\n      setSelectedAttachment(null);\n      const next = await dataStore.getPublicShareMessages(shareLink.token).catch(() => []);\n      if (next.length) setLiveMessages(next);\n    } catch (error: any) {\n      addToast(`Comment could not be recorded: ${error?.message || error}`, 'error');\n    }\n  };""",
)
replace_exact(
    'src/components/SharePortal.tsx',
    "  const conversationMessages = useMemo(() => messages\n    .filter((message) => {",
    """  const conversationMessages = useMemo(() => {\n    const merged = new Map<string, Message>();\n    [...messages, ...liveMessages].forEach((message) => merged.set(message.id, message));\n    return Array.from(merged.values())\n    .filter((message) => {""",
)
replace_exact(
    'src/components/SharePortal.tsx',
    "      time: new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),\n    })), [messages, shareLink.client_id]);",
    """      time: new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),\n      attachment_url: message.attachment_url,\n      attachment_name: message.attachment_name,\n    }));\n  }, [messages, liveMessages, shareLink.client_id]);""",
)
replace_regex(
    'src/components/SharePortal.tsx',
    r"              <form onSubmit=\{handleComment\} className=\"space-y-3\">.*?\n              </form>",
    """              <form onSubmit={handleComment} className=\"space-y-3\">\n                <label className=\"text-[10px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2\"><MessageSquare className=\"w-4 h-4\" /> Mix Notes</label>\n                <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={4000} rows={4} placeholder=\"Leave time-stamped creative or revision notes...\" className=\"w-full bg-black border border-zinc-800 rounded-2xl p-4 text-sm outline-none focus:border-orange-500 resize-none\" />\n                {selectedAttachment && (\n                  <div className=\"flex items-center gap-3 rounded-xl border border-zinc-800 bg-black p-3\">\n                    <FileArchive className=\"w-5 h-5 text-orange-500 shrink-0\" />\n                    <span className=\"min-w-0 flex-1 truncate text-xs\">{selectedAttachment.name}</span>\n                    <button type=\"button\" onClick={() => setSelectedAttachment(null)} className=\"p-1 text-zinc-500 hover:text-rose-500\"><X className=\"w-4 h-4\" /></button>\n                  </div>\n                )}\n                <div className=\"flex gap-3\">\n                  <label className=\"flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-800 px-4 py-3 text-xs font-black uppercase tracking-widest hover:border-orange-500\">\n                    <Paperclip className=\"w-4 h-4\" /> Attach\n                    <input type=\"file\" className=\"hidden\" onChange={(event) => {\n                      const file = event.target.files?.[0] || null;\n                      event.target.value = '';\n                      if (!file) return;\n                      if (file.size > 100 * 1024 * 1024) { addToast('Message attachments are limited to 100 MB.', 'error'); return; }\n                      setSelectedAttachment(file);\n                    }} />\n                  </label>\n                  <button type=\"submit\" disabled={(!comment.trim() && !selectedAttachment) || !activeTrack} className=\"flex-1 bg-orange-500 text-black rounded-xl px-4 py-3 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-40\"><Send className=\"w-4 h-4\" /> Send Feedback</button>\n                </div>\n              </form>""",
)
replace_exact(
    'src/components/SharePortal.tsx',
    "                  <div key={item.id} className=\"bg-black/60 border border-zinc-900 rounded-2xl p-4\"><div className=\"flex items-center justify-between mb-2\"><span className=\"text-[10px] font-black uppercase text-orange-500\">{item.user}</span><span className=\"text-[9px] text-zinc-700\">{item.time}</span></div><p className=\"text-sm text-zinc-300 leading-relaxed\">{item.text}</p></div>",
    """                  <div key={item.id} className=\"bg-black/60 border border-zinc-900 rounded-2xl p-4\"><div className=\"flex items-center justify-between mb-2\"><span className=\"text-[10px] font-black uppercase text-orange-500\">{item.user}</span><span className=\"text-[9px] text-zinc-700\">{item.time}</span></div><p className=\"text-sm text-zinc-300 leading-relaxed\">{item.text}</p>{item.attachment_url && <a href={item.attachment_url} target=\"_blank\" rel=\"noreferrer\" download={item.attachment_name || undefined} className=\"mt-3 flex items-center gap-2 rounded-xl border border-zinc-800 px-3 py-2 text-xs font-black text-orange-400\"><FileArchive className=\"w-4 h-4\" />{item.attachment_name || 'Download attachment'}</a>}</div>""",
)

print('Messaging UI patch applied.')
