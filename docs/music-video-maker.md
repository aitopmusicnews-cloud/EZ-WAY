# Music Video Maker

The Video page opens the browser adaptation of the supplied MusicVideoMaker Python app. Choose a JPG/PNG and an MP3/WAV, or use an existing library track, then select **Create MP4**. The entire song plays under the still image. The output is H.264/AAC MP4 with preview, download, and the existing Video Library save/cloud-sync flow.

**Original Video Studio** retains the previous lyrics, soundwaves, watermark, social sizes, duration settings, and lyric tools. Its Stems tab has been removed. Video Library remains available alongside both makers.

The simple maker uses single-thread FFmpeg WebAssembly on the user's device. No new API or Python server is required. It does not require SharedArrayBuffer or cross-origin isolation. `npm run dev` and `npm run build` copy the pinned FFmpeg core files into `public/video-engine`; deploy the complete `dist` directory including `video-engine` and worker assets. Do not redirect those assets to HTML. The engine is about 32 MB, loaded only when conversion starts.

Inputs are limited to 20 MB artwork and 250 MB audio. Large files can exceed a browser's available memory; cancellation terminates the worker and releases its memory. Artwork keeps its aspect ratio and is fitted within 1920×1080 with even dimensions for MP4 compatibility. No artwork is cropped. Keep the page open during conversion. A finished result can be downloaded immediately; cloud-sync warnings come from the existing Video Library.

The original desktop script is the workflow reference; Tkinter cannot run directly inside a web page.
