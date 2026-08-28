import { dataStore } from '../services/dataStore';

const metaEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env || {});

/**
 * Temporary compatibility names for the existing Settings UI.
 * No Supabase SDK, URL, key, or database credential exists in this module.
 * The facade exposes only fixed AWS diagnostics counts and rejects unknown tables.
 */
export const supabaseUrl = String(metaEnv.VITE_EZWAY_API_URL || '').trim();
export const supabaseAnonKey = '';

const KNOWN_TABLES = new Set([
  'tracks',
  'playlists',
  'clients',
  'share_links',
  'messages',
  'profiles',
  'activities',
  'promo_videos',
  'promo_packs',
  'todos',
]);

const unknownTable = (table: string) => ({
  data: null,
  count: null,
  error: { code: '42P01', message: `Unknown EZ-WAY table: ${table}` },
});

async function readTableCount(table: string) {
  if (!KNOWN_TABLES.has(table)) return unknownTable(table);
  try {
    const diagnostics = await dataStore.diagnostics();
    return {
      data: [],
      count: Number(diagnostics.tables?.[table] || 0),
      error: null,
    };
  } catch (error: any) {
    return {
      data: null,
      count: null,
      error: { code: 'AWS_DIAGNOSTICS', message: error?.message || 'AWS diagnostics failed.' },
    };
  }
}

function readOnlyTable(table: string) {
  return {
    select(..._args: unknown[]) {
      return {
        limit: async (..._limitArgs: unknown[]) => readTableCount(table),
        single: async (..._singleArgs: unknown[]) => {
          const result = await readTableCount(table);
          return { ...result, data: null };
        },
      };
    },
  };
}

export const supabase = {
  from(table: string) {
    return readOnlyTable(String(table || '').trim());
  },
};

export async function getSupabaseClient(..._args: unknown[]) {
  return supabase;
}
