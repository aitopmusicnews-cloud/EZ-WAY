import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(
  root,
  'node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist',
);
const destination = resolve(root, 'public/transformers-wasm');
const files = [
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
];

await mkdir(destination, { recursive: true });
await Promise.all(files.map((filename) => (
  copyFile(resolve(source, filename), resolve(destination, filename))
)));

console.log(`[copy-transformers-wasm] copied ${files.length} runtime files to public/transformers-wasm`);
