import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Only these explicitly public configuration groups may enter browser bundles.
  // Server secrets such as GEMINI_API_KEY never use one of these prefixes.
  // Google OAuth client IDs are public identifiers; client secrets never use this prefix.
  envPrefix: [
    'VITE_ALBUM_COVER_API_',
    'VITE_AUDIO_TOOLS_',
    'VITE_COGNITO_',
    'VITE_EZWAY_API_',
    'VITE_GOOGLE_CLIENT_',
    'VITE_MUSIC_INTELLIGENCE_API_',
  ],
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    target: ['es2020', 'safari14'],
    cssTarget: ['chrome80', 'firefox72', 'safari14', 'edge80'],
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
