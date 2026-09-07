from pathlib import Path


def load(p): return Path(p).read_text()
def save(p, s): Path(p).write_text(s)
def one(s, old, new, label):
    if s.count(old) != 1: raise RuntimeError(f'{label}: expected 1 match, got {s.count(old)}')
    return s.replace(old, new, 1)
def cut(s, start, end, label):
    a = s.find(start); b = s.find(end, a + len(start)) if a >= 0 else -1
    if a < 0 or b < 0: raise RuntimeError(f'{label}: markers not found')
    return s[:a] + s[b:]

# MediaStore: remove local DSP and legacy /api/analyze routing.
p='src/context/MediaStoreContext.tsx'; s=load(p)
s=one(s, "import { analyzeAudioDsp } from '@/src/services/audioDsp';\n", '', 'DSP import')
s=one(s, "  analyzeTrack: (name: string, duration?: number, file?: File | null, fileUrl?: string | null) => Promise<{ bpm: number; key: string; duration?: number; tags?: string[] }>;\n  analysisEngine: 'ai' | 'dsp';\n  setAnalysisEngine: (engine: 'ai' | 'dsp') => void;\n", '', 'analysis interface')
s=one(s, "  const [analysisEngine, setAnalysisEngine] = useState<'ai' | 'dsp'>(() => readJson('ogbeatz_analysis_engine', 'dsp'));\n", '', 'analysis state')
s=cut(s, '\n  const analyzeTrack = async ', '\n  const uploadFile = async ', 'analyzeTrack block')
s=cut(s, '\n  const handleSetAnalysisEngine = ', '\n  const handleSetEnableMockData = ', 'engine setter')
s=one(s, "      shareLinks, addShareLink, deleteShareLink, getShareContent, addActivity, analyzeTrack,\n      analysisEngine, setAnalysisEngine: handleSetAnalysisEngine, messages, sendMessage,\n", "      shareLinks, addShareLink, deleteShareLink, getShareContent, addActivity,\n      messages, sendMessage,\n", 'provider values')
for x in ('analyzeAudioDsp','analysisEngine','setAnalysisEngine',"fetch('/api/analyze'",'analyzeTrack:'):
    if x in s: raise RuntimeError(f'MediaStore still contains {x}')
save(p,s)

# Edit Metadata: re-analyze through shared AWS Music Intelligence.
p='src/components/EditTrackModal.tsx'; s=load(p)
s=one(s, "import { formatLrcTime, parseLrc, convertJsonToLrc } from '../utils/lrcParser';\n", "import { formatLrcTime, parseLrc, convertJsonToLrc } from '../utils/lrcParser';\nimport { runManualTrackAnalysis } from '../services/musicIntelligence';\nimport { profileToLegacyTrackUpdates } from '../services/musicIntelligenceCore';\n", 'AWS imports')
s=one(s, "  const { uploadFile, analyzeTrack, addToast } = useMediaStore();\n", "  const { uploadFile, updateTrack, addToast } = useMediaStore();\n", 'store destructure')
mark=s.find('              {/* Dynamic Reanalyze Track Button */}')
a=s.find('                onClick={async () => {', mark); b=s.find('                className={`', a)
if min(mark,a,b) < 0: raise RuntimeError('reanalyze handler markers not found')
handler='''                onClick={async () => {\n                  setAnalyzing(true);\n                  addToast(`Starting AWS Music Intelligence for "${formData.name}"...`, "info");\n                  try {\n                    const analysisTrack = { ...track, ...formData } as Track;\n                    const profile = await runManualTrackAnalysis(analysisTrack, updateTrack);\n                    const legacyUpdates = profileToLegacyTrackUpdates(profile, formData.tags || []);\n                    setFormData(prev => ({ ...prev, ...legacyUpdates, status: 'ready' }));\n                    addToast("AWS Music Intelligence succeeded. Metadata fields updated.", "success");\n                  } catch (err: any) {\n                    console.error("AWS Music Intelligence failed:", err);\n                    addToast(`Analysis failed: ${err.message || err}`, "error");\n                  } finally {\n                    setAnalyzing(false);\n                  }\n                }}\n'''
s=s[:a]+handler+s[b:]
s=one(s,'                    Reanalyze Track with Gemini AI\n','                    Re-Analyze with AWS Music Intelligence\n','button label')
if 'analyzeTrack' in s: raise RuntimeError('EditTrackModal still references analyzeTrack')
save(p,s)

# App: remove local/Gemini engine chooser and comparison cards.
p='src/App.tsx'; s=load(p)
s=one(s,'    analysisEngine,\n    setAnalysisEngine,\n','', 'App engine destructure')
start='          <div className="flex items-center gap-1.5 bg-zinc-900/60 p-1 rounded-2xl border border-zinc-800 self-stretch lg:self-auto shadow-inner shrink-0">'
a=s.find(start); c=s.find('              Cognitive AI',a); end='\n          </div>\n        </div>\n\n        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-zinc-900/70">'; b=s.find(end,c)
if min(a,c,b)<0: raise RuntimeError('top engine selector markers not found')
s=s[:a]+s[b+len('\n          </div>'):]
start='        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-zinc-900/70">'; a=s.find(start); c=s.find('Cognitive AI (Gemini Agent)',a); end='\n        </div>\n      </div>'; b=s.find(end,c)
if min(a,c,b)<0: raise RuntimeError('engine cards markers not found')
s=s[:a]+s[b+len('\n        </div>'):]
if '<Cpu' not in s: s=s.replace('  Cpu,\n','',1)
for x in ('analysisEngine','setAnalysisEngine','Web Audio DSP (Local Engine)','Cognitive AI (Gemini Agent)','>Web Audio DSP<'):
    if x in s: raise RuntimeError(f'App still contains {x}')
save(p,s)
print('AWS-only analysis patch applied')
