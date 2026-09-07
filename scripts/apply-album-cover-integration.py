from pathlib import Path

path = Path('src/components/EditTrackModal.tsx')
text = path.read_text()

old_import = "import { X, Save, Image as ImageIcon, Trash2, Loader2, Sparkles, Key, LogIn, LogOut, Shuffle, Lock, Download, Play, Pause, Clock } from 'lucide-react';"
new_import = "import { X, Save, Image as ImageIcon, Trash2, Loader2, Sparkles, Download, Play, Pause, Clock } from 'lucide-react';"
if old_import not in text:
    raise SystemExit('Expected EditTrackModal lucide import was not found')
text = text.replace(old_import, new_import, 1)

state_start = text.find('  // Cover Gen States')
handler_start = text.find('  const handleDownloadArtwork', state_start)
if state_start < 0 or handler_start < 0:
    raise SystemExit('Could not locate cover-generator state/handler block')
text = text[:state_start] + text[handler_start:]

text = text.replace('Edit Metadata & Cover Studio', 'Edit Metadata', 1)
text = text.replace('{/* Artwork Upload & AI Cover Studio Column */}', '{/* Artwork Upload Column */}', 1)

class_start = text.find('              className={`bg-zinc-90 w-full')
class_end_marker = '            >\n              {formData.image_url ? ('
class_end = text.find(class_end_marker, class_start)
if class_start < 0 or class_end < 0:
    raise SystemExit('Could not locate dynamic artwork aspect class')
static_class = '              className="bg-zinc-90 w-full rounded-2xl border border-zinc-800 flex flex-col items-center justify-center cursor-pointer hover:border-orange-500 group overflow-hidden relative shadow-inner shadow-black/60 min-h-[200px] transition-all bg-zinc-900/50 aspect-square"\n'
text = text[:class_start] + static_class + text[class_end:]

widget_start = text.find('            {/* AI Cover Art Generator Widget */}')
form_fields = text.find('          {/* Form Fields */}', widget_start)
if widget_start < 0 or form_fields < 0:
    raise SystemExit('Could not locate AI Cover Studio widget boundaries')
column_close = text.rfind('          </div>\n\n', widget_start, form_fields)
if column_close < 0:
    raise SystemExit('Could not preserve artwork-column closing tag')
text = text[:widget_start] + text[column_close:]

for forbidden in (
    'enter.pollinations.ai',
    'gen.pollinations.ai',
    'VITE_POLLINATIONS_CLIENT_ID',
    'pollinationsKeyConnected',
    'flux-realism',
    'flux-anime',
    'handleGenerateAiArt',
    'aiPrompt',
    'aiModel',
    'aiAspect',
    'aiSeed',
    'artStyle',
):
    if forbidden in text:
        raise SystemExit(f'Cover-generator token still present: {forbidden}')

for required in (
    '>Edit Metadata</h2>',
    'handleDownloadArtwork',
    'imageInputRef',
    'transcribe-lyrics-pollinations',
    'Re-Analyze with AWS Music Intelligence',
):
    if required not in text:
        raise SystemExit(f'Required retained behavior missing: {required}')

path.write_text(text)
print('EditTrackModal cover-generator cleanup applied successfully')
