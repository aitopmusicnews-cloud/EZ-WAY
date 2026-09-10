export interface TrackBundleMediaRefreshInput {
  objectKey?: string | null;
  url?: string | null;
}

export interface TrackBundleMediaRefreshResult {
  url: string;
  objectKey?: string | null;
}

interface ResolveTrackBundleAssetOptions {
  label: string;
  data?: Blob | null;
  objectKey?: string | null;
  url?: string | null;
  refreshMediaUrl: (input: TrackBundleMediaRefreshInput) => Promise<TrackBundleMediaRefreshResult>;
  fetchBlob: (url: string) => Promise<Blob>;
}

export async function resolveTrackBundleAsset({
  label,
  data,
  objectKey,
  url,
  refreshMediaUrl,
  fetchBlob,
}: ResolveTrackBundleAssetOptions): Promise<Blob | null> {
  if (data) return data;
  if (!objectKey && !url) return null;

  try {
    const refreshed = await refreshMediaUrl({
      objectKey: objectKey || null,
      url: url || null,
    });
    if (!refreshed?.url) throw new Error('No fresh media URL was returned.');
    return await fetchBlob(refreshed.url);
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
    throw new Error(`Could not include ${label} in the track download.${detail}`);
  }
}
