import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appSource = fs.readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const shellSource = fs.readFileSync(new URL('../components/Shell.tsx', import.meta.url), 'utf8');
const voiceSource = fs.readFileSync(new URL('../components/VoiceAssistant.tsx', import.meta.url), 'utf8');
const typesSource = fs.readFileSync(new URL('../types.ts', import.meta.url), 'utf8');

test('retired ghost features are absent from the active UI and source tree', () => {
  assert.equal(appSource.includes('ReleasesHub'), false, 'ReleasesHub must not be imported or rendered');
  assert.equal(appSource.includes('activeView === "releases"'), false, 'releases route must not remain');
  assert.equal(/watermark/i.test(voiceSource), false, 'VoiceAssistant must not retain watermark UI or commands');
  assert.equal(fs.existsSync(new URL('../components/ReleasesHub.tsx', import.meta.url)), false, 'ReleasesHub.tsx must be deleted');
  assert.equal(fs.existsSync(new URL('../components/WatermarkRemover.tsx', import.meta.url)), false, 'WatermarkRemover.tsx must be deleted');
});

test('stale settings and synthetic system-status placeholders are removed', () => {
  for (const label of [
    'Supabase Cloud Connection',
    'Live Database Catalog Explorer',
    'Two-Factor Auth',
    'Storage Usage',
    'Database Latency',
    'API Uptime',
    'Cloud Sync Active',
  ]) {
    assert.equal(appSource.includes(label), false, `${label} placeholder must be removed`);
  }
  assert.equal(appSource.includes('./lib/supabase'), false, 'App must not depend on the Supabase compatibility facade');
  assert.equal(fs.existsSync(new URL('../lib/supabase.ts', import.meta.url)), false, 'obsolete Supabase compatibility facade must be deleted');
});

test('navigation uses a shared typed view contract for retained features', () => {
  assert.match(typesSource, /export type AppView\s*=/, 'types.ts must export AppView');
  assert.match(typesSource, /'copyrights'/, 'AppView must include copyrights');
  assert.match(typesSource, /'albumcover'/, 'AppView must include albumcover');
  assert.equal(typesSource.includes("'releases'"), false, 'AppView must not include removed releases route');
  assert.equal(typesSource.includes("'watermark'"), false, 'AppView must not include removed watermark route');
  assert.equal(shellSource.includes('onViewChange: (view: any)'), false, 'Shell navigation must not use any');
  assert.equal(voiceSource.includes('onViewChange: (view: any)'), false, 'VoiceAssistant navigation must not use any');
});

test('unused Flux integration is not present in application source', () => {
  const sourceFiles = [appSource, shellSource, voiceSource, typesSource];
  assert.equal(sourceFiles.some((source) => /\bflux\b/i.test(source)), false, 'Flux must not be reintroduced into retained app surfaces');
});
