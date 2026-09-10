from pathlib import Path

MARKER = '[track-media-patch-complete]'


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    if old not in text:
        if new in text:
            return
        raise SystemExit(f'Expected patch anchor not found in {path}: {old[:120]!r}')
    target.write_text(text.replace(old, new, 1))


replace_once(
    'aws/app-data/api/handler.mjs',
    "import { presignRead, presignUpload } from './storage.mjs';",
    "import { presignRead, presignUpload, resolveMediaObjectKey } from './storage.mjs';",
)
replace_once(
    'aws/app-data/api/handler.mjs',
    "    if (method === 'POST' && rawPath === '/uploads/presign') return response(event, 200, await presignUpload(parseBody(event)));",
    "    if (method === 'POST' && rawPath === '/uploads/presign') return response(event, 200, await presignUpload(parseBody(event)));\n    if (method === 'POST' && rawPath === '/media/read-url') {\n      const objectKey = resolveMediaObjectKey(parseBody(event));\n      return response(event, 200, { url: await presignRead(objectKey), object_key: objectKey });\n    }",
)
replace_once(
    'aws/app-data/template.yaml',
    "        PublicShareGet:\n          Type: HttpApi",
    "        MediaReadUrl:\n          Type: HttpApi\n          Properties:\n            ApiId: !Ref EzwayHttpApi\n            Path: /media/read-url\n            Method: POST\n        PublicShareGet:\n          Type: HttpApi",
)
replace_once(
    'src/services/dataStore.ts',
    "      deletePromoVideo: configurationError, uploadFile: configurationError, getPublicShare: configurationError,",
    "      deletePromoVideo: configurationError, uploadFile: configurationError, refreshMediaUrl: configurationError, getPublicShare: configurationError,",
)
replace_once(
    'src/services/dataStore.ts',
    "    async uploadPublicShareAttachment(token: string, file: File): Promise<{ url: string; objectKey: string }> {",
    "    async refreshMediaUrl(input: { objectKey?: string | null; url?: string | null }): Promise<{ url: string; objectKey: string | null }> {\n      const refreshed = await request<{ url: string; object_key?: string | null }>('/media/read-url', jsonInit('POST', {\n        objectKey: input.objectKey || null,\n        url: input.url || null,\n      }));\n      return { url: refreshed.url, objectKey: refreshed.object_key || input.objectKey || null };\n    },\n\n    async uploadPublicShareAttachment(token: string, file: File): Promise<{ url: string; objectKey: string }> {",
)
replace_once(
    'src/App.tsx',
    'import { Track, ShareLink, Client, Playlist, AppView } from "./types";',
    'import { Track, ShareLink, Client, Playlist, AppView } from "./types";\nimport { dataStore } from "./services/dataStore";\nimport { resolveTrackBundleAsset } from "./services/trackBundleMedia";',
)
old_bundle = '''          if (track.file_data) {
            trackFolder.file(sanitizedAudioName, track.file_data);
          } else if (track.file_url) {
            try {
              const audioBlob = await fetchWithProxyFallback(track.file_url);
              trackFolder.file(sanitizedAudioName, audioBlob);
            } catch (err) {
              console.warn(`Could not bundle audio for track ${track.name}:`, err);
            }
          }

          // 4. Fetch Artwork and Append if Available
          let artBlob: Blob | null = null;
          if (track.image_data) {
            artBlob = track.image_data;
          } else if (track.image_url) {
            try {
              artBlob = await fetchWithProxyFallback(track.image_url);
            } catch (err) {
              console.warn(`Could not fetch artwork for track ${track.name}:`, err);
            }
          }
'''
new_bundle = '''          const audioBlob = await resolveTrackBundleAsset({
            label: `audio for ${track.name || "Untitled"}`,
            data: track.file_data,
            objectKey: track.file_key,
            url: track.file_url,
            refreshMediaUrl: dataStore.refreshMediaUrl,
            fetchBlob: fetchWithProxyFallback,
          });
          if (audioBlob) trackFolder.file(sanitizedAudioName, audioBlob);

          // 4. Fetch Artwork and Append if Available. Permanent object keys are
          // refreshed at download time so old signed URLs never make artwork disappear.
          const artBlob = await resolveTrackBundleAsset({
            label: `artwork for ${track.name || "Untitled"}`,
            data: track.image_data,
            objectKey: track.image_key,
            url: track.image_url,
            refreshMediaUrl: dataStore.refreshMediaUrl,
            fetchBlob: fetchWithProxyFallback,
          });
'''
replace_once('src/App.tsx', old_bundle, new_bundle)
