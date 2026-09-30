import { mkdir, copyFile } from 'node:fs/promises';
// Host the single-thread engine with the app; no CDN or cross-origin isolation required.
const target = new URL('../public/video-engine/', import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  await copyFile(new URL(`../node_modules/@ffmpeg/core/dist/esm/${name}`, import.meta.url), new URL(name, target));
}
