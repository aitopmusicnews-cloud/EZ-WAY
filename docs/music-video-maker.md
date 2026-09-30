# Music Video Maker

The Video page has one maker using the new FFmpeg MP4 engine, plus Video Library. The previous separate studio and canvas/MediaRecorder rendering path have been removed.

Choose JPG/PNG artwork and MP3/WAV audio, or select a library track and use its artwork. Customize:

- YouTube 16:9, TikTok/Reels/Shorts 9:16, Instagram 1:1 or 4:5, and X 4:3 sizes.
- Full song, 15, 30, or 60 seconds; clips never outlast the song.
- Audio-reactive soundwave and official brand watermark.
- Timestamped LRC lyrics, imported or edited in the maker; white, gradient, or outline styles and an optional large centered layout.
- Synced lyric generation through the existing Lyric Optimizer service, with manual import/paste available independently. Lyrics can be saved to the selected library track. No stem extraction is requested by this maker.
- Custom output filename, preview, MP4 download, cancellation, and Video Library saving through the existing cloud-sync flow.

Lyrics, waveform and watermark are burned into the H.264 video, and the original song is encoded as AAC. Artwork is fitted without cropping; space around it is black. There is no separate original-app tab and no stems control.

Conversion uses single-thread FFmpeg WebAssembly on the user's device. No additional video API or Python server is needed. `npm run dev` and `npm run build` copy engine and Roboto font assets into `public/video-engine`; deploy the complete `dist` directory including these files and worker assets. The engine loads when conversion starts. The font license is copied alongside it.

Limits: 20 MB artwork and 250 MB audio. Large files and full-HD overlays can require substantial memory and time. Keep the page open while rendering. Automatic lyrics still require the existing Lyric Optimizer service; LRC import and rendering do not.
