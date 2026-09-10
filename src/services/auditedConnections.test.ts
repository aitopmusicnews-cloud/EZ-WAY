import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Gemini credentials stay on the server and are never compiled into the browser', () => {
  const vite = read('../../vite.config.ts');
  const browserService = read('./geminiService.ts');

  assert.doesNotMatch(vite, /process\.env\.GEMINI_API_KEY/);
  assert.match(vite, /envPrefix:\s*\[/);
  assert.doesNotMatch(vite, /envPrefix:\s*["']VITE_["']/);
  assert.doesNotMatch(browserService, /VITE_GEMINI_API_KEY|process\.env\.GEMINI_API_KEY|new GoogleGenAI/);
});

test('missing YouTube and Spotify credentials return honest configuration errors', () => {
  const server = read('../../server.ts');

  assert.doesNotMatch(server, /mock_google_oauth_code_ogbeatz|simulated_access_token_beatz_master_101/);
  assert.doesNotMatch(server, /mock_spotify_oauth_code_ogbeatz|simulated_spotify_access_token_beatz_master_99/);
  assert.doesNotMatch(server, /let cName = "OG BEATZ OFFICIAL"|let pName = "OG BEATZ MASTER"/);
  assert.match(server, /YouTube OAuth is not configured/);
  assert.match(server, /Spotify OAuth is not configured/);
});

test('production YouTube connection uses the browser OAuth bridge and never exposes the Google client secret', () => {
  const vite = read('../../vite.config.ts');
  const wrapper = read('../components/YouTubeHub.tsx');
  const browserService = read('./youtubeBrowser.ts');

  assert.match(vite, /VITE_GOOGLE_CLIENT_/);
  assert.match(wrapper, /createYouTubeFetchBridge/);
  assert.match(wrapper, /preloadGoogleIdentityServices/);
  assert.match(wrapper, /YOUTUBE_OAUTH_SENTINEL_URL/);
  assert.doesNotMatch(wrapper, /GOOGLE_CLIENT_SECRET/);
  assert.doesNotMatch(browserService, /GOOGLE_CLIENT_SECRET/);
  assert.match(browserService, /VITE_GOOGLE_CLIENT_ID/);
});

test('YouTube publishing refuses to pretend an upload succeeded while disconnected', () => {
  const youtube = read('../components/YouTubeHubLegacy.tsx');

  assert.doesNotMatch(youtube, /Demonstrating simulated delivery|fakeNewVideo|was successfully hosted to your linked channel|resData\.videoId \|\| "dQw4w9WgXcQ"/);
  assert.match(youtube, /Connect your YouTube channel before publishing/);
});

test('Edit Metadata uses the browser-local lyrics engine and never invents lyrics', () => {
  const app = read('../App.tsx');
  const modal = read('../components/EditTrackModal.tsx');
  const server = read('../../server.ts');

  assert.doesNotMatch(app, /POLLINATIONS_USER_KEY|POLLINATIONS_AUTH_SUCCESS|Successfully linked your custom Pollinations account/);
  assert.match(modal, /runLocalAudioTool\(formData, 'lyrics'/);
  assert.doesNotMatch(modal, /transcribe-lyrics-pollinations|POLLINATIONS_USER_KEY|Synthesized custom-themed track lyrics/);
  assert.doesNotMatch(server, /\/api\/(?:generate-lyrics|transcribe-lyrics-pollinations|align-lyrics)|generateDynamicFallbackLyrics|getPerfectLyricsForTrack|gen\.pollinations\.ai\/v1\/audio\/transcriptions|Fallback aligner \(spread lines evenly\)/);
});
