import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modalSource = readFileSync(new URL('../components/PromoPackModal.tsx', import.meta.url), 'utf8');
const dataStoreSource = readFileSync(new URL('./dataStore.ts', import.meta.url), 'utf8');
const handlerSource = readFileSync(new URL('../../aws/app-data/api/handler.mjs', import.meta.url), 'utf8');
const migrationSource = readFileSync(new URL('../../aws/app-data/migrations/003_promo_pack_track_unique.sql', import.meta.url), 'utf8');
const templateSource = readFileSync(new URL('../../aws/app-data/template.yaml', import.meta.url), 'utf8');

test('Promo Pack reads and writes through the AWS data API', () => {
  assert.match(modalSource, /dataStore\.getPromoPack\(track\.id\)/);
  assert.match(modalSource, /dataStore\.putPromoPack\(track\.id/);
  assert.match(dataStoreSource, /\/promo-packs\/\$\{encoded\(trackId\)\}/);
  assert.match(handlerSource, /ON CONFLICT \(track_id\) DO UPDATE/);
  assert.match(migrationSource, /CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_packs_track_id_unique/);
  assert.match(templateSource, /Path: \/promo-packs\/\{trackId\}[\s\S]*?Method: GET/);
  assert.match(templateSource, /Path: \/promo-packs\/\{trackId\}[\s\S]*?Method: PUT/);
});
