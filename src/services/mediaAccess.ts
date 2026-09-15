import { getIdToken, restoreSession } from './auth.ts';

export interface MediaAccessInput {
  objectKey?: string | null;
  url?: string | null;
}

export interface MediaAccessResult {
  url: string;
  objectKey: string | null;
}

export type MediaUrlRefresher = (input: MediaAccessInput) => Promise<MediaAccessResult>;

export interface MediaAccessApiOptions {
  apiBase: string;
  getToken?: () => string | null;
  restoreAuth?: () => Promise<boolean>;
  fetchImpl?: typeof fetch;
}

const cleanBase = (value: unknown) => String(value ?? '').trim().replace(/\/+$/, '');
const metaEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env || {});

export function createMediaAccessResolver(refresh: MediaUrlRefresher) {
  return async (input: MediaAccessInput): Promise<MediaAccessResult> => {
    const objectKey = String(input.objectKey || '').trim() || null;
    const url = String(input.url || '').trim() || null;

    if (!objectKey) {
      if (!url) throw new Error('Media has no available source.');
      return { url, objectKey: null };
    }

    return refresh({ objectKey, url });
  };
}

export function createMediaAccessApiResolver(options: MediaAccessApiOptions) {
  const apiBase = cleanBase(options.apiBase);
  const tokenProvider = options.getToken || getIdToken;
  const authRestorer = options.restoreAuth || restoreSession;
  const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);

  return createMediaAccessResolver(async (input) => {
    if (!apiBase || !fetchImpl) {
      if (input.url) return { url: input.url, objectKey: input.objectKey || null };
      throw new Error('EZ-WAY media API is not configured.');
    }

    let authRefreshUsed = false;
    const send = async (): Promise<MediaAccessResult> => {
      let token = tokenProvider();
      if (!token && !authRefreshUsed) {
        authRefreshUsed = true;
        const restored = await authRestorer();
        token = restored ? tokenProvider() : null;
      }
      if (!token) throw new Error('Owner sign-in is required to refresh media.');

      const response = await fetchImpl(`${apiBase}/media/read-url`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          objectKey: input.objectKey || null,
          url: input.url || null,
        }),
      });

      if (response.status === 401 && !authRefreshUsed) {
        authRefreshUsed = true;
        const restored = await authRestorer();
        if (restored && tokenProvider()) return send();
      }
      if (!response.ok) throw new Error(`EZ-WAY media refresh failed (${response.status}).`);

      const body = await response.json() as { url?: string; object_key?: string | null };
      const refreshedUrl = String(body.url || '').trim();
      if (!refreshedUrl) throw new Error('EZ-WAY media refresh returned no URL.');
      return {
        url: refreshedUrl,
        objectKey: body.object_key || input.objectKey || null,
      };
    };

    return send();
  });
}

export const resolveMediaAccess = createMediaAccessApiResolver({
  apiBase: metaEnv.VITE_EZWAY_API_URL || '',
});
