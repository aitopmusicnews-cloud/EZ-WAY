from pathlib import Path

path = Path('src/components/ShareModal.tsx')
text = path.read_text()

old_handler = """  const handleGmailShare = () => {\n    if (!shareLink) return;\n    try {\n      window.location.assign(gmailShareUrl);\n    } catch (error) {\n      console.error('[ShareModal] Gmail navigation failed', error);\n      addToast('Gmail could not be opened. Copy the share link and paste it into Gmail.', 'error');\n    }\n  };\n\n"""

old_button = """                      <button\n                        type=\"button\"\n                        onClick={handleGmailShare}\n                        className=\"flex flex-col items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-white h-20 rounded-2xl text-[8px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all\"\n                      >\n                        <Mail className=\"w-5 h-5 text-orange-500\" /> Gmail\n                      </button>\n"""

new_link = """                      <a\n                        href={gmailShareUrl}\n                        target=\"_top\"\n                        rel=\"noopener noreferrer\"\n                        className=\"flex flex-col items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-white h-20 rounded-2xl text-[8px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all\"\n                      >\n                        <Mail className=\"w-5 h-5 text-orange-500\" /> Gmail\n                      </a>\n"""

if old_handler not in text:
    raise SystemExit('expected Gmail handler block not found')
if old_button not in text:
    raise SystemExit('expected Gmail button block not found')

text = text.replace(old_handler, '', 1).replace(old_button, new_link, 1)

if 'window.location.assign(gmailShareUrl)' in text or 'handleGmailShare' in text:
    raise SystemExit('legacy Gmail JS navigation remains')
if 'href={gmailShareUrl}' not in text or 'target="_top"' not in text:
    raise SystemExit('native Gmail top-level link was not installed')

path.write_text(text)
print('Applied native Gmail top-level link')
